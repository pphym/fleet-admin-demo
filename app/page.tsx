import { cookies } from "next/headers";
import { AUTH_COOKIE, verifyToken } from "@/lib/auth";
import { Login, VehicleTable } from "./ui";

export default async function Page() {
  const user = verifyToken((await cookies()).get(AUTH_COOKIE)?.value);
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
