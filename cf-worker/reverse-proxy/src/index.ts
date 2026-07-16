import { Hono } from 'hono'
import { AwsClient } from 'aws4fetch'

type Bindings = {
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  BUCKET_NAME: string;
};

function renderError(status: number, message: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${status}: ${message}</title>
  <style>
    body { color: #000; background: #fff; margin: 0; }
    .next-error-h1 { border-right: 1px solid rgba(0,0,0,.3); }
    @media (prefers-color-scheme: dark) {
      body { color: #fff; background: #000; }
      .next-error-h1 { border-right: 1px solid rgba(255,255,255,.3); }
    }
  </style>
</head>
<body>
  <div style="font-family:-apple-system,BlinkMacSystemFont,Roboto,Segoe UI,Fira Sans,Avenir,Helvetica Neue,Lucida Grande,sans-serif;height:100vh;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div>
      <h1 class="next-error-h1" style="display:inline-block;margin:0 20px 0 0;padding-right:23px;font-size:24px;font-weight:500;vertical-align:top;line-height:49px">${status}</h1>
      <div style="display:inline-block;text-align:left;line-height:49px;height:49px;vertical-align:middle">
        <h2 style="font-size:14px;font-weight:400;line-height:49px;margin:0">${message}</h2>
      </div>
    </div>
  </div>
</body>
</html>`
}

const app = new Hono<{ Bindings: Bindings }>()

app.on(['GET', 'HEAD'], "*", async (c) => {
  const host = c.req.header("Host")
  if (!host) {
    return c.html(renderError(400, "Missing Host header"), 400)
  }

  const projectID = host.split(".")[0]
  
  if (!projectID || !/^[a-zA-Z0-9-]+$/.test(projectID)) {
    return c.html(renderError(400, "Invalid Project ID"), 400)
  }

  let path = c.req.path

  try {
    let decodedPath = decodeURIComponent(path)
    while (decodedPath !== decodeURIComponent(decodedPath)) {
      decodedPath = decodeURIComponent(decodedPath)
    }
    
    if (decodedPath.includes("..")) {
      return c.html(renderError(403, "Path Traversal Detected"), 403)
    }
  } catch (e) {
    return c.html(renderError(400, "Malformed URL"), 400)
  }

  path = path.replace(/\/+/g, '/')

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
  parsedUrl.pathname = path
  parsedUrl.search = ''
  
  parsedUrl.searchParams.set('__method', c.req.method)
  const range = c.req.header('Range')
  if (range) {
    parsedUrl.searchParams.set('__range', range)
  }
  const cacheKey = parsedUrl.toString()

  let response = await cache.match(cacheKey)

  if (!response) {
    const headers = new Headers()
    if (range) {
      headers.set('Range', range)
    }

    try {
      const fetchOpts = { method: c.req.method, headers }
      
      response = await aws.fetch(s3url, fetchOpts)
      
      let isHtmlFallback = false
      const looksLikeAsset = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json|txt|map)$/.test(path.toLowerCase()) && path !== "/index.html"
      
      if (response.status === 404 && !looksLikeAsset) {
        const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
        const baseUrl = `https://${c.env.BUCKET_NAME}.s3.${c.env.AWS_REGION}.amazonaws.com/__outputs/${projectID}`;
        
        // 1. Try exact path + ".html" (for plain HTML sites)
        response = await aws.fetch(`${baseUrl}${cleanPath}.html`, fetchOpts);
        isHtmlFallback = true;
        
        // 2. Try exact path + "/index.html" (for Static Site Generators like Next.js/Astro)
        if (response.status === 404) {
          response = await aws.fetch(`${baseUrl}${cleanPath}/index.html`, fetchOpts);
        }

        // 3. Fallback to root index (for SPAs like React/Vue)
        if (response.status === 404) {
          response = await aws.fetch(`${baseUrl}/index.html`, fetchOpts);
        }
      }
      
      if (!response.ok) {
        if (response.status === 403) {
          console.warn(`[S3 403 Forbidden] path=${path}. Ensure IAM policy has s3:ListBucket to distinguish missing files from auth errors.`)
        } else if (response.status === 404) {
          console.info(`[S3 404 Not Found] path=${path}`)
        }
        
        const errorText = response.status === 404 ? 'This page could not be found.' 
                        : response.status === 403 ? 'Access Denied.' 
                        : `An error occurred with status code ${response.status}.`
        return c.html(renderError(response.status, errorText), response.status as any)
      }

      response = new Response(response.body, response)
      
      // Strip headers that prevent caching in Cloudflare Cache API
      response.headers.delete('Set-Cookie')
      response.headers.delete('Vary')

      if (path.endsWith(".html") || path === "/" || isHtmlFallback) {
        response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate')
      } else {
        response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      }

      if (response.status === 206) {
        c.executionCtx.waitUntil(Promise.resolve())
      } else if (response.ok) {
        c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
      }
      
    } catch (e) {
      console.error("AWS Fetch Error:", e)
      return c.html(renderError(500, "Internal Server Error"), 500)
    }
  }

  return response
})

export default app