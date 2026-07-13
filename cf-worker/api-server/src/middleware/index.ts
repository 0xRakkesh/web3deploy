import { Context, Next } from "hono";
import { verifyToken } from "@clerk/backend";
import { CloudflareBindings, Variables } from "../index";

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

export const requireAuth = async (c: Context<{ Bindings: CloudflareBindings, Variables: Variables }>, next: Next) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return c.json({ error: 'Unauthorized: Missing token' }, 401);
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: c.env.CLERK_SECRET_KEY,
    });
    
    // Set the user_id for downstream routes
    c.set('authUser', { user_id: payload.sub });
    return next();
  } catch (error) {
    return c.json({ error: 'Unauthorized: Invalid token' }, 401);
  }
};

export const requireAuthOrServiceToken = async (c: Context<{ Bindings: CloudflareBindings, Variables: Variables }>, next: Next) => {
  const authHeader = c.req.header('Authorization');
  
  if (c.env.CLERK_SECRET_KEY && authHeader === `Bearer ${c.env.CLERK_SECRET_KEY}`) {
    c.set('authUser', { user_id: 'service_account' });
    return next();
  }

  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return c.json({ error: 'Unauthorized: Missing token' }, 401);
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: c.env.CLERK_SECRET_KEY,
    });
    
    c.set('authUser', { user_id: payload.sub });
    return next();
  } catch (error) {
    return c.json({ error: 'Unauthorized: Invalid token' }, 401);
  }
};
