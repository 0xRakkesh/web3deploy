import { Hono } from 'hono'
import { AwsClient } from 'aws4fetch'

type Bindings = {
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  BUCKET_NAME: string;
};

const app = new Hono<{ Bindings: Bindings }>()

app.get("*", async (c) => {
  const host = c.req.header("Host")
  if (!host) {
    return c.text("No Host Found", 400)
  }

  const projectID = host.split(".")[0]

  let path = c.req.path

  if (path === "/") {
    path = "/index.html"
  }

  let s3url = `https://${c.env.BUCKET_NAME}.s3.${c.env.AWS_REGION}.amazonaws.com/__outputs/${projectID}${path}`

  const aws = new AwsClient({
    accessKeyId: c.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
    region: c.env.AWS_REGION,
    service: 's3'
  })

  const cache = caches.default
  const parsedUrl = new URL(c.req.url)
  parsedUrl.search = ''
  const cacheKey = parsedUrl.toString()

  let response = await cache.match(cacheKey)

  if (!response) {
    response = await aws.fetch(s3url)
    if (response.status === 404) {
      s3url = `https://${c.env.BUCKET_NAME}.s3.${c.env.AWS_REGION}.amazonaws.com/__outputs/${projectID}/index.html`
      response = await aws.fetch(s3url)
    }
    if (response.ok) {
      response = new Response(response.body, response)

      if (path.endsWith(".html") || path === "/") {
        response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate')
      } else {
        response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      }

      c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
    }
  }

  return response
})

export default app