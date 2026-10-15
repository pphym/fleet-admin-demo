import { createHmac, timingSafeEqual } from "node:crypto";

export type Role = "admin" | "viewer";
export type Action = "VIEW" | "DELETE";
export type TokenType = "access" | "refresh";
export type User = { sub: string; name: string; role: Role; exp: number; typ: TokenType };
type Account = Omit<User, "exp" | "typ">;

/** Fake accounts — the demo is about the BFF, not about passwords. */
export const DEMO_USERS: Record<Role, Account> = {
  admin: { sub: "u1", name: "Alice", role: "admin" },
  viewer: { sub: "u2", name: "Bob", role: "viewer" },
};

const GRANTS: Record<Role, readonly Action[]> = {
  admin: ["VIEW", "DELETE"],
  viewer: ["VIEW"],
};

/** Fail closed: unknown role, unknown action, or no action at all → false. */
export function can(role: unknown, action: Action | undefined): boolean {
  if (!action || typeof role !== "string" || !Object.hasOwn(GRANTS, role)) return false;
  return GRANTS[role as Role].includes(action);
}

// --- minimal HS256 JWT (node:crypto only) -----------------------------------

function secret() {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET is not set");
  return "dev-only-secret-do-not-use-in-prod";
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const HEADER = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const sign = (data: string) => createHmac("sha256", secret()).update(data).digest();

export function signToken(account: Account, typ: TokenType, ttlSeconds: number): string {
  const { sub, name, role } = account;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = b64(JSON.stringify({ sub, name, role, exp, typ }));
  return `${HEADER}.${body}.${b64(sign(`${HEADER}.${body}`))}`;
}

/** A refresh token is never accepted where an access token is expected, and vice versa. */
export function verifyToken(token: string | null | undefined, typ: TokenType = "access"): User | null {
  const [header, body, sig] = token?.split(".") ?? [];
  if (header !== HEADER || !body || !sig) return null;
  const expected = sign(`${header}.${body}`);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const user = JSON.parse(Buffer.from(body, "base64url").toString()) as User;
    return user.typ === typ && user.exp > Date.now() / 1000 ? user : null;
  } catch {
    return null;
  }
}

export const AUTH_COOKIE = "auth_token";
export const REFRESH_COOKIE = "refresh_token";

// Short-lived access token, long-lived refresh token. ACCESS_TTL is an env knob
// so the 401 → refresh → retry path is easy to watch (e.g. ACCESS_TTL=20).
export const ACCESS_TTL = Number(process.env.ACCESS_TTL) || 15 * 60;
export const REFRESH_TTL = 24 * 60 * 60;
