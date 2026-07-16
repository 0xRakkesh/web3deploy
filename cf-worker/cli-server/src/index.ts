import { Hono } from "hono";
import { cors } from "hono/cors";
import { cliAuthRouter } from "./routes/cli-auth.js";
import { cliVerifyRouter } from "./routes/cli-verify.js";
import { cliDeployRouter } from "./routes/cli-deploy.js";
import { cliProjectsRouter } from "./routes/cli-projects.js";
import { jwtAuthMiddleware, sessionAuthMiddleware } from "./middleware/auth.js";

export interface CloudflareBindings {
  DB: D1Database;
  CLI_AUTH_KV: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_ENDPOINT: string;
  S3_BUCKET_NAME: string;
  S3_REGION: string;
}

export type Variables = {
  authUser?: { user_id: string };
  jwtPayload?: { sub: string; jti: string; exp: number };
};

const app = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

app.use("*", cors());

// Health check
app.get("/", (c) => c.json({ message: "W3deploy API Server - Status: OK" }));

// Public routes
app.route("/cli/verify", cliVerifyRouter as any);
app.route("/api/cli/auth", cliAuthRouter as any);

// JWT + session validation for all protected /api/* routes (excluding /api/cli/auth)
app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/cli/auth")) return next();
  return jwtAuthMiddleware(c, next);
});

app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/cli/auth")) return next();
  return sessionAuthMiddleware(c, next);
});

// Protected routes
app.route("/api/cli/deploy", cliDeployRouter as any);
app.route("/api/cli/projects", cliProjectsRouter as any);

export default app;