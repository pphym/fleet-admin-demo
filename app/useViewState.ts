"use client";

import { useEffect, useRef, useState } from "react";
import type { api } from "@/lib/clientApi";

export const LIMITS = [10, 20, 50, 100] as const;

export type View = {
  limit: number;
  q: string;
  cursor: string | null;
  dir: "next" | "prev";
};

export const DEFAULT_VIEW: View = { limit: 20, q: "", cursor: null, dir: "next" };

const PREFIX = "vehicles.";
const SAVE_DELAY_MS = 500;

/** Stored values are user input from the past: keep only what is still valid. */
function fromStored(state: Record<string, unknown>): View {
  const v = { ...DEFAULT_VIEW };
  const get = (k: keyof View) => state[PREFIX + k];
  if (LIMITS.includes(get("limit") as never)) v.limit = get("limit") as number;
  if (typeof get("q") === "string") v.q = get("q") as string;
  if (typeof get("cursor") === "string") v.cursor = get("cursor") as string;
  if (get("dir") === "prev") v.dir = "prev";
  return v;
}

/**
 * Per-user table view (rows per page, search, current page), stored on the server.
 *
 * - Loads once. Until it has loaded, nothing is saved, so the defaults the
 *   page starts with can never overwrite what the user saved last time.
 * - Saves only the keys that differ from the last saved snapshot, debounced
 *   into one bulk PATCH. If a save fails, those keys are still "different"
 *   and go out with the next change.
 * - Retries a failed load (5xx / network) with backoff. If it still fails,
 *   the page works on defaults and saving stays off.
 */
export function useViewState(call: (...args: Parameters<typeof api>) => ReturnType<typeof api>) {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const saved = useRef<View | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await call("GET", "/api/ui-state").catch(() => null);
        if (cancelled) return;
        if (res?.ok) {
          const loaded = fromStored((await res.json()).state ?? {});
          saved.current = loaded;
          setView(loaded);
          setStatus("ready");
          return;
        }
        if (res && res.status < 500) break; // a 4xx won't fix itself on retry
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
      if (!cancelled) setStatus("unavailable");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const base = saved.current;
    if (!base) return;
    const changed = (Object.keys(view) as (keyof View)[]).filter((k) => view[k] !== base[k]);
    if (changed.length === 0) return;

    const t = setTimeout(async () => {
      const changes = Object.fromEntries(changed.map((k) => [PREFIX + k, view[k]]));
      const res = await call("PATCH", "/api/ui-state", { body: { changes } }).catch(() => null);
      if (res?.ok) saved.current = { ...base, ...view };
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function reset() {
    const res = await call("DELETE", "/api/ui-state");
    if (!res.ok) return false;
    saved.current = DEFAULT_VIEW;
    setView(DEFAULT_VIEW);
    return true;
  }

  const update = (patch: Partial<View>) => setView((v) => ({ ...v, ...patch }));

  return { view, update, status, reset };
}
