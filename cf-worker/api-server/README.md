# Web3Deploy - API Server (Control Plane)

This directory contains the core API Server for the **Web3Deploy** platform. Acting as the "control plane" (similar to Vercel's API), it handles user authentication, project creation, database management, real-time log streaming, and triggering the build infrastructure.

## Tech Stack
- **Compute:** Cloudflare Workers (Serverless Edge Computing)
- **Framework:** Hono (Fast, lightweight web framework for edge)
- **Database:** Cloudflare D1 (Serverless SQLite) & Drizzle ORM
- **Real-time Logs:** Upstash Redis (Server-Sent Events)
- **Authentication:** GitHub OAuth & JWT (JSON Web Tokens)
- **CI/CD Integration:** GitHub Actions API

---

## 🧠 Architectural Concepts & Mentor Notes

This project solves several complex backend orchestration challenges. Below is a summary of the engineering decisions made to keep the architecture efficient and scalable:

### 1. Edge-Native Database (Cloudflare D1)
Instead of relying on a traditional database (like MongoDB or Postgres) which requires managing connections and dealing with edge cold-start latencies, we used **Cloudflare D1**. 
- D1 is a serverless SQLite database built natively into Cloudflare Workers. 
- It is extremely fast because it runs on the edge alongside our API code.
- We use **Drizzle ORM** for type-safe database queries.

### 2. Stateless Authentication Flow
Because Cloudflare Workers are stateless and distributed globally, we cannot rely on traditional session cookies backed by a server's memory.
- **GitHub OAuth:** Users log in using GitHub. The API exchanges an OAuth code for a GitHub profile and email.
- **JWTs:** Once authenticated, the server issues a signed JWT (JSON Web Token). The frontend stores this token and sends it with every request. The API can instantly verify the user's identity without hitting the database on every request.

### 3. Asynchronous Build Orchestration
Cloudflare Workers are designed to be fast and have execution time limits. They cannot run heavy, long-running processes like `npm install` or `npm run build`.
- When a user creates a new project, the API server saves the project to the database and immediately creates a `queued` deployment.
- It then uses the **GitHub REST API** to trigger a remote GitHub Actions workflow (`build.yml`) asynchronously.
- The API responds to the user instantly, while the GitHub Action spins up an Ubuntu VM in the background to handle the heavy lifting.

### 4. Real-time Log Streaming with Server-Sent Events (SSE)
When the GitHub Action is building the project, we need a way to stream live terminal logs back to the user's browser.
- **Redis as a Message Broker:** The Build Server pushes live logs into an Upstash Redis channel.
- **SSE (Server-Sent Events):** The API Server subscribes to this Redis channel. The frontend connects to the API via an SSE connection (`/logs/:deploymentId`), allowing the API to stream logs directly to the browser in real-time as they happen.

### 5. Service Account Security
The Build Server needs a way to update the database when a build succeeds or fails (e.g., `PATCH /deployments/:id`). To do this securely without a user context, we implemented a custom middleware (`requireAuthOrServiceToken`) that verifies a secret `API_SERVICE_TOKEN`.

---

## 🚀 How to Run & Deploy

### Local Development
To run this API server locally, ensure you have the required environment variables in your `.dev.vars` file.

1. Start the local development server:
   ```bash
   npm run dev
   ```

2. Run database migrations locally (if applicable):
   ```bash
   npx wrangler d1 migrations apply w3deploy-db --local
   ```

### Production Deployment
To push updates to Cloudflare's global edge network:
```bash
npm run deploy
```

---

## Resume Snippet
*Built this project? Here is how to highlight the API Server on your resume:*

> **Web3Deploy - Edge Hosting Platform (Vercel Clone)**
> *Tech Stack: Cloudflare Workers, Hono, TypeScript, Cloudflare D1 (SQLite), Upstash Redis*
> - Architected the core control plane API using Cloudflare Workers and Hono, providing a lightning-fast, edge-native backend for user and deployment management.
> - Engineered an asynchronous CI/CD orchestration system by integrating the GitHub Actions REST API to securely trigger remote build pipelines from the edge.
> - Built a real-time log streaming service using Upstash Redis as a message broker and Server-Sent Events (SSE) to deliver live build terminal outputs to the client.
> - Implemented a stateless authentication system using GitHub OAuth and JWTs, and designed a robust schema using Drizzle ORM and Cloudflare D1 for optimal edge performance.
