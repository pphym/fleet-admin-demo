"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@/lib/auth";
import type { Vehicle } from "@/lib/db";
import type { Page } from "@/lib/pagination";

export function Login() {
  const router = useRouter();
  const login = async (user: Role) => {
    await fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ user }) });
    router.refresh();
  };
  return (
    <section className="card">
      <h2>Sign in as</h2>
      <div className="row">
        <button onClick={() => login("admin")}>Alice: admin (view + delete)</button>
        <button onClick={() => login("viewer")}>Bob: viewer (view only)</button>
      </div>
    </section>
  );
}

type Nav = { cursor: string | null; dir: "next" | "prev" };
type LogEntry = { method: string; url: string; status: number; ms: number };

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export function VehicleTable({ name, role }: { name: string; role: Role }) {
  const router = useRouter();
  const [nav, setNav] = useState<Nav>({ cursor: null, dir: "next" });
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [reload, setReload] = useState(0);

  // debounce the search box, and start again from page 1
  useEffect(() => {
    if (search.trim() === q) return; // nothing changed (also skips the first render)
    const t = setTimeout(() => {
      setQ(search.trim());
      setNav({ cursor: null, dir: "next" });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function call(method: string, url: string, signal?: AbortSignal) {
    const t0 = performance.now();
    const res = await fetch(url, { method, signal });
    setLog((l) => [{ method, url, status: res.status, ms: Math.round(performance.now() - t0) }, ...l].slice(0, 6));
    if (res.status === 401) router.refresh(); // token expired → back to the login card
    return res;
  }

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams({ limit: String(limit), dir: nav.dir });
    if (nav.cursor) params.set("cursor", nav.cursor);
    if (q) params.set("q", q);
    call("GET", `/api/vehicles?${params}`, ctrl.signal)
      .then(async (res) => {
        const body = await res.json();
        if (res.ok) {
          setPage(body);
          setError(null);
        } else setError(`${res.status}: ${body.message}`);
      })
      .catch((e) => e.name !== "AbortError" && setError(String(e)));
    return () => ctrl.abort(); // a newer click cancels the stale request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, limit, q, reload]);

  async function remove(v: Vehicle) {
    const res = await call("DELETE", `/api/vehicles/${v.id}`);
    if (res.ok) {
      setError(null);
      setReload((n) => n + 1); // same cursor → same page, minus the deleted row
    } else {
      const body = await res.json();
      setError(`${res.status}: ${body.message}. The server refused, whatever the UI shows.`);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  const go = (cursor: string | null, dir: Nav["dir"]) => setNav({ cursor, dir });

  return (
    <section className="card">
      <div className="row spread">
        <span>
          Signed in as <b>{name}</b> <span className={`badge ${role}`}>{role}</span>
        </span>
        <button className="ghost" onClick={logout}>Sign out</button>
      </div>

      <div className="row spread">
        <input
          type="search"
          placeholder="Search plate, e.g. DEMO-012"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search plate"
        />
        <label>
          Rows{" "}
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              go(null, "next");
            }}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Plate</th>
              <th>Model</th>
              <th>Status</th>
              <th>Created (UTC)</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {page?.items.map((v) => (
              <tr key={v.id}>
                <td className="num">{v.id}</td>
                <td>{v.plate}</td>
                <td>{v.model}</td>
                <td><span className={`dot ${v.status}`} />{v.status}</td>
                <td>{fmt.format(v.createdAt)}</td>
                <td>
                  {/* Shown to the viewer on purpose: the BFF answers 403 anyway. */}
                  <button className="ghost danger" onClick={() => remove(v)}>Delete</button>
                </td>
              </tr>
            ))}
            {page?.items.length === 0 && (
              <tr><td colSpan={6} className="muted">No vehicles match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <nav className="row pager" aria-label="Pagination">
        <button onClick={() => go(null, "next")} disabled={!page?.prevCursor}>« First</button>
        <button onClick={() => go(page!.prevCursor, "prev")} disabled={!page?.prevCursor}>‹ Prev</button>
        <button onClick={() => go(page!.nextCursor, "next")} disabled={!page?.nextCursor}>Next ›</button>
        <button onClick={() => go(null, "prev")} disabled={!page?.nextCursor}>Last »</button>
      </nav>

      <details open>
        <summary>Request log (browser → BFF)</summary>
        <ul className="log">
          {log.map((e, i) => (
            <li key={i}>
              <code className={e.status < 400 ? "ok" : "bad"}>{e.status}</code> <code>{e.method} {decodeURIComponent(e.url)}</code>{" "}
              <span className="muted">{e.ms} ms</span>
            </li>
          ))}
        </ul>
        <p className="muted small">
          The cursor in the URL is opaque base64. The browser never holds the JWT: the BFF reads it from the
          httpOnly cookie and forwards it as <code>Authorization: Bearer</code>.
        </p>
      </details>
    </section>
  );
}
