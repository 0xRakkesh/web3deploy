require('dotenv').config()
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const Redis = require('ioredis')

// ── Redis ─────────────────────────────────────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL
if (!REDIS_URL) {
    console.error('FATAL: REDIS_URL environment variable is not set.')
    process.exit(1)
}

// Auto-detect TLS: Upstash and most cloud Redis providers use rediss:// (TLS).
// Setting maxRetriesPerRequest to 3 means it fails fast (not 20 retries) if
// the connection is wrong, giving a clear error instead of a long hang.
const isTLS = REDIS_URL.startsWith('rediss://')
const publisher = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    tls: isTLS ? { rejectUnauthorized: false } : undefined
})

publisher.on('error', (err) => {
    console.error('Redis connection error:', err.message)
})


// ── S3 ────────────────────────────────────────────────────────────────────────
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
})

// ── Runtime config ────────────────────────────────────────────────────────────
const PROJECT_ID = process.env.PROJECT_ID
if (!PROJECT_ID) {
    console.error('FATAL: PROJECT_ID environment variable is not set.')
    process.exit(1)
}

// Root of the cloned repo, honouring ROOT_DIR for monorepos (e.g. ROOT_DIR=frontend)
const ROOT_DIR = process.env.ROOT_DIR || ''
const PROJECT_ROOT = ROOT_DIR
    ? path.join(__dirname, 'output', ROOT_DIR)
    : path.join(__dirname, 'output')

// ── Utilities ─────────────────────────────────────────────────────────────────
function publishLog(log) {
    const message = String(log ?? '')
    const chunks = message.split(/\r\n|\n|\r/g).filter((line, idx, arr) => {
        // Keep intentional empty lines only when they are not trailing split artifacts.
        if (line !== '') return true
        return idx < arr.length - 1
    })

    for (const chunk of chunks) {
        publisher
            .publish(`logs:${PROJECT_ID}`, JSON.stringify({ log: chunk }))
            .catch((err) => {
                console.error('Failed to publish log chunk:', err.message)
            })
    }
}

async function ensureRedisReady() {
    if (publisher.status === 'ready') return
    await publisher.ping()
}

/** Normalise OS path separators to forward slashes for S3 keys. */
function toS3Key(filePath) {
    return filePath.replace(/\\/g, '/')
}

// ── Framework detection ───────────────────────────────────────────────────────

/**
 * Return true if the Next.js config file contains `output: 'export'`,
 * which means the project uses static HTML export → output goes to `out/`.
 */
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
            // Match:  output: 'export'  /  output: "export"  /  output: `export`
            if (/output\s*:\s*['"`]export['"`]/.test(content)) return true
        } catch (_) { /* ignore read errors */ }
    }
    return false
}

/**
 * Inspect the cloned project and return a build config object.
 *
 * Priority order matters — more-specific frameworks are checked first.
 *
 * @returns {{
 *   framework: string,
 *   installCmd: string|null,
 *   buildCmd: string|null,
 *   outputDir: string,
 *   isStatic: boolean
 * }}
 */
