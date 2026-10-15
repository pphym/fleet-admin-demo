import { bffProxy } from "@/lib/bff";

// Users can only touch their own view state (the backend scopes rows to the
// token's user), so being able to view the app is enough.
const proxy = bffProxy("ui-state", {
  GET: "VIEW",
  PATCH: "VIEW",
  DELETE: "VIEW",
});

export { proxy as GET, proxy as PATCH, proxy as DELETE };
