# Fleet Admin Demo

A small vehicle admin table that shows two backend patterns I use at work, rebuilt from scratch on **fake data**:

1. **Keyset (cursor) pagination**: First / Prev / Next / Last over 10,000 rows. Every page costs the same, and rows are never skipped or repeated while the data changes.
2. **BFF with server-side, fail-closed permissions**: the browser never sees the JWT. A Next.js route reads it from an httpOnly cookie, checks the permission for the action, and forwards the request to the backend as `Authorization: Bearer`.

No database server and no extra dependencies: it uses Next.js, Node's built-in `node:sqlite` (in memory) and `node:crypto` for the JWT.

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

## Known limits (on purpose)

- The data lives in memory and is re-seeded on restart, so deletes don't survive a restart. For durable data, swap in Turso or Postgres; the SQL stays the same.
- The demo users have no passwords. This repo is about the BFF, not about login.
- The "backend" lives in the same app. Set `BACKEND_URL` to point the BFF at a separate service.
