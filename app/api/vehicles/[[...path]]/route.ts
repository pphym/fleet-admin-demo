import { bffProxy } from "@/lib/bff";

// One catch-all route covers the whole /vehicles namespace.
const proxy = bffProxy("vehicles", {
  GET: "VIEW",
  DELETE: "DELETE",
});

export { proxy as GET, proxy as DELETE };
