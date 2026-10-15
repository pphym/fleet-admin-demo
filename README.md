# Fleet Admin Demo

A small vehicle admin table that shows patterns I use at work, rebuilt from scratch on **fake data**:

1. **Keyset (cursor) pagination**: First / Prev / Next / Last over 10,000 rows. Every page costs the same, and rows are never skipped or repeated while the data changes.
2. **BFF with server-side, fail-closed permissions**: the browser never sees the JWT. A Next.js route reads it from an httpOnly cookie, checks the permission for the action, and forwards the request to the backend as `Authorization: Bearer`.
3. **Per-user view state with refresh-token retry**: rows per page, search and current page are saved to the user's account. Only the changed keys are sent, in one debounced bulk request. An expired token is refreshed and the request retried, without the user noticing.
4. **Cancellable loading**: Cancel aborts the request in the browser, in the BFF and in the backend.
5. **Styled Excel export**: built on the server, with auto-fit columns, number and date formats, and a total row with a live `SUM` formula.

No database server: it uses Next.js, Node's built-in `node:sqlite` (in memory) and `node:crypto` for the JWT. The only other dependency is `xlsx-js-style`, for the Excel file.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # pagination tests (node:test)
```

Sign in as **Alice (admin)** or **Bob (viewer)**. Bob still sees the Delete button on purpose: clicking it returns **403** from the server, because a hidden or disabled button is not access control.

Production (`npm run build && npm start`) refuses to sign tokens unless `JWT_SECRET` is set (see `.env.example`). Requires Node ≥ 22.13.

## 1. Cursor pagination

```
GET /api/vehicles?limit=20                       → first page
GET /api/vehicles?limit=20&cursor=<next>         → Next
GET /api/vehicles?limit=20&cursor=<prev>&dir=prev → Prev
GET /api/vehicles?limit=20&dir=prev              → Last
→ { items, nextCursor, prevCursor }   (null = no page that way)
```

The cursor is base64url of the `(created_at, id)` of the boundary row. The query is a range seek on the composite index ([lib/pagination.ts](lib/pagination.ts)):

```sql
SELECT … FROM vehicles
 WHERE (created_at, id) < (?, ?)          -- "after" the cursor
 ORDER BY created_at DESC, id DESC
 LIMIT 21                                 -- limit + 1: is there more?
