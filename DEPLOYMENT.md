# RouteIQ — Deployment Guide

RouteIQ is a three-part deployment: **Supabase** (PostgreSQL + Auth), **FastAPI backend**, and the **Vite/React frontend on Vercel**. No secrets are committed; everything is configured through environment variables (templates: `backend/.env.example`, `frontend/.env.example`).

## 1. Supabase (database + auth)

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → Database**, copy the connection string:
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres` (use the **transaction** pooler port `6543` for the backend; use `5432` direct only if your host supports it).
3. In **Project Settings → API**, copy the Project URL, anon/public key, and the JWT secret.
4. Schema is **created automatically** by the backend on startup (`init_db()` is idempotent) — no manual migration step is required. For existing Supabase databases, the same startup path creates any missing tables and hot-path indexes.
5. Enable **Supabase Auth → Email** provider (or your chosen provider) so `/auth/login` can proxy GoTrue.

> Optional but recommended: run `backend/tests` against a throwaway database first to confirm connectivity before pointing production at it.

## 2. Backend (FastAPI)

### Environment

Copy `backend/.env.example` to `backend/.env` and set:

| Variable | Production value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | Your Redis (e.g. Upstash/Redis Cloud); leave out for the built-in in-memory fallback |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key (needed to proxy login/signup through GoTrue) |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret (server-side verification of access tokens) |
| `CORS_ORIGINS` | Comma-separated allowed origins, e.g. `https://routeiq.vercel.app` |
| `OSRM_URL` | Your OSRM instance, or the public `https://router.project-osrm.org` |

In production, `require_user` verifies the Supabase JWT (HS256, `aud=authenticated`). In development with empty Supabase vars, the signed dev-token fallback (`routeiq-ops-session-token`) is active.

### Run

```bash
cd backend
pip install -r requirements.txt
ENVIRONMENT=production uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

Workers: keep the optimizer and OSRM calls CPU-bounded — 2–4 workers is typical. For orchestrators, run one process per worker (e.g. Gunicorn `uvicorn.workers.UvicornWorker`). Expose `/health` (public liveness/readiness) and `/diagnostics` (authenticated) to your monitoring.

## 3. Frontend (Vercel)

`frontend/vercel.json` already configures the Vite build output and SPA rewrites so deep links (e.g. `/orders/ORD-9912`) resolve.

### Environment variables (Vercel project settings)

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<your-backend-domain>` |
| `VITE_WS_URL` | `wss://<your-backend-domain>/tracking/ws/events` |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

**Important:** the WebSocket URL must use `wss://` in production, and the backend origin must be in `CORS_ORIGINS`.

Deploy: import the repo into Vercel with framework preset **Vite** (build `npm run build`, output `dist`) — or connect the `frontend/` directory as the root of a Vercel project.

> **Timezone:** the backend writes naive timestamps via `datetime.now()` and comparisons (deadlines, ETAs, delay windows) assume the application clock matches the database session clock. Set the **same timezone on the backend host and the Postgres session** (UTC recommended) via `TZ=UTC` for the backend process and `ALTER DATABASE ... SET TIMEZONE TO 'UTC'`. Mismatched clocks skew displayed ETAs and SLA states.

- `GET /health` → `{"status":"healthy","database":"connected","redis":"connected"}`.
- Login via Supabase credentials returns a real session; protected endpoints return `401` without a Bearer token.
- Live Tracking shows a connected WebSocket indicator (`/tracking/ws/events` reachable over `wss://`).
- CORS: a browser request from the Vercel origin succeeds.
- `GET /diagnostics` (with token) reports uptime and active WebSocket clients.
