import { Hono } from "hono";
import projectsRouter from "./routes/projects";
import usersRouter from "./routes/users";
import deploymentsRouter from "./routes/deployments";
import logsRouter from "./routes/logs";
import authRouter from "./routes/auth";
import { rateLimiter, requireAuth, requireAuthOrServiceToken } from "./middleware/index";

export interface CloudflareBindings {
  DB: D1Database;
  JWT_SECRET: string;
  GITHUB_TOKEN: string;
  GITHUB_ORG_REPO: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  API_SERVICE_TOKEN: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
}

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.use('*', rateLimiter);

app.route('/auth', authRouter);
app.route('/users', usersRouter);

app.use('/projects/*', requireAuth);
app.use('/logs/*', requireAuth);
app.use('/deployments/*', requireAuthOrServiceToken);

app.route('/projects', projectsRouter);
app.route('/deployments', deploymentsRouter);
app.route('/logs', logsRouter);

export default app;