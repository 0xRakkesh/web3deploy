import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { CloudflareBindings } from "../index";
import { getDB } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { sign } from "hono/jwt";

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  avatar_url: z.string().url().optional(),
  github_id: z.string().optional(),
});

import { requireAuth } from "../middleware/index";

const usersRouter = new Hono<{ Bindings: CloudflareBindings }>();

usersRouter.get('/:id', requireAuth, async (c) => {
  const db = getDB(c.env);
  const userId = c.req.param('id');

  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ user });
  } catch (error) {
    return c.json({ error: "Failed to fetch user" }, 500);
  }
});

usersRouter.post('/', zValidator('json', createUserSchema), async (c) => {
  const body = c.req.valid('json');
  const db = getDB(c.env);

  try {
    const [existingUser] = await db.select().from(users).where(eq(users.email, body.email));
    if (existingUser) {
      return c.json({ error: "Conflict: A user with this email already exists." }, 409);
    }

    const [insertedUser] = await db.insert(users).values(body).returning();

    const payload = {
      user_id: insertedUser.id,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    };
    const secret = c.env.JWT_SECRET || 'fallback_secret_for_development';
    const token = await sign(payload, secret);

    return c.json({
      user: insertedUser,
      token
    }, 201);
  } catch (error) {
    console.error("Database error:", error);
    return c.json({ error: "Failed to create user" }, 500);
  }
});

export default usersRouter;
