import { Context, Next } from "hono";
import { jwt } from "hono/jwt";
import { CloudflareBindings } from "../index";

const rateLimitMap = new Map<string, { count: number, resetAt: number }>();

export const rateLimiter = async (c: Context, next: Next) => {
  const ip = c.req.header('cf-connecting-ip') || '127.0.0.1';
  const now = Date.now();

  let record = rateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + 60000 };
  } else {
    record.count++;
  }
  rateLimitMap.set(ip, record);

  if (record.count > 60) {
    return c.json({ error: "Too Many Requests. Please slow down." }, 429);
  }

  await next();
};

export const requireAuth = async (c: Context<{ Bindings: CloudflareBindings }>, next: Next) => {
  const secret = c.env.JWT_SECRET || 'fallback_secret_for_development';
  const jwtMiddleware = jwt({ secret, alg: 'HS256' });
  return jwtMiddleware(c, next);
};

export const requireAuthOrServiceToken = async (c: Context<{ Bindings: CloudflareBindings }>, next: Next) => {
  const authHeader = c.req.header('Authorization');
  if (c.env.API_SERVICE_TOKEN && authHeader === `Bearer ${c.env.API_SERVICE_TOKEN}`) {
    c.set('jwtPayload', { user_id: 'service_account' });
    return next();
  }

  const secret = c.env.JWT_SECRET || 'fallback_secret_for_development';
  const jwtMiddleware = jwt({ secret, alg: 'HS256' });
  return jwtMiddleware(c, next);
};
