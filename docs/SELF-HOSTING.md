# Self-Hosting w3deploy

Follow these steps if you want to run your own instance of w3deploy.

## Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/w3deploy.git
cd w3deploy
```

---

## Step 2: Set Up AWS S3

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

## Step 3: Set Up GitHub OAuth App

w3deploy uses GitHub to authenticate users.

1. Go to **GitHub** → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**.
2. Fill in the details:
   - **Application name:** `w3deploy`
   - **Homepage URL:** `https://api-server.YOUR_CLOUDFLARE_SUBDOMAIN.workers.dev`
   - **Authorization callback URL:** `https://api-server.YOUR_CLOUDFLARE_SUBDOMAIN.workers.dev/api/cli/auth/github/callback`
3. Click **Register Application**.
4. Save your **Client ID** and generate a **Client Secret**. You will need both.

---

## Step 4: Deploy the API Server (Cloudflare Worker)

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

## Step 5: Deploy the Reverse Proxy (Cloudflare Worker)

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

## Step 6: Build and Publish the CLI

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
