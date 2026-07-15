import { Hono } from "hono";
import { cors } from "hono/cors";
import { jwt } from "hono/jwt";
import { cliAuthRouter } from "./routes/cli-auth";
import { cliVerifyRouter } from "./routes/cli-verify";
import { getDB } from "./db";
import { sessions } from "./db/schema";
import { eq } from "drizzle-orm";

export interface CloudflareBindings {
  DB: D1Database;
  CLI_AUTH_KV: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
}

export type Variables = {
  authUser?: { user_id: string };
  jwtPayload?: { sub: string; jti: string; exp: number };
};

const app = new Hono<{ Bindings: CloudflareBindings, Variables: Variables }>();

app.use('*', cors());



// Basic health check
app.get('/', (c) => {
  return c.json({ message: "W3deploy API Server - Status: OK" });
});

// CLI Web Verification page (Public)
app.route('/cli/verify', cliVerifyRouter as any);

// CLI Authentication API endpoints (Public)
app.route('/api/cli/auth', cliAuthRouter as any);

// Protect all other /api/* routes with JWT
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/cli/auth')) {
    return next();
  }
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
    alg: "HS256"
  });
  return jwtMiddleware(c, next);
});

// Validate the session in D1
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/cli/auth')) {
    return next();
  }
  const payload = c.get('jwtPayload');
  if (!payload || !payload.jti) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDB(c.env);
  const session = await db.select().from(sessions).where(eq(sessions.id, payload.jti)).get();

  if (!session || session.revoked_at !== null) {
    return c.json({ error: "Session revoked or invalid" }, 401);
  }

  c.set('authUser', { user_id: session.user_id });
  return next();
});

export default app;