function detectFramework(projectPath) {
    const pkgPath = path.join(projectPath, 'package.json')

    // ── No package.json → plain static HTML/CSS/JS site ──────────────────────
    if (!fs.existsSync(pkgPath)) {
        return { framework: 'static', installCmd: null, buildCmd: null, outputDir: '.', isStatic: true }
    }

    let pkg = {}
    try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    } catch (_) {
        publishLog('Warning: could not parse package.json — treating as static site')
        return { framework: 'static', installCmd: null, buildCmd: null, outputDir: '.', isStatic: true }
    }

    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
    const has  = (name) => Boolean(deps[name])
    const hasFile = (...names) => names.some((n) => fs.existsSync(path.join(projectPath, n)))

    // Helper to build a standard config
    const cfg = (framework, outputDir, buildCmd = 'npm run build') => ({
        framework,
        installCmd: 'npm install',
        buildCmd,
        outputDir,
        isStatic: false
    })

    // ── Next.js (check before generic React/Vite) ─────────────────────────────
    if (has('next') || hasFile('next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs')) {
        const isExport = detectNextStaticExport(projectPath)
        return {
            ...cfg(isExport ? 'nextjs (static export)' : 'nextjs', isExport ? 'out' : '.next'),
            ...(isExport ? {} : {})   // .next is for SSR — user may need OUTPUT_DIR=out override
        }
    }

    // ── Nuxt ──────────────────────────────────────────────────────────────────
    if (has('nuxt') || has('nuxt3') || hasFile('nuxt.config.js', 'nuxt.config.ts', 'nuxt.config.mjs')) {
        return cfg('nuxt', 'dist', 'npm run generate')
    }

    // ── Gatsby ────────────────────────────────────────────────────────────────
    if (has('gatsby')) {
        return cfg('gatsby', 'public')
    }

    // ── Angular ───────────────────────────────────────────────────────────────
    if (has('@angular/core') || hasFile('angular.json')) {
        return cfg('angular', 'dist')
    }

    // ── SvelteKit (check before plain Svelte) ─────────────────────────────────
    if (has('@sveltejs/kit')) {
        return cfg('sveltekit', 'build')
    }

    // ── Astro ─────────────────────────────────────────────────────────────────
    if (has('astro') || hasFile('astro.config.mjs', 'astro.config.js', 'astro.config.ts')) {
        return cfg('astro', 'dist')
    }

    // ── Svelte + Vite ─────────────────────────────────────────────────────────
    if (has('svelte') && has('vite')) {
        return cfg('svelte-vite', 'dist')
    }

    // ── React + Vite (check before plain Vite) ────────────────────────────────
    if ((has('react') || has('react-dom')) && has('vite')) {
        return cfg('react-vite', 'dist')
    }

    // ── Vue + Vite ────────────────────────────────────────────────────────────
    if (has('vue') && has('vite')) {
        return cfg('vue-vite', 'dist')
    }

    // ── Vue CLI ───────────────────────────────────────────────────────────────
    if (has('@vue/cli-service') || has('vue')) {
        return cfg('vue-cli', 'dist')
    }

    // ── React CRA (react-scripts) ─────────────────────────────────────────────
    if (has('react-scripts')) {
        return cfg('react-cra', 'build')
    }

    // ── Vite (generic) ────────────────────────────────────────────────────────
    if (has('vite') || hasFile('vite.config.js', 'vite.config.ts', 'vite.config.mjs')) {
        return cfg('vite', 'dist')
    }

    // ── Generic Node project ──────────────────────────────────────────────────
    return cfg('node (generic)', 'dist')
}

// ── Command runner ────────────────────────────────────────────────────────────
/**
 * Spawn a shell command, streaming stdout/stderr to logs in real time.
 * Uses spawn (not exec) to avoid buffering limits on large builds.
 */
function runCommand(cmdString, cwd) {
    return new Promise((resolve, reject) => {
        publishLog(`$ ${cmdString}`)
        console.log(`\n$ ${cmdString}`)

        const [exe, ...args] = cmdString.split(/\s+/)
        const child = spawn(exe, args, { cwd, shell: true, env: process.env })

        child.stdout.on('data', (data) => {
            const msg = data.toString()
            process.stdout.write(msg)
            publishLog(msg)
        })

        child.stderr.on('data', (data) => {
            const msg = data.toString()
            process.stderr.write(msg)
            publishLog(msg)   // many build tools write progress to stderr — don't prefix as error
        })

        child.on('close', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`"${cmdString}" exited with code ${code}`))
        })

        child.on('error', reject)
    })
}

