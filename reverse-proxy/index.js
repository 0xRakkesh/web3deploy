require('dotenv').config()
const express = require('express')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 8000

// ── S3 Client (private — bucket stays locked down) ────────────────────────────
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
})

const S3_BUCKET = process.env.S3_BUCKET || 'vercel-clone-outputs'
const BASE_PREFIX = '__outputs'

// ── Helper: stream a file from S3 to the browser ─────────────────────────────
async function serveFromS3(res, s3Key) {
    try {
        const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key })
        const s3Response = await s3Client.send(command)

        // Set correct Content-Type so browser renders HTML/CSS/JS properly
        const contentType = mime.lookup(s3Key) || 'application/octet-stream'
        res.setHeader('Content-Type', contentType)

        // Stream the S3 body directly to the HTTP response
        s3Response.Body.pipe(res)
    } catch (err) {
        if (err.name === 'NoSuchKey') {
            return null  // signal "not found"
        }
        throw err
    }
}

// ── Main proxy handler ────────────────────────────────────────────────────────
app.use(async (req, res) => {
    try {
        // Extract project ID from subdomain: portfolio.yourdomain.com → portfolio
        const hostname = req.hostname
        const projectId = hostname.split('.')[0]

        // The requested path, e.g.  /assets/index-CQSBhMRy.css  or  /
        let filePath = req.path

        // Exact root request → serve index.html
        if (filePath === '/') {
            filePath = '/index.html'
        }

        // Build the S3 key:  __outputs/<projectId>/assets/index.css
        const s3Key = `${BASE_PREFIX}/${projectId}${filePath}`

        console.log(`[${projectId}] ${req.method} ${req.path} → s3://${S3_BUCKET}/${s3Key}`)

        // Try serving the exact file first
        const found = await serveFromS3(res, s3Key)

        // If file not found AND it looks like a SPA client-side route (no extension),
        // fall back to index.html so React Router / Vue Router works correctly
        if (found === null) {
            const hasExtension = path.extname(filePath) !== ''
            if (!hasExtension) {
                const indexKey = `${BASE_PREFIX}/${projectId}/index.html`
                const fallback = await serveFromS3(res, indexKey)
                if (fallback === null) {
                    res.status(404).send('Not Found')
                }
            } else {
                res.status(404).send('Not Found')
            }
        }
    } catch (err) {
        console.error('Proxy error:', err.message)
        res.status(500).send('Internal Server Error')
    }
})

app.listen(PORT, () => console.log(`Reverse Proxy running on port ${PORT}`))