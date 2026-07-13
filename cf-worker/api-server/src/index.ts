import { Hono } from "hono";
import projectsRouter from "./routes/projects";

import deploymentsRouter from "./routes/deployments";
import logsRouter from "./routes/logs";
import { rateLimiter, requireAuth, requireAuthOrServiceToken } from "./middleware/index";

export interface CloudflareBindings {
  DB: D1Database;

  GITHUB_TOKEN: string;
  GITHUB_ORG_REPO: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
}

export type Variables = {
  authUser: { user_id: string };
};

import { cors } from "hono/cors";

const app = new Hono<{ Bindings: CloudflareBindings, Variables: Variables }>()

app.use('*', cors());
app.use('*', rateLimiter);




app.use('/projects/*', requireAuth);
app.use('/logs/*', requireAuth);
app.use('/deployments/*', requireAuthOrServiceToken);

app.route('/projects', projectsRouter);
app.route('/deployments', deploymentsRouter);
app.route('/logs', logsRouter);

export default app;