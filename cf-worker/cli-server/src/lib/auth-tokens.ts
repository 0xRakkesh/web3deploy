/** 15 minutes — matches the CLI polling window. */
export const AUTH_TTL_SECONDS = 900;

/** 90 days — long-lived so users rarely need to re-authenticate. */
export const JWT_EXPIRY_SECONDS = 60 * 60 * 24 * 90;

/** Shape of the data stored in KV per auth session. */
export type DeviceAuthEntry = {
  userCode: string;
  status: "pending" | "approved";
  cliToken?: string;
  githubUserId?: string;
  githubEmail?: string;
  pollCount?: number;
};

/**
 * Generates a human-readable 8-character code in the format `XXXX-XXXX`.
 * Omits visually ambiguous characters (I, O, 1, 0).
 */
export function generateUserCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result.slice(0, 4) + "-" + result.slice(4);
}
