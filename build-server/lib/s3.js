const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const fs = require('fs')
const path = require('path')
const mime = require('mime-types')
const { publishLog } = require('./logger')

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
})

const PROJECT_ID = process.env.PROJECT_ID

function toS3Key(filePath) {
    return filePath.replace(/\\/g, '/')
}

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

module.exports = { uploadFolder }
