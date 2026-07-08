require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { spawn } = require('child_process')
const Redis = require('ioredis')

const app = express()
app.use(cors())
app.use(express.json())

const path = require('path')

const PORT = process.env.PORT || 9000
const BUILD_SERVER_IMAGE  = process.env.BUILD_SERVER_IMAGE || 'build-server'
// Absolute path to build-server/.env — Docker reads all secrets (AWS, Redis, S3) from here.
// Override via BUILD_SERVER_ENV_FILE in api-server/.env if your folder layout differs.
const BUILD_SERVER_ENV_FILE = process.env.BUILD_SERVER_ENV_FILE
    || path.resolve(__dirname, '..', 'build-server', '.env')

// ── Redis helper ──────────────────────────────────────────────────────────────
// A Redis connection in subscribe mode is dedicated — it can ONLY subscribe.
// So we create a fresh connection per SSE stream request, and destroy it on close.
function createRedisSubscriber() {
    const url = process.env.REDIS_URL
    const isTLS = url.startsWith('rediss://')
    return new Redis(url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        tls: isTLS ? { rejectUnauthorized: false } : undefined
    })
}

// ── POST /project ─────────────────────────────────────────────────────────────
// Kick off a build by spinning up a local Docker container.
// The container clones the repo, builds it, and uploads the result to S3.
// All build logs are published to Redis → client reads them via GET /project/:id/logs
//
// Body: {
//   projectId    : string  (required) — unique name, used as S3 folder and subdomain
//   gitRepoUrl   : string  (required) — GitHub / GitLab / Bitbucket URL
//   rootDir      : string  (optional) — subdirectory for monorepos e.g. "frontend"
//   framework    : string  (optional) — force preset e.g. "nextjs-static"
//   installCommand : string (optional) — override install step e.g. "npm ci"
//   buildCommand : string  (optional) — override build  step e.g. "npm run build:prod"
//   outputDir    : string  (optional) — override output folder e.g. "out"
// }
app.post('/project', async (req, res) => {
    const {
        projectId,
        gitRepoUrl,
        rootDir        = '',
        framework      = '',
        installCommand = '',
        buildCommand   = '',
        outputDir      = ''
    } = req.body

    if (!projectId || !gitRepoUrl) {
        return res.status(400).json({
            error: 'projectId and gitRepoUrl are both required'
        })
    }

    // ── Build the docker run command ──────────────────────────────────────────
    // Secrets (AWS keys, Redis URL, S3 bucket) come from build-server/.env via
    // --env-file so they never appear in logs or process listings.
    // Only the dynamic per-deployment values are passed as individual -e flags.
    const dockerArgs = [
        'run',
        '--rm',
        '--name', `deploy-${projectId}-${Date.now()}`,  // unique name avoids conflicts
        '--env-file', BUILD_SERVER_ENV_FILE,             // ← secrets loaded from file
    ]

    // Dynamic values that change per deployment
    const dynamicEnv = {
        GIT_REPO_URL:    gitRepoUrl,
        PROJECT_ID:      projectId,
        ROOT_DIR:        rootDir,
        FRAMEWORK:       framework,
        INSTALL_COMMAND: installCommand,
        BUILD_COMMAND:   buildCommand,
        OUTPUT_DIR:      outputDir
    }

    for (const [key, value] of Object.entries(dynamicEnv)) {
        if (value) dockerArgs.push('-e', `${key}=${value}`)
    }

    dockerArgs.push(BUILD_SERVER_IMAGE)

    console.log(`\n[deploy] Starting build for: ${projectId}`)
    console.log(`[deploy] git: ${gitRepoUrl}`)           // no secrets in logs
    console.log(`[deploy] env-file: ${BUILD_SERVER_ENV_FILE}\n`)

    // Spawn the container detached so it runs in the background independently.
    // stdio: 'ignore' because all logs flow through Redis — we don't need stdout here.
    const docker = spawn('docker', dockerArgs, {
        detached: true,
        stdio:    'ignore'
    })

    // Unref so Node doesn't wait for the child process before exiting
    docker.unref()

    docker.on('error', (err) => {
        // This fires if docker binary is not found or similar OS-level issues
        console.error(`[deploy] Docker spawn error for ${projectId}:`, err.message)
    })

    return res.status(202).json({
        status:    'queued',
        projectId,
        logsUrl:   `GET /project/${projectId}/logs`,
        previewUrl: `http://${projectId}.localhost:8000`
    })
})

// ── GET /project/:projectId/logs ──────────────────────────────────────────────
// SSE endpoint — subscribes to Redis pub/sub and streams every log line to the
// client in real time as it happens. The connection stays open until the build
// finishes ("Done") or errors out.
//
// SSE is the simplest real-time streaming protocol — plain HTTP, no WebSockets,
// works in Postman, curl, and browsers natively.
//
// Each event:  data: {"log":"..."}\n\n
app.get('/project/:projectId/logs', (req, res) => {
    const { projectId } = req.params
    const channel    = `logs:${projectId}`
    const subscriber = createRedisSubscriber()

    // ── SSE headers ───────────────────────────────────────────────────────────
    res.setHeader('Content-Type',       'text/event-stream')
    res.setHeader('Cache-Control',      'no-cache')
    res.setHeader('Connection',         'keep-alive')
    res.setHeader('X-Accel-Buffering',  'no')  // disable nginx buffering
    res.setHeader('Content-Encoding',   'none')
    res.flushHeaders()                          // push headers to client immediately
    if (res.socket) res.socket.setNoDelay(true)
    res.write(': connected\n\n')

    // Keep the stream active through proxies/load balancers that may buffer idle SSE.
    const heartbeat = setInterval(() => {
        res.write(': keepalive\n\n')
        if (typeof res.flush === 'function') res.flush()
    }, 10000)

    // ── Helper: write one SSE event ───────────────────────────────────────────
    // res.flush() forces the chunk out immediately — no server-side buffering.
    const send = (log) => {
        res.write(`data: ${JSON.stringify({ log })}\n\n`)
        if (typeof res.flush === 'function') res.flush()
    }

    // ── Subscribe to the project's Redis channel ──────────────────────────────
    subscriber.subscribe(channel, (err) => {
        if (err) {
            send(`error: Could not subscribe to Redis — ${err.message}`)
            subscriber.disconnect()
            return res.end()
        }
        console.log(`[logs] SSE stream opened for ${channel}`)
    })

    // ── Forward every Redis pub/sub message as an SSE event ───────────────────
    subscriber.on('message', (_ch, raw) => {
        try {
            const { log } = JSON.parse(raw)
            send(log)

            // Close the stream automatically when the build is done or failed
            const isDone  = log.trim() === 'Done'
            const isError = /^error:/i.test(log.trim())

            if (isDone || isError) {
                setTimeout(() => {
                    clearInterval(heartbeat)
                    subscriber.disconnect()
                    res.end()
                }, 200)
            }
        } catch (_) {
            send(raw)
        }
    })

    subscriber.on('error', (err) => {
        console.error(`[logs] Redis error on ${channel}:`, err.message)
        send(`error: Redis — ${err.message}`)
    })

    // ── Clean up when client disconnects (cancel in Postman, close tab, etc.) ─
    req.on('close', () => {
        console.log(`[logs] SSE stream closed for ${channel}`)
        clearInterval(heartbeat)
        subscriber.disconnect()
    })
})

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.listen(PORT, () => {
    console.log(`API Server running on http://localhost:${PORT}`)
    console.log(`  POST /project           — start a deployment`)
    console.log(`  GET  /project/:id/logs  — stream build logs (SSE)`)
})