import { createHmac, timingSafeEqual } from "node:crypto";

export type Role = "admin" | "viewer";
export type Action = "VIEW" | "DELETE";
export type User = { sub: string; name: string; role: Role; exp: number };

/** Fake accounts — the demo is about the BFF, not about passwords. */
export const DEMO_USERS: Record<Role, Omit<User, "exp">> = {
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

export function signToken(user: Omit<User, "exp">, ttlSeconds = 3600): string {
  const body = b64(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${HEADER}.${body}.${b64(sign(`${HEADER}.${body}`))}`;
}

export function verifyToken(token: string | null | undefined): User | null {
  const [header, body, sig] = token?.split(".") ?? [];
  if (header !== HEADER || !body || !sig) return null;
  const expected = sign(`${header}.${body}`);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const user = JSON.parse(Buffer.from(body, "base64url").toString()) as User;
    return user.exp > Date.now() / 1000 ? user : null;
  } catch {
    return null;
  }
}

export const AUTH_COOKIE = "auth_token";
