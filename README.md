# w3deploy 🚀

> Deploy any static website or front-end app to the cloud in seconds — straight from your terminal.

<div align="center">
  <a href="https://youtu.be/OJKyzVEUqhA">
    <img src="https://img.youtube.com/vi/OJKyzVEUqhA/maxresdefault.jpg" alt="w3deploy Video Tutorial" width="720">
  </a>
</div>

**w3deploy** is a developer tool (CLI + backend) that lets you deploy static websites to a global CDN with a single command. It's similar to Vercel or Netlify, but open-source and self-hostable. It supports everything from a plain `index.html` file to complex React, Vue, and Next.js applications.

---

## Features

- **⚡️ One-Command Deploy:** Push your site to a global CDN in seconds.
- **🌐 Framework Agnostic:** Supports React, Vue, Svelte, Next.js, Astro, and plain HTML.
- **🔐 Secure Authentication:** Seamless GitHub OAuth integration.
- **🏠 Self-Hostable:** Run your own backend using Cloudflare Workers and AWS S3.
- **🚀 Edge Caching:** Assets are cached at the edge for blazing fast load times globally.

---

## Quick Start

You can use our hosted CLI to get started immediately without setting up any infrastructure.

```bash
# 1. Install the CLI
npm install -g w3deploy

# 2. Login with GitHub
w3deploy login

# 3. Initialize your project (run in your project root)
w3deploy init

# 4. Deploy!
w3deploy deploy
```

---

## Documentation

For full details on using the CLI and setting up your own infrastructure, please see our detailed documentation:

- 📖 **[CLI Usage Guide](docs/CLI-USAGE.md)**: Full instructions on installing, managing projects, and deploying.
- 🏗️ **[Self-Hosting Guide](docs/SELF-HOSTING.md)**: Step-by-step instructions on deploying your own w3deploy backend on Cloudflare and AWS S3.

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
└── cf-worker/
    ├── cli-server/             # API backend (Cloudflare Worker + D1 + KV)
    └── reverse-proxy/          # Site serving proxy (Cloudflare Worker)
```

---

## License

ISC
