import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { CloudflareBindings } from "../index";
import { getDB } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { sign } from "hono/jwt";

const githubAuthSchema = z.object({
  code: z.string()
});

const authRouter = new Hono<{ Bindings: CloudflareBindings }>();

authRouter.post('/github', zValidator('json', githubAuthSchema), async (c) => {
  const { code } = c.req.valid('json');
  const db = getDB(c.env);

  const clientId = c.env.GITHUB_CLIENT_ID;
  const clientSecret = c.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return c.json({ error: "GitHub OAuth is not configured on the server." }, 500);
  }

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    const tokenData = await tokenRes.json() as any;
    if (tokenData.error) {
      return c.json({ error: tokenData.error_description || "Failed to exchange code" }, 400);
    }

    const accessToken = tokenData.access_token;

    // 2. Fetch user profile from GitHub
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `token ${accessToken}`,
        "User-Agent": "w3deploy-api"
      }
    });

    const userData = await userRes.json() as any;
    if (!userData.id) {
      return c.json({ error: "Failed to fetch GitHub profile" }, 400);
    }

    // Fetch primary email
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        "Authorization": `token ${accessToken}`,
        "User-Agent": "w3deploy-api"
      }
    });
    const emailsData = await emailRes.json() as any[];
    const primaryEmailObj = emailsData.find(e => e.primary) || emailsData[0];
    const email = primaryEmailObj?.email;

    if (!email) {
      return c.json({ error: "No email associated with GitHub account" }, 400);
    }

    // 3. Upsert user in database
    const githubIdStr = String(userData.id);
    let [existingUser] = await db.select().from(users).where(eq(users.github_id, githubIdStr));
    
    if (!existingUser) {
      // Fallback check by email
      const [emailUser] = await db.select().from(users).where(eq(users.email, email));
      if (emailUser) {
        existingUser = emailUser;
        // Update github_id on existing user
        await db.update(users).set({ github_id: githubIdStr, avatar_url: userData.avatar_url }).where(eq(users.id, existingUser.id));
      } else {
        // Create new user
        const [newUser] = await db.insert(users).values({
          name: userData.name || userData.login,
          email: email,
          avatar_url: userData.avatar_url,
          github_id: githubIdStr
        }).returning();
        existingUser = newUser;
      }
    }

    // 4. Generate JWT Token
    const payload = {
      user_id: existingUser.id,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
    };
    const secret = c.env.JWT_SECRET || 'fallback_secret_for_development';
    const token = await sign(payload, secret);

    return c.json({
      user: existingUser,
      token
    }, 200);

  } catch (err) {
    console.error("Auth error:", err);
    return c.json({ error: "Authentication failed" }, 500);
  }
});

export default authRouter;
