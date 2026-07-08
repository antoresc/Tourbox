# VENA TourBook — Design Spec

**Date:** 2026-07-08
**Owner:** Antonio (NUDA)
**Status:** Approved (design), pending implementation plan

## 1. Summary

Transform the self-contained static `index.html` tour map (currently hardcoded for
the artist **Gioia Lucia**) into a **multi-tenant Next.js app**: one page per artist
(`/tour/[artistSlug]`), with data in **Supabase** instead of embedded constants, and
automatic deploy to **Vercel** on every push to `main`.

The interactive Europe map, colors, animations, and tourbook logic are ported
**pixel-for-pixel** from the existing file. Tourbook details are kept up to date by a
per-artist **Google Apps Script** that reads a Google Drive folder and upserts to
Supabase on a timed trigger.

### Key decisions (locked)

| Decision | Choice |
|---|---|
| Supabase project | **New dedicated project** `vena-tourbook` (isolated from VENA Distribution) |
| Access control | Map + dates **public**; tourbook (contacts/hotel/timings) **behind auth** |
| Auth method | **Supabase Auth** — email + password (magic-link capable); crew invited by email |
| Tourbook auto-update | **One Apps Script per artist**, slug hardcoded in Script Properties |
| v1 data scope | **Only Gioia Lucia**; schema built for a Phase-2 booker admin page |
| Repo | `~/Dev/vena-tourbook`, GitHub → Vercel auto-deploy |
| UI port strategy | **Hybrid** (React owns data/structure; imperative pan/zoom math in a hook) |
| CSS | Ported **verbatim** as a scoped module — no Tailwind rewrite of existing UI |
| Map geometry | `EUROPE` polygons become a **static in-repo asset**, not DB rows |

## 2. Stack

- **Next.js (App Router) + TypeScript + Tailwind** (Tailwind for new scaffolding only;
  existing UI CSS ported verbatim).
- **Supabase** (`vena-tourbook`) — Postgres + Auth + RLS.
- **`@supabase/ssr`** for cookie-based session handling in Server Components.
- **Vercel** — auto-deploy on push to `main`.
- **Google Apps Script** — per-artist tourbook sync (unchanged parsing logic).

## 3. Data model

### `artists`
| col | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `slug` | text unique not null | e.g. `gioia-lucia` |
| `name` | text not null | display name |
| `logo_url` | text | shown in header (replaces wordmark) |
| `drive_folder_id` | text null | Phase-2 admin: booker's Drive folder |
| `created_at` | timestamptz default now() | |

### `shows`
| col | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `artist_id` | uuid fk → artists(id) | on delete cascade |
| `date` | date not null | **authoritative** — e.g. `2026-04-17` |
| `city` | text not null | |
| `prov` | text | province code, e.g. `NA` |
| `lat` | double precision not null | |
| `lng` | double precision not null | |
| `venue` | text | may be empty for TBD |
| `status` | text not null | check in (`confirmed`,`interest`,`tbd`) |
| `formation` | int null | band size (`form` in source) |
| `tour_manager` | text | `tm` in source |
| `van_info` | text | `van` in source |

- Unique index on `(artist_id, date)` — the Apps Script matches on this.
- The source `ds` key, the `"17 Apr"` display label, and the month filter are **derived
  in the app** from `date`. Not stored.

### `tourbook_details`
| col | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `show_id` | uuid fk → shows(id) **unique** | on delete cascade; upsert key |
| `venue` | text | |
| `address` | text | |
| `wifi` | text | |
| `parking` | text | |
| `dressing` | text | |
| `payment` | text | |
| `dinner` | text | |
| `hotel` | jsonb | `{name,address,distance,rooming}` |
| `timings` | jsonb | `{load,sound,dinner,doors,stage}` |
| `arriving` | jsonb | `{time, contacts:[]}` |
| `leaving` | jsonb | `{time, contacts:[]}` |
| `contacts` | jsonb | `{rep:[],venue:[],sound:[]}` — each contact `{name,phone,tel,email}` |

Mapping from the Apps Script `extract()` output → columns:
`venueContacts → contacts.venue`, `rep → contacts.rep`, `sound → contacts.sound`;
`hotel/timings/arriving/leaving` pass through as-is.

### RLS

- `artists`: `SELECT` for `anon` + `authenticated` (public).
- `shows`: `SELECT` for `anon` + `authenticated` (public).
- `tourbook_details`: `SELECT` for `authenticated` **only**. No `INSERT`/`UPDATE`/`DELETE`
  policies — the Apps Script writes with the **service-role key**, which bypasses RLS.