// ── S3 uploader ───────────────────────────────────────────────────────────────
async function uploadFolder(folderPath) {
    const allEntries = fs.readdirSync(folderPath, { recursive: true })
    const files = allEntries.filter((f) => !fs.lstatSync(path.join(folderPath, f)).isDirectory())

    publishLog(`Uploading ${files.length} file(s)...`)
    let uploaded = 0
    let failed   = 0

    for (const file of files) {
        const filePath    = path.join(folderPath, file)
        const s3Key       = `__outputs/${PROJECT_ID}/${toS3Key(file)}`
        const contentType = mime.lookup(filePath) || 'application/octet-stream'

        publishLog(`uploading ${file}`)
        console.log('uploading', filePath)

        try {
            await s3Client.send(new PutObjectCommand({
                Bucket:      process.env.S3_BUCKET || 'vercel-clone-outputs',
                Key:         s3Key,
                Body:        fs.createReadStream(filePath),
                ContentType: contentType
            }))
            uploaded++
            publishLog(`uploaded ${file}`)
        } catch (err) {
            failed++
            publishLog(`error: failed to upload ${file} — ${err.message}`)
            console.error(`Failed to upload ${file}:`, err.message)
        }
    }

    return { uploaded, failed }
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function init() {
    console.log('=== w3deploy build-server starting ===')
    await ensureRedisReady()
    publishLog('Build Started...')

    // 1. Auto-detect framework
    const detected = detectFramework(PROJECT_ROOT)

    // 2. Apply env var overrides (same as Vercel "Project Settings" UI)
    const config = {
        framework:  process.env.FRAMEWORK        || detected.framework,
        installCmd: process.env.INSTALL_COMMAND  || detected.installCmd,
        buildCmd:   process.env.BUILD_COMMAND    || detected.buildCmd,
        outputDir:  process.env.OUTPUT_DIR       || detected.outputDir,
        // isStatic only if auto-detected AND no build command override
        isStatic:   detected.isStatic && !process.env.BUILD_COMMAND
    }

    // 3. Print Vercel-style build summary
    const divider = '─────────────────────────────────────────'
    publishLog(divider)
    publishLog(`  Framework       : ${config.framework}`)
    publishLog(`  Root Directory  : ${ROOT_DIR || '/ (repo root)'}`)
    publishLog(`  Install Command : ${config.installCmd || '(none)'}`)
    publishLog(`  Build Command   : ${config.buildCmd   || '(none)'}`)
    publishLog(`  Output Dir      : ${config.outputDir}`)
    publishLog(divider)

    try {
        if (config.isStatic) {
            // ── Static site: skip build, upload source files directly ──────────
            publishLog('Static site detected — skipping install & build')
            const { uploaded, failed } = await uploadFolder(PROJECT_ROOT)
            publishLog(`${divider}`)
            publishLog(`Done — ${uploaded} uploaded, ${failed} failed`)
        } else {
            // ── Step 1: Install ────────────────────────────────────────────────
            if (config.installCmd) {
                publishLog('Installing dependencies...')
                await runCommand(config.installCmd, PROJECT_ROOT)
                publishLog('Dependencies installed successfully')
            }

            // ── Step 2: Build ──────────────────────────────────────────────────
            if (config.buildCmd) {
                publishLog('Building project...')
                await runCommand(config.buildCmd, PROJECT_ROOT)
                publishLog('Build completed successfully')
            }

            // ── Step 3: Resolve & validate output directory ────────────────────
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

            // ── Step 4: Upload to S3 ───────────────────────────────────────────
            publishLog(`Uploading from "${config.outputDir}/"...`)
            const { uploaded, failed } = await uploadFolder(outputPath)
            publishLog(divider)
            publishLog(`Done — ${uploaded} uploaded, ${failed} failed`)
        }
    } catch (err) {
        console.error('\n[ERROR]', err.message)
        publishLog(`error: ${err.message}`)
        publisher.disconnect()
        process.exit(1)
    }

    console.log('=== Done ===')
    publisher.disconnect()
}

init()