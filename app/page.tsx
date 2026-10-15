import { cookies } from "next/headers";
import { AUTH_COOKIE, REFRESH_COOKIE, verifyToken } from "@/lib/auth";
import { Login, VehicleTable } from "./ui";

export default async function Page() {
  const jar = await cookies();
  // An expired access token is fine while the refresh token is valid:
  // the first API call gets 401, refreshes, and retries.
  const user =
    verifyToken(jar.get(AUTH_COOKIE)?.value) ??
    verifyToken(jar.get(REFRESH_COOKIE)?.value, "refresh");
  return (
    <main>
      <header>
        <h1>Fleet Admin Demo</h1>
        <p className="muted">
          Keyset cursor pagination behind a BFF that holds the JWT in an httpOnly cookie. All data is fake.
        </p>
      </header>
      {user ? <VehicleTable name={user.name} role={user.role} /> : <Login />}
    </main>
  );
}
