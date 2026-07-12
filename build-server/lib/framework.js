const fs = require('fs')
const path = require('path')
const { publishLog } = require('./logger')

function detectNextStaticExport(projectPath) {
    const candidates = [
        'next.config.js',
        'next.config.mjs',
        'next.config.ts',
        'next.config.cjs'
    ]
    for (const file of candidates) {
        const filePath = path.join(projectPath, file)
        if (!fs.existsSync(filePath)) continue
        try {
            const content = fs.readFileSync(filePath, 'utf-8')
            if (/output\s*:\s*['"`]export['"`]/.test(content)) return true
        } catch (_) { }
    }
    return false
}

async function detectFramework(projectPath) {
    const pkgPath = path.join(projectPath, 'package.json')

    if (!fs.existsSync(pkgPath)) {
        return { framework: 'static', installCmd: null, buildCmd: null, outputDir: '.', isStatic: true }
    }

    const config = {
        framework: 'node (generic)',
        installCmd: 'npm install',
        buildCmd: 'npm run build',
        outputDir: 'dist',
        isStatic: false
    }

    try {
        const { listFrameworks } = await import('@netlify/framework-info')
        const frameworks = await listFrameworks({ projectDir: projectPath })

        if (frameworks && frameworks.length > 0) {
            const fw = frameworks[0]
            config.framework = fw.id || fw.name
            
            if (fw.build && fw.build.directory) {
                config.outputDir = fw.build.directory
            }

            if (fw.id === 'next') {
                if (detectNextStaticExport(projectPath)) {
                    config.framework = 'nextjs (static export)'
                    config.outputDir = 'out'
                } else {
                    const err = new Error("Next.js projects must be configured for Static HTML Export because this infrastructure does not support SSR or API routes. Please add `output: 'export'` to your next.config.js")
                    err.isFatal = true
                    throw err
                }
            }
        }
    } catch (err) {
        if (err.isFatal) throw err
        publishLog('Warning: failed to use @netlify/framework-info — falling back to generic node')
    }

    return config
}

module.exports = { detectFramework }
