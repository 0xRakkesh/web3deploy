import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { getDB } from "../db";
import { users, sessions } from "../db/schema";
import { eq } from "drizzle-orm";

// Shape of data stored in KV per auth session
type DeviceAuthEntry = {
	userCode: string;
	status: "pending" | "approved";
	cliToken?: string;
	githubUserId?: string;
	githubEmail?: string;
};

type Env = {
	Bindings: {
		DB: D1Database;
		CLI_AUTH_KV: KVNamespace;
		GITHUB_CLIENT_ID: string;
		GITHUB_CLIENT_SECRET: string;
		JWT_SECRET: string;
	};
};

export const cliAuthRouter = new Hono<Env>();

// 15 minutes — matches the CLI polling window
const AUTH_TTL_SECONDS = 900;

// JWT expiry: 90 days. Long enough that users rarely re-authenticate.
// This directly reduces the KV write volume at scale.
const JWT_EXPIRY_SECONDS = 60 * 60 * 24 * 90;

function generateUserCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 1, 0 — visually confusing
	let result = "";
	for (let i = 0; i < 8; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result.slice(0, 4) + "-" + result.slice(4);
}

// 1. CLI requests a login session
// Creates two KV keys: one by deviceCode (for CLI polling), one by userCode (for browser verify)
cliAuthRouter.post("/request", async (c) => {
	const deviceCode = crypto.randomUUID();
	const userCode = generateUserCode();
	const verificationUri = new URL(c.req.url).origin + "/cli/verify";

	const entry: DeviceAuthEntry = { userCode, status: "pending" };

	// Write both keys in parallel — KV has no transactions but this is safe:
	// if one write fails, the session simply won't work and will expire naturally.
	await Promise.all([
		c.env.CLI_AUTH_KV.put(`dev:${deviceCode}`, JSON.stringify(entry), {
			expirationTtl: AUTH_TTL_SECONDS,
		}),
		c.env.CLI_AUTH_KV.put(`code:${userCode}`, deviceCode, {
			expirationTtl: AUTH_TTL_SECONDS,
		}),
	]);

	return c.json({
		deviceCode,
		userCode,
		verificationUri,
		expiresIn: AUTH_TTL_SECONDS,
	});
});

// 2. CLI polls to check if browser auth is complete
// KV read: sub-millisecond, globally distributed, scales to any concurrency.
cliAuthRouter.post("/poll", async (c) => {
	const body = await c.req.json<{ deviceCode?: string }>();
	if (!body.deviceCode) return c.json({ error: "deviceCode is required" }, 400);

	const raw = await c.env.CLI_AUTH_KV.get(`dev:${body.deviceCode}`);
	if (!raw) return c.json({ error: "Invalid or expired device code" }, 404);

	const entry: DeviceAuthEntry = JSON.parse(raw);

	if (entry.status === "approved" && entry.cliToken) {
		// Delete both keys immediately to prevent token reuse
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
	const state = c.req.query("state"); // This is our userCode

	if (!code || !state) {
		return c.redirect("/cli/verify?error=Missing+OAuth+parameters");
	}

	// Exchange code for access token
	const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			client_id: c.env.GITHUB_CLIENT_ID,
			client_secret: c.env.GITHUB_CLIENT_SECRET,
			code,
		}),
	});

	if (!tokenRes.ok) {
		return c.redirect("/cli/verify?error=Failed+to+exchange+token");
	}

	const tokenData = await tokenRes.json<{ access_token?: string }>();
	if (!tokenData.access_token) {
		return c.redirect("/cli/verify?error=No+access+token+received");
	}

	// Fetch user info from GitHub
	const userRes = await fetch("https://api.github.com/user", {
		headers: {
			Authorization: `Bearer ${tokenData.access_token}`,
			"User-Agent": "w3deploy-cli",
		},
	});

	if (!userRes.ok) {
		return c.redirect("/cli/verify?error=Failed+to+fetch+user+profile");
	}

	const userData = await userRes.json<{ id: number; email: string | null; login: string; avatar_url?: string }>();
	const githubUserId = userData.id.toString();
	const githubEmail = userData.email || userData.login; // Fallback to login if email is private

	// Look up which deviceCode this userCode belongs to
	const deviceCode = await c.env.CLI_AUTH_KV.get(`code:${state}`);
	if (!deviceCode) {
		return c.redirect("/cli/verify?error=Invalid+or+expired+code");
	}

	const raw = await c.env.CLI_AUTH_KV.get(`dev:${deviceCode}`);
	if (!raw) {
		return c.redirect("/cli/verify?error=Session+expired");
	}

	const entry: DeviceAuthEntry = JSON.parse(raw);
	if (entry.status !== "pending") {
		return c.redirect("/cli/verify?error=Code+already+used");
	}

	const db = getDB(c.env);

	// Upsert User in D1
	await db.insert(users).values({
		id: githubUserId,
		github_id: githubUserId,
		email: githubEmail,
		login: userData.login,
		avatar_url: userData.avatar_url,
	}).onConflictDoUpdate({
		target: users.id, // Primary key is id, we set it to githubUserId
		set: {
			email: githubEmail,
			login: userData.login,
			avatar_url: userData.avatar_url,
			updated_at: new Date(),
		}
	});

	// Create Session in D1
	const jti = crypto.randomUUID();
	await db.insert(sessions).values({
		id: jti,
		user_id: githubUserId,
		expires_at: new Date(Date.now() + JWT_EXPIRY_SECONDS * 1000),
	});

	// Sign a long-lived CLI JWT (90 days)
	const cliToken = await sign(
		{
			sub: githubUserId,
			jti,
			exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY_SECONDS,
		},
		c.env.JWT_SECRET
	);

	// Update the KV entry to approved, keeping same TTL
	const updated: DeviceAuthEntry = {
		...entry,
		status: "approved",
		cliToken,
		githubUserId,
		githubEmail,
	};
	await c.env.CLI_AUTH_KV.put(`dev:${deviceCode}`, JSON.stringify(updated), {
		expirationTtl: AUTH_TTL_SECONDS,
	});

	// Redirect back to verify page with success state
	let redirectUrl = `/cli/verify?success=true&email=${encodeURIComponent(githubEmail)}`;
	if (userData.avatar_url) {
		redirectUrl += `&avatar=${encodeURIComponent(userData.avatar_url)}`;
	}
	return c.redirect(redirectUrl);
});

// 4. CLI logout — revokes the session in D1
cliAuthRouter.post("/logout", async (c) => {
	const authHeader = c.req.header("Authorization");
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return c.json({ success: false, error: "Missing token" }, 401);
	}

	const token = authHeader.split(" ")[1];
	try {
		const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
		const jti = payload.jti as string;
		if (jti) {
			const db = getDB(c.env);
			await db.update(sessions).set({ revoked_at: new Date() }).where(eq(sessions.id, jti));
		}
		return c.json({ success: true });
	} catch (e) {
		// Even if token is invalid/expired locally, we just return success to let the client clear it
		return c.json({ success: true });
	}
});
