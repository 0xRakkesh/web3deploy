require('dotenv').config()
const fs = require('fs')
const path = require('path')

const { publishLog, ensureRedisReady, quitRedis } = require('./lib/logger')
const { uploadFolder } = require('./lib/s3')
const { runCommand } = require('./lib/runner')
const { detectFramework } = require('./lib/framework')

const PROJECT_ID = process.env.PROJECT_ID
if (!PROJECT_ID) {
    console.error('FATAL: PROJECT_ID environment variable is not set.')
    process.exit(1)
}

const ROOT_DIR = process.env.ROOT_DIR || ''
const PROJECT_ROOT = ROOT_DIR
    ? path.join(__dirname, 'output', ROOT_DIR)
    : path.join(__dirname, 'output')

const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID
const API_SERVICE_TOKEN = process.env.API_SERVICE_TOKEN
const API_SERVER_URL = process.env.API_SERVER_URL

async function updateDeploymentStatus(status, deployedUrl = null) {
    if (!DEPLOYMENT_ID || !API_SERVICE_TOKEN || !API_SERVER_URL) return
    try {
        // Strip trailing slash if present on API_SERVER_URL
        const baseUrl = API_SERVER_URL.endsWith('/') ? API_SERVER_URL.slice(0, -1) : API_SERVER_URL
        await fetch(`${baseUrl}/deployments/${DEPLOYMENT_ID}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_SERVICE_TOKEN}`
            },
            body: JSON.stringify({
                status,
                ...(deployedUrl && { deployment_url: deployedUrl })
            })
        })
    } catch (err) {
        console.error('Failed to update deployment status on API:', err.message)
    }
}

async function init() {
    console.log('=== w3deploy build-server starting ===')
    await ensureRedisReady()
    publishLog('Build Started...')
    await updateDeploymentStatus('building')

    // Inject user-defined environment variables into the project root
    const envVarsStr = process.env.ENV_VARS
    if (envVarsStr && envVarsStr.trim() !== '') {
        try {
            const parsed = JSON.parse(envVarsStr)
            const envLines = Object.entries(parsed)
                .map(([k, v]) => `${k}="${v}"`)
                .join('\n')
            fs.writeFileSync(path.join(PROJECT_ROOT, '.env'), envLines)
            publishLog('Injected user environment variables into .env')
        } catch (e) {
            publishLog(`Warning: Failed to parse user ENV_VARS: ${e.message}`)
        }
    }

    const detected = await detectFramework(PROJECT_ROOT)

    const config = {
        framework:  process.env.FRAMEWORK        || detected.framework,
        installCmd: process.env.INSTALL_COMMAND  || detected.installCmd,
        buildCmd:   process.env.BUILD_COMMAND    || detected.buildCmd,
        outputDir:  process.env.OUTPUT_DIR       || detected.outputDir,
        isStatic:   detected.isStatic && !process.env.BUILD_COMMAND
    }

    const divider = '─────────────────────────────────────────'
    publishLog(divider)
    publishLog(`  Framework       : ${config.framework}`)
    publishLog(`  Root Directory  : ${ROOT_DIR || '/ (repo root)'}`)
    publishLog(`  Install Command : ${config.installCmd || '(none)'}`)
    publishLog(`  Build Command   : ${config.buildCmd   || '(none)'}`)
    publishLog(`  Output Dir      : ${config.outputDir}`)
    publishLog(divider)

    try {
        const deployedUrl = `https://${PROJECT_ID}.web3deploy.me`

        if (config.isStatic) {
            publishLog('Static site detected — skipping install & build')
            const { uploaded, failed } = await uploadFolder(PROJECT_ROOT)
            publishLog(divider)
            publishLog(`Uploaded: ${uploaded} file(s)${failed ? `, ${failed} failed` : ''}`)
            publishLog(`Deployed: ${deployedUrl}`)
            publishLog('Done')
            await updateDeploymentStatus('success', deployedUrl)
        } else {
            if (config.installCmd) {
                publishLog('Installing dependencies...')
                await runCommand(config.installCmd, PROJECT_ROOT)
                publishLog('Dependencies installed successfully')
            }

            if (config.buildCmd) {
                publishLog('Building project...')
                await runCommand(config.buildCmd, PROJECT_ROOT)
                publishLog('Build completed successfully')
            }

            const outputPath = config.outputDir === '.'
                ? PROJECT_ROOT
                : path.join(PROJECT_ROOT, config.outputDir)

            if (!fs.existsSync(outputPath)) {
                throw new Error(
                    `Output directory "${config.outputDir}" was not found at: ${outputPath}\n` +
                    `  • Verify your build command creates this folder\n` +
                    `  • Or set OUTPUT_DIR to the correct folder name (e.g. OUTPUT_DIR=build)`
                )
            }

            publishLog(`Uploading from "${config.outputDir}/"...`)
            const { uploaded, failed } = await uploadFolder(outputPath)
            publishLog(divider)
            publishLog(`Uploaded: ${uploaded} file(s)${failed ? `, ${failed} failed` : ''}`)
            publishLog(`Deployed: ${deployedUrl}`)
            publishLog('Done')
            await updateDeploymentStatus('success', deployedUrl)
        }
    } catch (err) {
        console.error('\n[ERROR]', err.message)
        publishLog(`error: ${err.message}`)
        await updateDeploymentStatus('failed')
        await quitRedis()
        process.exit(1)
    }

    console.log('=== Done ===')
    await quitRedis()
}

init()