```

**Why not `LIMIT 20 OFFSET 400`?**

| | OFFSET | Cursor |
|---|---|---|
| Page 500 | the DB reads and throws away 9,980 rows | one index seek, same cost as page 1 |
| A row is inserted while you browse | the last row of page 1 shows again on page 2 | no duplicates |
| A row is deleted | a row gets skipped | no skips |
| Jump to page 37 | possible | not possible: First/Prev/Next/Last only (a fair trade for feeds and admin tables) |

Details that are easy to get wrong, each covered by a test in [test/pagination.test.ts](test/pagination.test.ts):

- **Ties.** Many rows share a `created_at`, so the cursor carries `id` as a tie-breaker. The tests seed 250 rows into only 10 timestamps to force it.
- **Prev.** Read ascending from the cursor, then reverse. If that would give a short first page, serve the real first page instead.
- **Tampered cursor.** Returns 400. It is never silently treated as page 1.
- **Search plus cursor.** `LIKE` wildcards in the search box are escaped.
- **Index.** A test asserts that `EXPLAIN QUERY PLAN` uses the index and never builds a temp B-tree to sort.

## 2. BFF and permissions

```
Browser ──(httpOnly cookie)──▶ /api/vehicles/*  (BFF)
                                 1. verify JWT            → 401
                                 2. method → action, can()? → 403 (fail closed)
                                 3. forward ──(Bearer)──▶ /api/backend/vehicles/*
                                                            verify + re-check role → 401 / 403
```

- **One catch-all route** ([app/api/vehicles/[[...path]]/route.ts](app/api/vehicles/[[...path]]/route.ts)) covers the whole namespace instead of one file per endpoint.
- **Fail closed.** A method with no mapped action, or a role not in the grant table, is denied.
- **Defence in depth.** The backend accepts only `Bearer` (a cookie gets 401) and re-checks the role, because anyone can call it directly.
- **Same error shape everywhere:** `{ success: false, message }`. The backend's status code passes through unchanged.

Try it with curl:

```bash
curl -c jar -X POST localhost:3000/api/auth/login -d '{"user":"viewer"}'
curl -b jar -X DELETE localhost:3000/api/vehicles/1          # 403 Forbidden
curl -X DELETE localhost:3000/api/backend/vehicles/1         # 401 (no Bearer)
```

## 3. Per-user view state

```
GET    /api/ui-state                      → { state: { "vehicles.limit": 50, … } }
PATCH  /api/ui-state  { changes: { "vehicles.q": "DEMO", "vehicles.cursor": null } }
DELETE /api/ui-state                      → back to defaults ("Reset view")
```

The client hook is [app/useViewState.ts](app/useViewState.ts):

- **Load first, then save.** Nothing is saved until the stored view has loaded, so the defaults the page starts with never overwrite what the user saved.
- **Diff against the last saved snapshot.** Only changed keys go out, batched into one PATCH after 500 ms. If a save fails, those keys still differ and go out with the next change.
- **Retry the load with backoff** on 5xx or network errors. If it keeps failing, the page uses defaults and stops saving, rather than clobbering stored data.
- **Validate on read too.** A stored value that is no longer valid (an unknown page size, or a cursor that now gets 400) falls back to its default.

The server validates each PATCH and applies it in one transaction, scoped to the token's user ([lib/uiState.ts](lib/uiState.ts)): at most 20 keys, a key pattern, and 2 KB per value. `null` deletes a key.

**401 → refresh → retry** ([lib/clientApi.ts](lib/clientApi.ts)): the access token is short-lived (`ACCESS_TTL`, 15 min by default) and the refresh token lasts a day. Both are httpOnly cookies. On a 401 the client calls `/api/auth/refresh` once and retries the original request. Concurrent 401s share a single refresh call. A refresh token is rejected where an access token is expected, and the reverse. Each refresh looks the user up again, so a role change applies at the next refresh. The **Expire my token** button shows the whole flow in the request log.

## 4. Cancellable loading

Tick **Slow backend (3 s)** and change page. After 200 ms a loading box appears with a **Cancel** button. A CSS animation delay keeps fast pages from flickering, and the box is `sticky`, so it stays on screen however far down you are.

Cancel goes all the way down:

```
Cancel → AbortController.abort()            (browser)
       → request.signal aborts the BFF's fetch (lib/bff.ts passes it on)
       → the backend's wait/query stops      ("[backend] slow query cancelled" in the server log)
```

- The rows already on screen stay. The view (page, search) goes back to match them, without fetching again.
- Clicking again while a request is in flight aborts the stale request, so a slow old response can never overwrite a newer page.
- The request log shows aborted requests as `cancelled`.

## 5. Excel export

`GET /api/vehicles/export?q=` returns every vehicle that matches the current search as an `.xlsx` file ([lib/excel.ts](lib/excel.ts)). It goes through the same BFF permission check as everything else.

- **Built on the server.** The roughly 1 MB spreadsheet library never ships to the browser. 10,000 rows take about 0.2 s and produce a 1 MB file.
- **Formatting.** Bold header, Calibri, `#,##0` for kilometres, and `yyyy-mm-dd hh:mm` dates. Dates are converted from UTC by hand, so the file does not depend on the server's time zone.
- **Auto-fit columns.** Each column is as wide as its longest value *as Excel will display it* (`124,456`, not `124456`).
- **Total row.** A live `SUM(E2:E…)` formula with a cached value, so viewers that don't recalculate still show the number.
- **Download through `fetch` + blob** instead of a plain link, so an expired token is refreshed and retried like any other request.
- **Row cap.** More than 20,000 rows returns 400 ("narrow the search").

Tests: [test/excel.test.ts](test/excel.test.ts) reads the generated file back and checks the formula, the UTC dates and the column widths.

## Known limits (on purpose)

- The data lives in memory and is re-seeded on restart, so deletes don't survive a restart. For durable data, swap in Turso or Postgres; the SQL stays the same.
- The demo users have no passwords. This repo is about the BFF, not about login.
- The "backend" lives in the same app. Set `BACKEND_URL` to point the BFF at a separate service.
