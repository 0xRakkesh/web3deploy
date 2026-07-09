/**
 * W3Deploy — Cloudflare Worker (S3 Reverse Proxy)
 *
 * Request flow:
 *   <projectId>.web3deploy.me/<path>
 *   → derive projectId from hostname
 *   → build S3 key: __outputs/<projectId>/<path>
 *   → SigV4-sign a private S3 GET request
 *   → stream S3 response back to the browser
 *
 * Required Worker Secrets (set via `wrangler secret put <NAME>`):
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION          (e.g. ap-south-1)
 *   S3_BUCKET           (e.g. s3-web3deploy)
 */

// ─── MIME type map ────────────────────────────────────────────────────────────
const MIME_TYPES = {
  // Web
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  webp: "image/webp",
  avif: "image/avif",
  // Fonts
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  // Media
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  // Docs
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml",
  // Data
  wasm: "application/wasm",
};

// ─── AWS SigV4 helpers ────────────────────────────────────────────────────────

/** SHA-256 hex digest of a string or ArrayBuffer */
async function sha256Hex(data) {
  const buf =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA256, returns ArrayBuffer */
async function hmacSha256(keyData, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    typeof keyData === "string" ? new TextEncoder().encode(keyData) : keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign(
    "HMAC",
    key,
    typeof message === "string" ? new TextEncoder().encode(message) : message
  );
}

/** Build a SigV4-signed S3 presigned URL for a GET request (valid 60s) */
async function buildSignedS3Url(key, env) {
  const region = env.AWS_REGION;
  const bucket = env.S3_BUCKET;
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretKey = env.AWS_SECRET_ACCESS_KEY;

  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const encodedKey = key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d+Z$/, "Z"); // 20260708T123456Z
  const dateStamp = amzDate.slice(0, 8); // 20260708

  const service = "s3";
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": algorithm,
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": "60",
    "X-Amz-SignedHeaders": "host",
  });
  queryParams.sort(); // lexicographic sort required by SigV4
  const canonicalQueryString = queryParams.toString();

  const canonicalRequest = [
    "GET",
    `/${encodedKey}`,
    canonicalQueryString,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);

  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    hashedCanonicalRequest,
  ].join("\n");

  // Derive signing key
  const kDate    = await hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion  = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");

  const signatureRaw = await hmacSha256(kSigning, stringToSign);
  const signature = Array.from(new Uint8Array(signatureRaw))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `https://${host}/${encodedKey}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function guessMime(filePath) {
  const ext = filePath.split(".").pop().toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function cacheControlFor(filePath) {
  // Fingerprinted assets (content-hash in filename) — cache forever
  if (/\.[0-9a-f]{8,}\.(js|css|woff2?|png|jpg|jpeg|webp|avif|gif)$/i.test(filePath)) {
    return "public, max-age=31536000, immutable";
  }
  // HTML / JSON — always revalidate
  if (/\.(html?|json)$/i.test(filePath)) {
    return "public, max-age=0, must-revalidate";
  }
  // Everything else — 1 hour
  return "public, max-age=3600";
}

/** Fetch one S3 key. Returns the Response or null on 404. Throws on other errors. */
async function fetchFromS3(s3Key, env) {
  const signedUrl = await buildSignedS3Url(s3Key, env);
  console.log(`[S3] GET ${signedUrl.split("?")[0]}`); // log URL without credentials

  const s3Res = await fetch(signedUrl);
  console.log(`[S3] status: ${s3Res.status}`);

  if (s3Res.status === 404) return null;

  if (!s3Res.ok) {
    const body = await s3Res.text();
    console.error(`[S3] error body: ${body}`);
    throw new Error(`S3 ${s3Res.status}: ${body}`);
  }

  return s3Res;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url      = new URL(request.url);
    const hostname = url.hostname; // e.g. my-portfolio.web3deploy.me
    const pathname = url.pathname; // e.g. /about  or  /assets/main.js

    console.log(`[W3Deploy] ${request.method} ${request.url}`);
    console.log(`[W3Deploy] hostname: ${hostname}`);

    // ── 1. Derive projectId from subdomain ───────────────────────────────────
    const ROOT_DOMAIN = "web3deploy.me";
    const projectId = hostname.endsWith(`.${ROOT_DOMAIN}`)
      ? hostname.slice(0, -(ROOT_DOMAIN.length + 1))
      : null;

    console.log(`[W3Deploy] projectId: ${projectId}`);

    if (!projectId) {
      return new Response("Bad request — could not derive projectId from hostname.", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // ── 2. Guard: secrets must be present ────────────────────────────────────
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_REGION || !env.S3_BUCKET) {
      console.error("[W3Deploy] Missing AWS secrets in Worker environment.");
      return new Response("Worker misconfiguration: missing AWS secrets.", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // ── 3. Build S3 key ───────────────────────────────────────────────────────
    const filePath    = pathname.replace(/^\//, "") || "index.html";
    const hasExtension = /\.[^/]+$/.test(filePath);
    const s3Key       = `__outputs/${projectId}/${filePath}`;

    console.log(`[W3Deploy] s3Key: ${s3Key}`);

    // ── 4. Fetch from S3 (with SPA fallback) ─────────────────────────────────
    let s3Res      = null;
    let resolvedKey = s3Key;

    try {
      s3Res = await fetchFromS3(s3Key, env);

      // SPA fallback: extensionless path that 404s → serve index.html
      // so the client-side router can handle the route
      if (s3Res === null && !hasExtension) {
        const fallback = `__outputs/${projectId}/index.html`;
        console.log(`[W3Deploy] 404 on "${s3Key}" → SPA fallback: ${fallback}`);
        s3Res = await fetchFromS3(fallback, env);
        resolvedKey = fallback;
      }
    } catch (err) {
      console.error(`[W3Deploy] S3 fetch threw: ${err.message}`);
      return new Response(`Gateway error: ${err.message}`, {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // ── 5. 404 page ───────────────────────────────────────────────────────────
    if (s3Res === null) {
      console.log(`[W3Deploy] final 404 for key: ${s3Key}`);
      return new Response(
        `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>404 — W3Deploy</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;display:grid;place-items:center;
       min-height:100vh;background:#0a0a0a;color:#fff}
  h1{font-size:6rem;font-weight:800;background:linear-gradient(135deg,#6366f1,#a855f7);
     -webkit-background-clip:text;-webkit-text-fill-color:transparent}
  p{margin-top:.5rem;opacity:.5;font-size:1rem}
  code{background:#1a1a1a;padding:.1em .4em;border-radius:.25em;font-size:.9em}
</style></head>
<body>
  <div style="text-align:center">
    <h1>404</h1>
    <p>No deployment found for <code>${projectId}</code> at <code>${pathname}</code></p>
  </div>
</body></html>`,
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // ── 6. Build and return response ──────────────────────────────────────────
    const contentType  = guessMime(resolvedKey);
    const cacheControl = cacheControlFor(resolvedKey);

    const headers = new Headers({
      "Content-Type":              contentType,
      "Cache-Control":             cacheControl,
      "X-Content-Type-Options":    "nosniff",
      "X-Frame-Options":           "SAMEORIGIN",
      "Referrer-Policy":           "strict-origin-when-cross-origin",
      "X-W3Deploy-Project":        projectId,
    });

    const cl   = s3Res.headers.get("Content-Length");
    const etag = s3Res.headers.get("ETag");
    if (cl)   headers.set("Content-Length", cl);
    if (etag) headers.set("ETag", etag);

    console.log(`[W3Deploy] serving ${resolvedKey} | ${contentType} | ${cacheControl}`);

    return new Response(s3Res.body, { status: 200, headers });
  },
};
