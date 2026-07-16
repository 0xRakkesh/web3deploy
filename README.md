# w3deploy 🚀

> Deploy any static website or front-end app to the cloud in seconds — straight from your terminal.

**w3deploy** is a developer tool (CLI + backend) that lets you deploy static websites to a global CDN with a single command. It's similar to Vercel or Netlify, but open-source and self-hostable. It supports everything from a plain `index.html` file to complex React, Vue, and Next.js applications.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Option A — Use the Hosted CLI (Easiest)](#option-a--use-the-hosted-cli-easiest)
- [Option B — Self-Host Everything](#option-b--self-host-everything)
  - [Step 1: Clone the Repository](#step-1-clone-the-repository)
  - [Step 2: Set Up AWS S3](#step-2-set-up-aws-s3)
  - [Step 3: Set Up GitHub OAuth App](#step-3-set-up-github-oauth-app)
  - [Step 4: Deploy the API Server (Cloudflare Worker)](#step-4-deploy-the-api-server-cloudflare-worker)
  - [Step 5: Deploy the Reverse Proxy (Cloudflare Worker)](#step-5-deploy-the-reverse-proxy-cloudflare-worker)
  - [Step 6: Build and Publish the CLI](#step-6-build-and-publish-the-cli)
- [Using the CLI](#using-the-cli)
  - [Step 1: Install](#step-1-install)
  - [Step 2: Login](#step-2-login)
  - [Step 3: Initialize Your Project](#step-3-initialize-your-project)
  - [Step 4: Deploy](#step-4-deploy)
  - [Step 5: Manage Projects](#step-5-manage-projects)
  - [Step 6: Logout](#step-6-logout)
- [Supported Frameworks](#supported-frameworks)
- [Project Structure](#project-structure)

---

## How It Works

The architecture has three main pieces:

```
Your Terminal (CLI)
     │
     │  1. Login (GitHub OAuth)
     │  2. Request presigned S3 upload URLs
     ▼
API Server (Cloudflare Worker)
     │
     │  3. Returns presigned S3 PUT URLs
     ▼
AWS S3 Bucket
     │
     │  Files stored at __outputs/[project-slug]/...
     ▼
Reverse Proxy (Cloudflare Worker)
     │
     │  4. End users visit [slug].web3deploy.me
     │     Proxy fetches files from S3 and caches at Edge
     ▼
End User's Browser
```

---

## Prerequisites

Before you start, make sure you have the following installed:

- **Node.js** v18 or higher → [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)

For self-hosting, you will also need:
- A **Cloudflare account** (free) → [Sign up here](https://dash.cloudflare.com/sign-up)
- An **AWS account** for S3 storage → [Sign up here](https://aws.amazon.com/)
- **Wrangler CLI** (Cloudflare's deployment tool): `npm install -g wrangler`
- A **GitHub account** to create an OAuth App for user login

---

## Option A — Use the Hosted CLI (Easiest)

If you just want to deploy your site without setting anything up, skip to the **[Using the CLI](#using-the-cli)** section. The CLI is pre-configured to point at the hosted backend.

```bash
npm install -g w3deploy
w3deploy login
```

---

## Option B — Self-Host Everything

Follow these steps if you want to run your own instance of w3deploy.

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/w3deploy.git
cd w3deploy
```

---

### Step 2: Set Up AWS S3

You need an S3 bucket to store the deployed files.

1. Go to [AWS S3](https://s3.console.aws.amazon.com/) and click **Create bucket**.
2. Give it a name (e.g., `my-w3deploy-bucket`) and choose a region (e.g., `ap-south-1`).
3. **Uncheck** "Block all public access" — your static files need to be publicly readable.
4. Go to the **Permissions** tab of your bucket → **Bucket Policy** and paste this, replacing `my-w3deploy-bucket` with your bucket name:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-w3deploy-bucket/*"
    }
  ]
}
```

5. Go to **IAM** → **Users** → Create a new user → Attach the `AmazonS3FullAccess` policy.
6. Create an **Access Key** for that user. Save the **Access Key ID** and **Secret Access Key** — you will need them later.

---

### Step 3: Set Up GitHub OAuth App

w3deploy uses GitHub to authenticate users.

1. Go to **GitHub** → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**.
2. Fill in the details:
   - **Application name:** `w3deploy`
   - **Homepage URL:** `https://api-server.YOUR_CLOUDFLARE_SUBDOMAIN.workers.dev`
   - **Authorization callback URL:** `https://api-server.YOUR_CLOUDFLARE_SUBDOMAIN.workers.dev/api/cli/auth/github/callback`
3. Click **Register Application**.
4. Save your **Client ID** and generate a **Client Secret**. You will need both.

---

### Step 4: Deploy the API Server (Cloudflare Worker)

This is the backend that handles authentication, project management, and S3 presigned URLs.

```bash
cd cf-worker/cli-server

# Install dependencies
npm install

# Log in to Cloudflare (opens your browser)
wrangler login

# Create the D1 database
wrangler d1 create db

# Copy the database ID from the output above and paste it into wrangler.jsonc
# under "d1_databases" -> "database_id"

# Create the KV namespace
wrangler kv namespace create CLI_AUTH_KV

# Copy the KV namespace ID from the output and paste it into wrangler.jsonc
# under "kv_namespaces" -> "id"

# Apply the database migrations to create the tables
npm run db:up:prod

# Set your secret environment variables
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put JWT_SECRET        # Any random 64-character string
wrangler secret put S3_ACCESS_KEY_ID
wrangler secret put S3_SECRET_ACCESS_KEY
wrangler secret put S3_ENDPOINT       # e.g., https://s3.ap-south-1.amazonaws.com
wrangler secret put S3_BUCKET_NAME    # e.g., my-w3deploy-bucket
wrangler secret put S3_REGION         # e.g., ap-south-1

# Deploy!
npm run deploy
```

After deploying, you will see a URL like `https://api-server.YOUR_SUBDOMAIN.workers.dev`. Note it down.

---

### Step 5: Deploy the Reverse Proxy (Cloudflare Worker)

This Worker serves your users' deployed sites. It reads files from S3 and caches them at the Cloudflare Edge.

```bash
cd cf-worker/reverse-proxy

# Install dependencies
npm install

# Edit wrangler.jsonc and update the "vars" section:
# "AWS_REGION": "your-region",
# "BUCKET_NAME": "your-bucket-name"

# Then set the secret credentials
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY

# Deploy!
npm run deploy
```

> **Important:** After deploying, go to the Cloudflare dashboard → Workers & Pages → `reverse-proxy` → Settings → **Custom Domains** and add a wildcard domain like `*.web3deploy.me` (you need to own this domain and have it on Cloudflare).

---

### Step 6: Build and Publish the CLI

Now, update the CLI to point at your own API server, then publish it.

1. Open `cli/src/commands/deploy.tsx`, `login.ts`, `logout.ts`, and `projects.tsx`.
2. Change the `API_URL` default value from the hosted URL to your own Worker URL:
   ```typescript
   const API_URL = process.env.W3DEPLOY_API_URL || 'https://api-server.YOUR_SUBDOMAIN.workers.dev';
   ```
3. Build and publish:
   ```bash
   cd cli
   npm install
   npm run build
   npm login          # Log in to your NPM account
   npm publish
   ```

---

## Using the CLI

### Step 1: Install

Install the CLI globally on your machine. You only need to do this once.

```bash
npm install -g w3deploy
```

Verify the installation worked:

```bash
w3deploy --version
```

---

### Step 2: Login

Authenticate with your GitHub account. You only need to do this once — your session lasts 90 days.

```bash
w3deploy login
```

**What happens:**
1. The CLI prints a short device code (e.g., `ABCD-EFGH`) and opens your browser.
2. In the browser, click "Continue with GitHub" to authorize.
3. The browser shows a success message.
4. Back in your terminal, the CLI confirms you are logged in and saves a token locally.

---

### Step 3: Initialize Your Project

Navigate to your project's root directory and run `init`. This creates a `w3deploy.json` configuration file.

```bash
cd my-react-app
w3deploy init
```

**What it asks:**
1. **Project name** — The unique name for your deployment (e.g., `my-portfolio`). Your site will be live at `https://my-portfolio.web3deploy.me`.
2. **Framework** — It auto-detects React, Vue, Svelte, Astro, etc. from your `package.json`. Just press Enter to confirm.
3. **Output directory** — Where your built files go (e.g., `dist` for Vite/React, `out` for Next.js). Auto-filled based on your framework.
4. **Install command** — Usually `npm install`. Auto-detected from your lock file.
5. **Build command** — Usually `npm run build`. Auto-detected.

This creates a `w3deploy.json` file that looks like:

```json
{
  "projectName": "my-portfolio",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "framework": "react-vite",
  "packageManager": "npm"
}
```

> **For vanilla HTML/CSS/JS:** If you have no `package.json`, just enter `.` as the output directory, and enter any placeholder for the install and build commands (they can be empty scripts).

---

### Step 4: Deploy

Run this command from the same directory as your `w3deploy.json`:

```bash
w3deploy deploy
```

**What happens automatically:**
1. ✅ Reads your `w3deploy.json` config.
2. 📦 Runs your install command (e.g., `npm install`).
3. 🔨 Runs your build command (e.g., `npm run build`).
4. 📂 Scans your output directory and collects all files.
5. 🔗 Registers the deployment with the API and gets secure, temporary upload URLs.
6. ⬆️ Uploads all your files directly and securely to cloud storage (S3).
7. 🚀 Marks the deployment as live.

When it finishes, you will see:

```
Live URL: https://my-portfolio.web3deploy.me 🚀
```

Open that URL in your browser — your site is live!

---

### Step 5: Manage Projects

View and manage all your deployed projects:

```bash
w3deploy projects
```

This opens an interactive terminal dashboard where you can:
- See all your projects and their **live URLs**.
- Check deployment **status** and **last updated** time.
- **Select and delete** a project (this removes all files from storage too).

---

### Step 6: Logout

To revoke your session and clear your local token:

```bash
w3deploy logout
```

---

## Supported Frameworks

w3deploy works with any framework that produces a static output directory. The routing engine is smart enough to handle all of them automatically:

| Framework | Output Dir | Routing Mode |
|---|---|---|
| React (Vite) | `dist` | SPA (falls back to `index.html`) |
| React (CRA) | `build` | SPA (falls back to `index.html`) |
| Vue | `dist` | SPA (falls back to `index.html`) |
| Svelte | `build` | SPA (falls back to `index.html`) |
| Next.js (`output: 'export'`) | `out` | SSG (`/about` → `/about/index.html`) |
| Astro | `dist` | SSG (`/about` → `/about/index.html`) |
| Gatsby | `public` | SSG (`/about` → `/about/index.html`) |
| Vanilla HTML/CSS/JS | `.` or `dist` | HTML (`/about` → `/about.html`) |

---

## Project Structure

```
w3deploy/
├── cli/                        # The npm CLI package (w3deploy)
│   ├── src/
│   │   ├── commands/
│   │   │   ├── login.ts        # `w3deploy login`
│   │   │   ├── logout.ts       # `w3deploy logout`
│   │   │   ├── init.ts         # `w3deploy init`
│   │   │   ├── deploy.tsx      # `w3deploy deploy`
│   │   │   └── projects.tsx    # `w3deploy projects`
│   │   └── index.ts            # CLI entry point
│   └── package.json
│
└── cf-worker/
    ├── cli-server/             # API backend (Cloudflare Worker + D1 + KV)
    │   ├── src/
    │   │   ├── routes/         # API route handlers
    │   │   ├── db/             # Drizzle ORM schema & client
    │   │   └── lib/            # S3, auth helpers
    │   └── wrangler.jsonc
    │
    └── reverse-proxy/          # Site serving proxy (Cloudflare Worker)
        ├── src/
        │   └── index.ts        # Reads from S3, caches at CF Edge
        └── wrangler.jsonc
```

---

## License

ISC
