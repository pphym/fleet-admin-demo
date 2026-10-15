"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/auth";
import { api, type Trace } from "@/lib/clientApi";
import type { Vehicle } from "@/lib/db";
import type { Page } from "@/lib/pagination";
import { LIMITS, useViewState, type View } from "./useViewState";

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

type LogEntry = Parameters<Trace>[0];

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export function VehicleTable({ name, role }: { name: string; role: Role }) {
  const router = useRouter();
  const [log, setLog] = useState<LogEntry[]>([]);
  const trace: Trace = (e) => setLog((l) => [e, ...l].slice(0, 8));

  // every request goes through api(): 401 → refresh → retry; if that fails, sign in again
  const call: typeof api = async (method, url, opts) => {
    const res = await api(method, url, { ...opts, trace });
    if (res.status === 401) router.refresh();
    return res;
  };

  const { view, update, status, reset } = useViewState(call);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [slow, setSlow] = useState(false);
  const [loading, setLoading] = useState(false);
  const inflight = useRef<AbortController | null>(null);
  // the view behind the rows on screen; Cancel goes back to it
  const shown = useRef<{ key: string; view: View } | null>(null);

  // show the saved search once the view state has loaded
  useEffect(() => {
    if (status === "ready") setSearch(view.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // debounce the search box, and start again from page 1
  useEffect(() => {
    if (search.trim() === view.q) return; // nothing changed
    const t = setTimeout(() => update({ q: search.trim(), cursor: null, dir: "next" }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (status === "loading") return; // wait for the saved view, or we'd fetch twice
    const key = JSON.stringify([view.limit, view.q, view.cursor, view.dir, reload]);
    if (shown.current?.key === key) return; // already on screen (e.g. right after Cancel)

    const ctrl = new AbortController();
    inflight.current = ctrl;
    setLoading(true);
    const params = new URLSearchParams({ limit: String(view.limit), dir: view.dir });
    if (view.cursor) params.set("cursor", view.cursor);
    if (view.q) params.set("q", view.q);
    if (slow) params.set("slow", "1");
    const requested = { ...view };

    call("GET", `/api/vehicles?${params}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json();
        if (res.ok) {
          shown.current = { key, view: requested };
          setPage(body);
          setError(null);
        } else if (res.status === 400 && requested.cursor) {
          update({ cursor: null, dir: "next" }); // a stale saved cursor: fall back to page 1
        } else setError(`${res.status}: ${body.message}`);
      })
      .catch((e) => e.name !== "AbortError" && setError(String(e)))
      .finally(() => {
        if (inflight.current === ctrl) {
          inflight.current = null;
          setLoading(false);
        }
      });
    return () => ctrl.abort(); // a newer click cancels the stale request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.limit, view.q, view.cursor, view.dir, status, reload]);

  function cancel() {
    inflight.current?.abort();
    if (shown.current) {
      const { limit, q, cursor, dir } = shown.current.view;
      update({ limit, q, cursor, dir }); // back to the page still on screen, no refetch
      setSearch(q);
    }
    setNotice("Request cancelled. The backend query was aborted too.");
  }

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

  async function resetView() {
    if (await reset()) {
      setSearch("");
      setNotice("View reset to defaults.");
    }
  }

  async function expireToken() {
    await fetch("/api/auth/expire", { method: "POST" });
    setNotice("Access token expired. The next request gets 401, refreshes, then retries.");
    setReload((n) => n + 1);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  const go = (cursor: string | null, dir: View["dir"]) => update({ cursor, dir });

  return (
    <section className="card">
      <div className="row spread">
        <span>
          Signed in as <b>{name}</b> <span className={`badge ${role}`}>{role}</span>
        </span>
        <span className="row">
          <button className="ghost" onClick={expireToken} title="Show the 401 → refresh → retry flow">
            Expire my token
          </button>
          <button className="ghost" onClick={logout}>Sign out</button>
        </span>
      </div>

      <div className="row spread">
        <input
          type="search"
          placeholder="Search plate, e.g. DEMO-012"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search plate"
        />
        <span className="row">
          <label>
            Rows{" "}
            <select
              value={view.limit}
              onChange={(e) => update({ limit: Number(e.target.value), cursor: null, dir: "next" })}
            >
              {LIMITS.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={slow} onChange={(e) => setSlow(e.target.checked)} /> Slow backend (3 s)
          </label>
          <button className="ghost" onClick={resetView} disabled={status !== "ready"}>
            Reset view
          </button>
        </span>
      </div>

      <p className="muted small">
        {status === "unavailable"
          ? "Saved view could not be loaded. Using defaults, and changes are not saved."
          : "Rows per page, search and current page are saved to your account. Reload or sign in again to see them come back."}
      </p>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && !error && <p className="notice" role="status">{notice}</p>}

      <div className="table-area" aria-busy={loading}>
        {loading && (
          <div className="overlay">
            <div className="overlay-box" role="status">
              <span className="spinner" aria-hidden /> Loading…
              <button className="ghost" onClick={cancel}>Cancel</button>
            </div>
          </div>
        )}
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
              <code className={e.status && e.status < 400 ? "ok" : "bad"}>{e.status || "cancelled"}</code>{" "}
              <code>{e.method} {decodeURIComponent(e.url)}</code> <span className="muted">{e.ms} ms</span>
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
