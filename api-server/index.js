require('dotenv').config()
const express = require('express')
const cors = require('cors')

const Redis = require('ioredis')

const app = express()
app.use(cors())
app.use(express.json())

const path = require('path')

const PORT = process.env.PORT || 9000


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

    // ── Trigger GitHub Actions workflow ─────────────────────────────────────────
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN
    const GITHUB_ORG_REPO = process.env.GITHUB_ORG_REPO || '0xRakkesh/web3deploy'

    if (!GITHUB_TOKEN) {
        console.error(`[deploy] Missing GITHUB_TOKEN in env! Builds will fail.`)
    }

    console.log(`\n[deploy] Starting build for: ${projectId}`)
    console.log(`[deploy] git: ${gitRepoUrl}`)
    console.log(`[deploy] Triggering GitHub Actions on ${GITHUB_ORG_REPO}\n`)

    fetch(`https://api.github.com/repos/${GITHUB_ORG_REPO}/actions/workflows/build.yml/dispatches`, {
        method: 'POST',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'w3deploy-api-server'
        },
        body: JSON.stringify({
            ref: 'main',
            inputs: {
                projectId,
                gitRepoUrl,
                rootDir,
                framework,
                installCommand,
                buildCommand,
                outputDir
            }
        })
    }).then(async (response) => {
        if (!response.ok) {
            const errBody = await response.text()
            console.error(`[deploy] GitHub Actions trigger failed: ${response.status} ${errBody}`)
        } else {
            console.log(`[deploy] Successfully triggered GitHub Actions for ${projectId}`)
        }
    }).catch(err => {
        console.error(`[deploy] Error calling GitHub API:`, err.message)
    })

    const PROXY_DOMAIN = process.env.PROXY_DOMAIN || 'localhost:8000'
    const protocol = PROXY_DOMAIN.startsWith('localhost') ? 'http' : 'https'

    return res.status(202).json({
        status:    'queued',
        projectId,
        logsUrl:   `GET /project/${projectId}/logs`,
        previewUrl: `${protocol}://${projectId}.${PROXY_DOMAIN}`
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