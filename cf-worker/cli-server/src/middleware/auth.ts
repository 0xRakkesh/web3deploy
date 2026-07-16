import { jwt } from "hono/jwt";
import { getDB } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { CloudflareBindings, Variables } from "../index.js";
import type { MiddlewareHandler } from "hono";

type AppEnv = { Bindings: CloudflareBindings; Variables: Variables };

/**
 * Validates a Hono/JWT token using the worker's JWT_SECRET.
 * Populates `jwtPayload` in the Hono context.
 */
export const jwtAuthMiddleware: MiddlewareHandler<AppEnv> = (c, next) => {
  const middleware = jwt({ secret: c.env.JWT_SECRET, alg: "HS256" });
  return middleware(c, next);
};

/**
 * Validates the JWT's `jti` against the sessions table in D1.
 * - Rejects revoked sessions.
 * - Sets `authUser` on the context for downstream handlers.
 *
 * Must run AFTER `jwtAuthMiddleware`.
 */
export const sessionAuthMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const payload = c.get("jwtPayload");

  if (!payload || !payload.jti) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDB(c.env);
  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, payload.jti))
    .get();

  if (!session || session.revoked_at !== null) {
    return c.json({ error: "Session revoked or invalid" }, 401);
  }

  c.set("authUser", { user_id: session.user_id });
  return next();
};
