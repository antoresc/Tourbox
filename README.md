# VENA TourBook

Multi-tenant interactive tour map for NUDA artists. One page per artist at
**`/tour/[artistSlug]`** — a panning/zoomable map of Europe with colour-coded show pins,
a month filter, route overlays, and per-date "tourbook" detail cards.

Ported from a single static HTML file into Next.js + Supabase, deployed on Vercel.

## Access model

- **Public:** the map, dates, cities, venues, and statuses.
- **Auth-gated (Supabase Auth):** the *scheda tecnica* — contacts, hotel, timings,
  logistics. Logged-out visitors see a 🔒 "Sblocca" prompt; the sensitive data is never
  sent to unauthenticated clients (it's fetched server-side only when a session exists).

## Stack

Next.js (App Router) + TypeScript + Tailwind · Supabase (Postgres + Auth + RLS) ·
`@supabase/ssr` · Vercel.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in the two values below
npm run dev                        # http://localhost:3000
npm test                           # vitest unit tests
```

### Environment variables (frontend only)

| Var | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |

The **service-role key is never used by the frontend** — it lives only in the Google Apps
Script (see below).

## Data

- Schema: `supabase/migrations/0001_init.sql` (`artists`, `shows`, `tourbook_details`).
- Seed (Gioia Lucia): `scripts/extract-source.mjs` + `scripts/seed.mjs`
  (or `gen-seed-sql.mjs` → SQL). Generated `source-data.json` / `seed.sql` are gitignored
  because they contain personal contact data.

## Tourbook auto-sync

`apps-script/` — one Google Apps Script per artist reads the artist's Drive booking folder
and upserts tourbooks into Supabase every 10 minutes. See `apps-script/README.md`.

## Deploy

Pushed to GitHub, auto-deployed to Vercel on every push to `main`. Set the two
`NEXT_PUBLIC_*` env vars in the Vercel project; add the deploy domain to Supabase Auth →
URL Configuration so magic-link redirects work.

## Roadmap

- **Phase 2 — booker admin:** a protected UI to create artists, add/edit shows, and link a
  Drive folder (`artists.drive_folder_id` already exists in the schema).
