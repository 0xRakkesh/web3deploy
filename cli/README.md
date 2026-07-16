# w3deploy 🚀

**w3deploy** is a lightning-fast command-line interface for deploying static websites and front-end applications directly from your terminal. 

Built with developers in mind, it provides seamless authentication, instant deployments, and framework-agnostic support for anything from vanilla HTML/CSS to React, Vue, and Next.js (Static Export).

---

## Installation

You can install `w3deploy` globally using npm:

```bash
npm install -g w3deploy
```

## Quick Start

### 1. Authenticate
Link the CLI to your GitHub account.

```bash
w3deploy login
```
*This will open your browser to securely authenticate via GitHub.*

### 2. Initialize a Project (Optional)
Navigate to your project directory and run `init` to set up your configuration file (`w3deploy.json`).

```bash
cd my-awesome-website
w3deploy init
```

### 3. Deploy
Push your site live to the web!

```bash
w3deploy deploy
```
*Your site will instantly be available at `https://<your-project-slug>.web3deploy.me`!*

---

## Commands

### `w3deploy login`
Initiates a secure OAuth flow with GitHub to authenticate your CLI session.
- Generates a short-lived device code.
- Opens your browser to approve the login.
- Saves a secure, long-lived JWT token to your local configuration.

### `w3deploy deploy`
Deploys the current directory to the cloud.
- Scans your output directory (e.g., `dist`, `out`, or the current folder).
- Uploads assets concurrently for maximum speed.
- Provisions a dedicated subdomain: `https://[project-slug].web3deploy.me`.
- **Smart Routing:** Automatically handles routing for Single Page Applications (React/Vue), Static Site Generators (Next.js/Astro), and vanilla HTML sites.

### `w3deploy projects`
Opens an interactive dashboard to manage your existing deployments.
- View all your deployed projects and their statuses.
- See the live URLs and last updated timestamps.
- Select and delete old projects right from your terminal.

### `w3deploy logout`
Revokes your current session and clears your local configuration.

```bash
w3deploy logout
```

---

## Supported Frameworks

`w3deploy` is completely framework agnostic! Because of its intelligent routing engine, it seamlessly supports:

- **Single Page Applications (SPAs):** React, Vue, Angular, Svelte (automatically falls back to `index.html` for client-side routing).
- **Static Site Generators (SSGs):** Next.js (`output: 'export'`), Astro, Gatsby, Hugo (automatically routes `/about` to `/about/index.html`).
- **Vanilla Web:** Plain HTML, CSS, and JS (automatically routes `/about` to `/about.html`).

## Configuration

When you run `w3deploy init` or deploy for the first time, a `w3deploy.json` file is created in your project root:

```json
{
  "name": "my-awesome-website",
  "outDir": "dist"
}
```
- `name`: The unique slug for your project (must be alphanumeric).
- `outDir`: The directory to deploy. If you are using React/Vite, this is usually `dist`. If Next.js, it's `out`. If you just have a vanilla HTML site in the root folder, leave this as `.` or `./`.
