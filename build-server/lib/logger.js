const Redis = require('ioredis')

const REDIS_URL = process.env.REDIS_URL
if (!REDIS_URL) {
    console.error('FATAL: REDIS_URL environment variable is not set.')
    process.exit(1)
}

const PROJECT_ID = process.env.PROJECT_ID
if (!PROJECT_ID) {
    console.error('FATAL: PROJECT_ID environment variable is not set.')
    process.exit(1)
}

const isTLS = REDIS_URL.startsWith('rediss://')
const publisher = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    tls: isTLS ? { rejectUnauthorized: false } : undefined
})

publisher.on('error', (err) => {
    console.error('Redis connection error:', err.message)
})

function publishLog(log) {
    const message = String(log ?? '')
    const chunks = message.split(/\r\n|\n|\r/g).filter((line, idx, arr) => {
        if (line !== '') return true
        return idx < arr.length - 1
    })

    for (const chunk of chunks) {
        const logEntry = JSON.stringify({ log: chunk })
        const key = `logs:${PROJECT_ID}`
        publisher
            .multi()
            .rpush(key, logEntry)
            .expire(key, 86400) // expire logs after 24 hours
            .exec()
            .catch((err) => {
                console.error('Failed to publish log chunk:', err.message)
            })
    }
}

async function ensureRedisReady() {
    if (publisher.status === 'ready') return
    await publisher.ping()
}

async function quitRedis() {
    await publisher.quit()
}

module.exports = { publishLog, ensureRedisReady, quitRedis }
