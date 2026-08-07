# Qirlpl LIMS

Monorepo for Qirlpl LIMS (Laboratory Information Management System), split into **frontend** and **backend**.

## Project Structure

```
Qirlpl_Lims/
├── frontend/          # React + TypeScript + Vite web app
│   ├── src/
│   ├── public/
│   └── package.json
├── backend/           # Supabase (PostgreSQL, Auth, Edge Functions)
│   └── supabase/
│       ├── migrations/
│       ├── functions/
│       └── config.toml
└── package.json       # Root scripts (dev, build, db:push)
```

## Prerequisites

- Node.js 20+
- npm 10+
- Supabase project (URL + anon key)
- Supabase CLI (for database migrations)

## Local Setup

1. Install frontend dependencies:

   ```bash
   npm install --prefix frontend
   ```

2. Create frontend env file from template:

   ```bash
   copy frontend\.env.example frontend\.env
   ```

3. Add your Supabase values in `frontend/.env`:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

4. Run the app from repo root:

   ```bash
   npm run dev
   ```

   Or from the frontend folder:

   ```bash
   cd frontend
   npm run dev
   ```

## Supabase (Backend)

**Connected project:** `Qirlpl_Lims`  
**Project ref:** `tzbgywlwfcdsgrumstpu`  
**API URL:** `https://tzbgywlwfcdsgrumstpu.supabase.co`  
**Region:** `ap-south-1`

- Client is configured in `frontend/src/lib/supabaseClient.ts` via `frontend/.env`.
- Supabase CLI config: `backend/supabase/config.toml`
- Migrations: `backend/supabase/migrations`
- Edge functions: `backend/supabase/functions`
- Cursor MCP: configured in `.cursor/mcp.json`

Link the CLI (from `backend/`) — use the Supabase account that **owns** this project:

```bash
cd backend
npx supabase login
npx supabase link --project-ref tzbgywlwfcdsgrumstpu
npm run db:push
```

From repo root:

```bash
npm run db:push
```

## GitHub

**Repository:** [https://github.com/qiamit/Qirlpl_Lims](https://github.com/qiamit/Qirlpl_Lims)

Remote is configured as `origin`. First-time push:

```bash
git add .
git commit -m "Initial commit: Qirlpl LIMS frontend/backend monorepo"
git push -u origin main
```

If prompted, sign in with your GitHub account or use a [Personal Access Token](https://github.com/settings/tokens) as the password.

## Vercel Deployment

Deploy from the `frontend` directory:

1. `cd frontend`
2. `npx vercel login`
3. `npx vercel link`
4. Add production env vars in Vercel project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy: `npx vercel --prod`

## Notes

- Never commit `.env` files.
- Only the public Supabase anon key should be used in the frontend.
- For DB changes, add SQL files under `backend/supabase/migrations`.
