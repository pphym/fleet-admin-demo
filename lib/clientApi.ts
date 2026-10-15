/** status 0 = the request was aborted before a response arrived */
export type Trace = (entry: { method: string; url: string; status: number; ms: number }) => void;

type Options = { body?: unknown; signal?: AbortSignal; trace?: Trace };

// Several requests can hit 401 at the same moment (e.g. table + view state).
// They all wait on ONE refresh call instead of each firing their own.
let refreshing: Promise<boolean> | null = null;

function refreshOnce(trace?: Trace): Promise<boolean> {
  refreshing ??= timed("POST", "/api/auth/refresh", { method: "POST" }, trace)
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => (refreshing = null));
  return refreshing;
}

async function timed(method: string, url: string, init: RequestInit, trace?: Trace) {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  try {
    const res = await fetch(url, init);
    trace?.({ method, url, status: res.status, ms: ms() });
    return res;
  } catch (e) {
    if (init.signal?.aborted) trace?.({ method, url, status: 0, ms: ms() });
    throw e;
  }
}

/**
 * fetch() for the BFF. On 401 it refreshes the access token once and retries
 * the original request. If the refresh fails too, the 401 is returned and the
 * caller sends the user back to sign in.
 */
export async function api(method: string, url: string, { body, signal, trace }: Options = {}) {
  const init: RequestInit = {
    method,
    signal,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  const res = await timed(method, url, init, trace);
  if (res.status !== 401 || !(await refreshOnce(trace))) return res;
  return timed(method, url, init, trace);
}
