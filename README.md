# Qirlpl LIMS (Railway)

Monorepo for Qirlpl LIMS. This project runs **only on Railway** (frontend, API gateway, Auth, PostgREST, Storage, Postgres, PDF).

It is **not** connected to hosted Supabase Cloud, Vercel, or `https://github.com/qiamit/Qirlpl_Lims.git`.

**Repository:** [https://github.com/qiamit/Qirlpl_Lims_Railway](https://github.com/qiamit/Qirlpl_Lims_Railway)

## Project Structure

```
Qirlpl_Lims_Railway/
├── frontend/                 # React + TypeScript + Vite
├── backend/supabase/         # SQL migrations + function source (applied on Railway Postgres)
├── railway-stack/gateway/    # Caddy API gateway (Auth / REST / Storage)
├── pdf-service/              # PDF renderer
└── package.json
```

## Stack

| Piece | Where it runs |
|---|---|
| Web app | Railway `frontend` |
| Auth / REST / Storage | Railway `api` gateway → `auth`, `rest`, `storage-api` |
| Database | Railway Postgres |
| Files | Railway object storage bucket |
| PDF | Railway `pdf-service` |

The browser uses `supabase-js` against the Railway API URL (Supabase-compatible protocol). That is **not** `*.supabase.co`.

## Local Setup

1. `npm install --prefix frontend`
2. Copy `frontend/.env.example` to `frontend/.env`
3. Keep Railway values:

   - `VITE_SUPABASE_URL` = Railway API gateway (`https://api-production-284ab.up.railway.app`)
   - `VITE_SUPABASE_ANON_KEY` = Railway anon JWT
   - `VITE_PDF_SERVICE_URL` = Railway PDF service

4. `npm run dev`

## Notes

- Never commit `.env` files.
- Do not run `supabase link`, `supabase db push`, or `vercel` against this repo.
- Schema changes: add SQL under `backend/supabase/migrations/` and apply on Railway Postgres.
