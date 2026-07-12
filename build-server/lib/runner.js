const { spawn } = require('child_process')
const { publishLog } = require('./logger')

function runCommand(cmdString, cwd) {
    return new Promise((resolve, reject) => {
        publishLog(`$ ${cmdString}`)
        console.log(`\n$ ${cmdString}`)

        // SECURITY: Strip sensitive infrastructure secrets from the user's build environment!
        // Otherwise, a malicious package.json could steal your AWS keys and API tokens.
        const safeEnv = { ...process.env }
        const secretsToScrub = [
            'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 
            'S3_BUCKET', 'REDIS_URL', 'API_SERVICE_TOKEN', 'API_SERVER_URL',
            'GITHUB_TOKEN'
        ]
        secretsToScrub.forEach(secret => delete safeEnv[secret])

        // Pass the entire cmdString directly to spawn since shell: true handles parsing!
        const child = spawn(cmdString, [], { cwd, shell: true, env: safeEnv })

        child.stdout.on('data', (data) => {
            const msg = data.toString()
            process.stdout.write(msg)
            publishLog(msg)
        })

        child.stderr.on('data', (data) => {
            const msg = data.toString()
            process.stderr.write(msg)
            publishLog(msg)
        })

        child.on('close', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`"${cmdString}" exited with code ${code}`))
        })

        child.on('error', reject)
    })
}

module.exports = { runCommand }
