# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
Qirlpl LIMS — an ISO/IEC 17025 Laboratory Information Management System. It is a monorepo whose only locally-developed piece is the **React + Vite + TypeScript frontend** in `frontend/`. The backend (Auth/GoTrue, PostgREST, Storage, Postgres, and Edge Functions) is **hosted remotely on Railway** and is reachable over the public internet — there is no local database or backend to start. The browser talks to it through `@supabase/supabase-js` pointed at the Railway API gateway (see `README.md`).

### Services
| Service | Location | Run command | Notes |
|---|---|---|---|
| Frontend (main) | `frontend/` | `npm run dev` (from repo root) → Vite on `http://localhost:5173` | Talks to the live Railway backend. |
| PDF service (optional) | `pdf-service/` | `npm run pdf:dev` (from repo root) → `http://127.0.0.1:3847` | Playwright/Chromium renderer for report/certificate PDFs. Vite proxies `/api/pdf` → this service. |
| Backend (Auth/REST/Storage/DB/Functions) | Remote on Railway | not run locally | `railway-stack/` + `backend/` are source only; do not run against them locally. |

### Running the frontend (important gotchas)
- Start it with `npm run dev` from the **repo root**, or `cd frontend && npm run dev`. Do NOT append passthrough args to the root script (e.g. `npm run dev -- --host ...`): the root `dev` script is `npm run dev --prefix frontend`, and extra args make Vite run from the wrong working directory, which serves `/@vite/client` but returns 404 for `/`, `/index.html`, and `/src/main.tsx`.
- Keep Vite on port **5173** and access it via `localhost:5173` / `127.0.0.1:5173`. The Railway gateway CORS allowlist (`railway-stack/gateway/Caddyfile`) only permits those two dev origins, so other ports/hosts will get CORS-blocked by the backend.
- `frontend/.env` is required and gitignored. It must define `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_PDF_SERVICE_URL`. The startup update script creates it (if missing) with the public Railway gateway URL and the **public anon JWT** (the same key the deployed frontend already ships to every browser — not a secret). If auth/data calls start failing with 401s, the anon key may have rotated; re-fetch it from the deployed frontend bundle or ask the maintainer.

### PDF service gotcha
- In this sandboxed VM, launch it with `PLAYWRIGHT_NO_SANDBOX=1 npm run pdf:dev` so Chromium starts with `--no-sandbox`. The Chromium browser is installed by the update script (`npm run install-browser --prefix pdf-service`).

### Login / testing the authenticated app
- There is no self-signup; the Sign In page (`/auth`) authenticates against live Railway GoTrue. Users are provisioned by a Laboratory Director via an admin Edge Function. To exercise the authenticated LIMS modules you need **valid test credentials** for the live backend — these are not present in the environment by default. Without them you can still verify the app end-to-end: the public site (`/home`) loads real data via the anon `get_public_company_brand` RPC, and submitting the login form returns a live "Invalid login credentials" response from the backend.

### Lint / typecheck / build
- `npm run lint --prefix frontend`, `npm run typecheck --prefix frontend`, and `npm run build --prefix frontend` all run. The repo currently has many **pre-existing** ESLint and `tsc` errors; do not treat those as environment breakage. `npm run build` uses `vite build` (not `tsc`) and succeeds despite the type errors.
