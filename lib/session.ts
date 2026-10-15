import type { NextResponse } from "next/server";
import {
  ACCESS_TTL,
  AUTH_COOKIE,
  DEMO_USERS,
  REFRESH_COOKIE,
  REFRESH_TTL,
  signToken,
} from "./auth";

type Account = (typeof DEMO_USERS)[keyof typeof DEMO_USERS];

const base = {
  httpOnly: true, // page JS can never read either token
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};

/** Issue a fresh access token, and also a new refresh token when `rotate` is set. */
export function setSession(res: NextResponse, account: Account, rotate = true) {
  res.cookies.set(AUTH_COOKIE, signToken(account, "access", ACCESS_TTL), {
    ...base,
    path: "/",
    maxAge: ACCESS_TTL,
  });
  if (rotate) {
    res.cookies.set(REFRESH_COOKIE, signToken(account, "refresh", REFRESH_TTL), {
      ...base,
      path: "/",
      maxAge: REFRESH_TTL,
    });
  }
  return res;
}

export function clearSession(res: NextResponse) {
  res.cookies.set(AUTH_COOKIE, "", { ...base, path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...base, path: "/", maxAge: 0 });
  return res;
}
