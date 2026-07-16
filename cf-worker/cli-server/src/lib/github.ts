/**
 * Exchanges a GitHub OAuth code for an access token.
 * Returns `null` if the exchange fails.
 */
export async function exchangeGithubCode(
  clientId: string,
  clientSecret: string,
  code: string
): Promise<string | null> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  if (!res.ok) return null;

  const data = await res.json<{ access_token?: string }>();
  return data.access_token ?? null;
}

export interface GithubUser {
  id: number;
  login: string;
  email: string | null;
  avatar_url?: string;
}

/**
 * Fetches the authenticated user's GitHub profile.
 * Returns `null` if the request fails.
 */
export async function fetchGithubUser(accessToken: string): Promise<GithubUser | null> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "w3deploy-cli",
    },
  });

  if (!res.ok) return null;
  return res.json<GithubUser>();
}
