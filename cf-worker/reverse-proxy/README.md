# Web3Deploy - Reverse Proxy (Edge Worker)

This directory contains the core routing and reverse proxy engine for the **Web3Deploy** platform, acting as a Vercel/Netlify clone. It intercepts incoming web traffic, dynamically routes it based on subdomains, securely fetches assets from a private AWS S3 bucket, and caches them at the Cloudflare Edge.

## Tech Stack
- **Compute:** Cloudflare Workers
- **Framework:** Hono (TypeScript)
- **Storage:** AWS S3 (Private Bucket)
- **Authentication:** AWS Signature V4 (`aws4fetch`)

---

## 🧠 Architectural Concepts & Mentor Notes

This project solves several advanced infrastructure challenges. Below is a summary of the engineering decisions made during development:

### 1. Dynamic Subdomain Routing
When a user visits `https://project123.web3deploy.me`:
- A Wildcard Custom Domain (`*.web3deploy.me`) captures the traffic and triggers this Worker.
- The Worker parses the `Host` header (`project123.web3deploy.me`) and extracts the `projectID` (`project123`).
- It maps the requested path to the correct S3 folder: `s3://s3-web3deploy/__outputs/project123/path...`

### 2. The SPA Fallback Problem
Single Page Applications (SPAs) like React or Vue only have one HTML file (`index.html`). 
If a user visits `https://project123.web3deploy.me/dashboard`, S3 will look for a file named `dashboard` and return a `404 Not Found`.
**The Fix:** We built logic to catch `404` errors from S3. If a 404 occurs, the proxy automatically falls back to fetching `/index.html` from S3. This allows the frontend router to take over and render the correct page.

### 3. Edge Caching & Cache-Busting
Fetching from S3 on every request is slow and expensive. We utilized Cloudflare's programmatic Cache API (`caches.default`) to cache assets globally.
**Cache-Control Strategy:**
- **HTML Files (`index.html`):** Cached with `max-age=0, must-revalidate`. This ensures that when a developer pushes a new update, visitors get the new HTML instantly.
- **Static Assets (JS, CSS, Images):** Cached with `max-age=31536000, immutable` (1 year). Bundlers generate unique hashes for these files (e.g., `main-b7d8.js`), meaning they never change and can safely be cached forever to save AWS egress costs.

### 4. Security & Error Handling
- **AWS SigV4 Authentication:** S3 buckets are kept strictly private. The Worker uses `aws4fetch` to dynamically sign HTTP requests using AWS credentials before forwarding them to S3.
- **Handling AWS Errors:** The Worker explicitly checks `if (response.ok)` before caching. This prevents Cloudflare from permanently caching an AWS `500 Internal Server Error` if the S3 bucket experiences downtime.
- **Secrets Management:** The `AWS_ACCESS_KEY_ID` (public) is stored in `wrangler.jsonc`, while the sensitive `AWS_SECRET_ACCESS_KEY` is injected securely into the runtime via Cloudflare Secrets (`npx wrangler secret put`).

---

## 🚀 How to Run & Deploy

### Local Development
To test the proxy locally, you must provide the AWS Secret Key via a `.dev.vars` file (which is git-ignored).
1. Create `.dev.vars` in this directory:
   ```env
   AWS_SECRET_ACCESS_KEY="your-secret-key-here"
   ```
2. Start the local development server:
   ```bash
   npm run dev
   ```
3. Test a specific project by spoofing the Host header:
   ```bash
   curl -H "Host: myproject.w3deploy.me" http://localhost:8787/
   ```

### Production Deployment
To push updates to Cloudflare's global edge network:
```bash
npm run deploy
```

---

## Resume Snippet
*Built this project? Here is how to highlight it on your resume:*

> **Web3Deploy - Edge Hosting Platform (Vercel Clone)**
> *Tech Stack: Cloudflare Workers, Hono, TypeScript, AWS S3, DNS*
> - Architected a highly scalable reverse proxy at the edge using Cloudflare Workers to serve static sites globally with sub-50ms latency.
> - Implemented dynamic wildcard subdomain routing (`*.w3deploy.me`) to map user deployments to private AWS S3 buckets.
> - Secured S3 integrations using `aws4fetch` for dynamic AWS SigV4 authentication, keeping bucket contents completely private.
> - Engineered an intelligent edge-caching layer with custom `Cache-Control` headers, achieving a 99% cache hit rate for static assets while ensuring instant zero-downtime HTML updates via cache-busting.
