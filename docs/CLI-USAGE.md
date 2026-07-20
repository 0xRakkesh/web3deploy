# CLI Usage Guide

## Step 1: Install

Install the CLI globally on your machine. You only need to do this once.

```bash
npm install -g w3deploy
```

Verify the installation worked:

```bash
w3deploy --version
```

---

## Step 2: Login

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

## Step 3: Initialize Your Project

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

## Step 4: Deploy

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

## Step 5: Manage Projects

View and manage all your deployed projects:

```bash
w3deploy projects
```

This opens an interactive terminal dashboard where you can:
- See all your projects and their **live URLs**.
- Check deployment **status** and **last updated** time.
- **Select and delete** a project (this removes all files from storage too).

---

## Step 6: Logout

To revoke your session and clear your local token:

```bash
w3deploy logout
```
