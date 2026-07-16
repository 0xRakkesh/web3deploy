import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { getDB } from "../db/index.js";
import { users, sessions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { CloudflareBindings, Variables } from "../index.js";
import {
  AUTH_TTL_SECONDS,
  JWT_EXPIRY_SECONDS,
  DeviceAuthEntry,
  generateUserCode,
} from "../lib/auth-tokens.js";
import { exchangeGithubCode, fetchGithubUser } from "../lib/github.js";

export const cliAuthRouter = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// 1. CLI requests a login session
cliAuthRouter.post("/request", async (c) => {
  const deviceCode = crypto.randomUUID();
  const userCode = generateUserCode();
  const verificationUri = new URL(c.req.url).origin + "/cli/verify";

  const entry: DeviceAuthEntry = { userCode, status: "pending", pollCount: 0 };

  // Write both KV keys in parallel — safe without transactions; failures expire naturally
  await Promise.all([
    c.env.CLI_AUTH_KV.put(`dev:${deviceCode}`, JSON.stringify(entry), {
      expirationTtl: AUTH_TTL_SECONDS,
    }),
    c.env.CLI_AUTH_KV.put(`code:${userCode}`, deviceCode, {
      expirationTtl: AUTH_TTL_SECONDS,
    }),
  ]);

  return c.json({ deviceCode, userCode, verificationUri, expiresIn: AUTH_TTL_SECONDS });
});

// 2. CLI polls to check if browser auth is complete
cliAuthRouter.post("/poll", async (c) => {
  const body = await c.req.json<{ deviceCode?: string }>();
  if (!body.deviceCode) return c.json({ error: "deviceCode is required" }, 400);

  const raw = await c.env.CLI_AUTH_KV.get(`dev:${body.deviceCode}`);
  if (!raw) return c.json({ error: "Invalid or expired device code" }, 404);

  const entry: DeviceAuthEntry = JSON.parse(raw);

  if (entry.status === "pending") {
    const currentPollCount = (entry.pollCount || 0) + 1;
    if (currentPollCount > 60) {
      await Promise.all([
        c.env.CLI_AUTH_KV.delete(`dev:${body.deviceCode}`),
        c.env.CLI_AUTH_KV.delete(`code:${entry.userCode}`),
      ]);
      return c.json({ error: "Session expired due to excessive polling" }, 429);
    }
    
    // Update poll count without awaiting
    c.executionCtx.waitUntil(
      c.env.CLI_AUTH_KV.put(`dev:${body.deviceCode}`, JSON.stringify({ ...entry, pollCount: currentPollCount }), {
        expirationTtl: AUTH_TTL_SECONDS,
      })
    );
  }

  if (entry.status === "approved" && entry.cliToken) {
    // Delete both KV keys immediately to prevent token reuse
    await Promise.all([
      c.env.CLI_AUTH_KV.delete(`dev:${body.deviceCode}`),
      c.env.CLI_AUTH_KV.delete(`code:${entry.userCode}`),
    ]);
    return c.json({ status: "approved", token: entry.cliToken });
  }

  return c.json({ status: "pending" });
});

// 3. GitHub OAuth callback
cliAuthRouter.get("/github/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state"); // state = userCode

  if (!code || !state) {
    return c.redirect("/cli/verify?error=Missing+OAuth+parameters");
  }

  const accessToken = await exchangeGithubCode(
    c.env.GITHUB_CLIENT_ID,
    c.env.GITHUB_CLIENT_SECRET,
    code
  );
  if (!accessToken) {
    return c.redirect("/cli/verify?error=Failed+to+exchange+token");
  }

  const githubUser = await fetchGithubUser(accessToken);
  if (!githubUser) {
    return c.redirect("/cli/verify?error=Failed+to+fetch+user+profile");
  }

  const githubUserId = githubUser.id.toString();
  const githubEmail = githubUser.email || githubUser.login;

  // Resolve deviceCode from userCode
  const deviceCode = await c.env.CLI_AUTH_KV.get(`code:${state}`);
  if (!deviceCode) return c.redirect("/cli/verify?error=Invalid+or+expired+code");

  const raw = await c.env.CLI_AUTH_KV.get(`dev:${deviceCode}`);
  if (!raw) return c.redirect("/cli/verify?error=Session+expired");

  const entry: DeviceAuthEntry = JSON.parse(raw);
  if (entry.status !== "pending") return c.redirect("/cli/verify?error=Code+already+used");

  const db = getDB(c.env);

  // Upsert user
  await db
    .insert(users)
    .values({
      id: githubUserId,
      github_id: githubUserId,
      email: githubEmail,
      login: githubUser.login,
      avatar_url: githubUser.avatar_url,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: githubEmail,
        login: githubUser.login,
        avatar_url: githubUser.avatar_url,
        updated_at: new Date().toLocaleString(),
      },
    });

  // Create session
  const jti = crypto.randomUUID();
  await db.insert(sessions).values({
    id: jti,
    user_id: githubUserId,
    expires_at: new Date(Date.now() + JWT_EXPIRY_SECONDS * 1000).toLocaleString(),
  });

  // Sign a 90-day CLI JWT
  const cliToken = await sign(
    { sub: githubUserId, jti, exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY_SECONDS },
    c.env.JWT_SECRET
  );

  // Mark session as approved in KV
  const updated: DeviceAuthEntry = { ...entry, status: "approved", cliToken, githubUserId, githubEmail };
  await c.env.CLI_AUTH_KV.put(`dev:${deviceCode}`, JSON.stringify(updated), {
    expirationTtl: AUTH_TTL_SECONDS,
  });

  let redirectUrl = `/cli/verify?success=true&email=${encodeURIComponent(githubEmail)}`;
  if (githubUser.avatar_url) {
    redirectUrl += `&avatar=${encodeURIComponent(githubUser.avatar_url)}`;
  }
  return c.redirect(redirectUrl);
});

// 4. Logout — revokes the D1 session
cliAuthRouter.post("/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ success: false, error: "Missing token" }, 401);
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = await verify(token, c.env.JWT_SECRET, "HS256");
    const jti = payload.jti as string;
    if (jti) {
      const db = getDB(c.env);
      await db
        .update(sessions)
        .set({ revoked_at: new Date().toLocaleString() })
        .where(eq(sessions.id, jti));
    }
    return c.json({ success: true });
  } catch {
    // Return success anyway — the client will clear its local token
    return c.json({ success: true });
  }
});