## 4. App structure & data flow

```
app/
  tour/[artistSlug]/page.tsx      Server Component: fetch artist + shows (anon);
                                  if session → also fetch tourbook_details
  components/TourApp.tsx          Client: full ported UI, data via props
  components/UnlockModal.tsx      Supabase Auth login (email+password / magic link)
lib/
  supabase/server.ts             @supabase/ssr server client (cookies)
  supabase/client.ts             browser client
  europe-geometry.ts             the EUROPE polygon array (static)
  projection.ts                  project(lng,lat), BBOX, view math (ported)
  tour-derive.ts                 date → ds / "17 Apr" / month helpers
  useMapView.ts                  imperative pan/zoom/pinch hook (refs)
styles/
  tour.module.css                the existing CSS, verbatim
```

**Flow:**
1. `page.tsx` (server) fetches `artist` + `shows` with the anon key. Reads Supabase
   session cookie. If authenticated, fetches `tourbook_details` for that artist's shows
   server-side and passes them down; otherwise passes `null`.
2. `<TourApp>` renders the ported UI from props. Logo comes from `artist.logo_url`.
3. Detail card always shows public show info (date, city, venue, status, formation, TM,
   van). The **"Scheda tecnica"** block (contacts, hotel, timings, logistics) renders the
   real data when present, or a **"🔒 Sblocca scheda tecnica"** button when `null`.
4. Unlock → `<UnlockModal>` (Supabase Auth) → on success `router.refresh()` re-runs the
   server fetch with the session, and details stream in. **Sensitive data never ships to
   an unauthenticated client.**

**Port fidelity:** manifest, month chips, city-clustered pins with counts, route toggle,
route-to-next toggle, past/next highlighting, and the detail card are ported as React
driven by Supabase data. Pan/zoom/pinch/wheel and the equirectangular projection are
ported into `useMapView` operating on refs (imperative, as in the source). CSS is byte-
for-byte the existing rules in a scoped module.

## 5. Google Apps Script (per artist)

`vena-tour-feed.gs` adapted — **all parsing kept verbatim** (`findTourbook`, `readTable`,
`parseContacts`, `extract`, name/number splitting). Plumbing changes only:

- Config via **Script Properties** (never hardcoded in source):
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ARTIST_SLUG`, `FOLDER_ID`, `TOUR_YEAR`.
- New `syncTourbooks()`:
  1. Resolve `artist_id` via `GET /rest/v1/artists?slug=eq.{ARTIST_SLUG}`.
  2. For each dated subfolder (`DD/MM …`): parse the tourbook → `extract()` → reshape to
     DB columns.
  3. Resolve `show_id` via `GET /rest/v1/shows?artist_id=eq.{id}&date=eq.{YYYY-MM-DD}`
     (year = `TOUR_YEAR`). If no matching show, **skip** (booker adds the date first).
  4. **Upsert** `tourbook_details` via
     `POST /rest/v1/tourbook_details` with header `Prefer: resolution=merge-duplicates`
     (conflict target `show_id`), service-role key in `apikey`/`Authorization`.
- `installTrigger()` helper: creates a **time-driven trigger every 10 min**. Runs on
  Google's side; no open page required. The old `doGet`/JSONP feed is removed.

## 6. Deploy

- New GitHub repo `vena-tourbook` → Vercel project, auto-deploy on push to `main`.
- Vercel env vars (frontend): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  **only**.
- The **service-role key lives solely in Apps Script Script Properties** — never in the
  repo, Vercel, or any client bundle.

## 7. Data migration (Gioia Lucia)

- Insert one `artists` row (`gioia-lucia`), with `logo_url` (upload the current base64
  logo to Supabase Storage or an assets bucket and reference it).
- Insert the 32 `SHOWS` rows, converting `ds` → `date` with year 2026.
- Insert the `DETAILS` entries into `tourbook_details`, reshaping `venueContacts/rep/sound`
  into `contacts` jsonb.

## 8. Out of scope (Phase 2)

- **Booker admin page** — protected UI to create artists, add/edit shows, and link a Drive
  folder (`artists.drive_folder_id`). Schema is already shaped for it; not built in v1.

## 9. Open items to confirm during implementation

- Logo hosting: Supabase Storage bucket vs. `/public` asset vs. external URL.
- Whether `venue`/`address` should be public (currently the whole `tourbook_details` row
  is auth-gated; show-level `venue` on `shows` remains public).
