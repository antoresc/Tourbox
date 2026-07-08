# NUDA Tourbox — Admin Onboarding Design Spec

**Date:** 2026-07-09
**Owner:** Antonio (NUDA)
**Status:** Approved (scope + approach), pending spec review

## 1. Summary

Add an **admin-only** area to NUDA Tourbox where the admin (Antonio) onboards a new
artist by pointing at their tour data — an uploaded spreadsheet **or** a Google
Sheet/Doc/Drive link — and the system **AI-maps** whatever column layout it finds into the
`shows` schema, geocodes the cities, shows a **preview to confirm**, and creates the
artist's live tour page. Google-linked sources are then kept current by the **existing daily
sync**, generalized to loop over all artists. The finished per-artist page (e.g.
`/tour/<slug>`) is what Antonio hands to booking agents.

### Locked decisions

| Decision | Choice |
|---|---|
| Admin access | Route group `/admin`, gated to **antonio@nuda.studio** (email allowlist) |
| Data input | **File upload** (`.xlsx`/`.csv`, one-time) **and** **Google Sheet/Doc/Drive link** (live sync) |
| Format | **Any layout, AI-mapped** (Anthropic API), with a **saved mapping** + **preview/confirm** |
| Automation | **Full auto + recurring sync** (generalized multi-artist daily task) |
| Sync approach | **A — map-once-then-deterministic**: AI maps at onboarding, admin confirms, mapping saved; daily runs reuse it |
| Deferred | Notion / Airtable / external DBs as sources; productized multi-tenant backend infra |

### Scope boundary / honest constraints

- **Uploads are one-time** snapshots (a dropped file can't auto-update). **Google links** are
  the live-sync path.
- The recurring sync rides the **existing Claude scheduled task + Antonio's Google Drive
  connector** (reads anything shared with antonio@nuda.studio). This fits Antonio's own
  curated roster. A true external multi-agent SaaS would later need a service account / hosted
  cron — **out of scope here**, but the schema/config is shaped so that swap is clean.
- Google sources must be **shared with antonio@nuda.studio** (so the connector can read them).

## 2. Architecture

```
app/
  admin/
    layout.tsx            Server Component: enforce admin (redirect if not admin email)
    page.tsx              Artist list + sync status + "Add artist"
    artists/new/page.tsx  Add-artist wizard
    artists/[id]/page.tsx Edit artist + source + re-import + preview
    actions.ts            Server Actions: createArtist, saveSource, runImport, commitImport
  login/page.tsx          Shared Supabase Auth login (reused by unlock + admin)
lib/
  admin/guard.ts          isAdmin(session) helper (email allowlist)
  import/parse.ts         read upload (xlsx/csv via SheetJS) → rows[][]
  import/ai-map.ts        Anthropic call: rows + headers → { mapping, shows[] w/ lat/lng }
  import/normalize.ts     status/prov/formation/date normalizers + validation (pure, tested)
supabase/migrations/
  0003_admin_onboarding.sql
```

- **Admin app is upload-capable on its own** (Node parses the file; Anthropic maps it; no
  Google access needed server-side).
- **Google-link sources** are *stored* by the admin app; the **daily Claude task** does the
  reading/mapping/geocoding/upsert on its runs (it has the Drive connector). The task writes
  back `last_synced_at` / `sync_status` / `sync_note` so `/admin` shows health.

## 3. Data model (migration `0003_admin_onboarding.sql`)

Extend `artists`:
| col | type | notes |
|---|---|---|
| `dates_source_type` | text null | check in (`upload`,`google_sheet`,`google_doc`,`drive_folder`) |
| `dates_source_url` | text null | the Google link (null for upload-only) |
| `tourbook_folder_id` | text null | Drive folder id for per-date tourbook docs (reuse existing `drive_folder_id`; rename via migration) |
| `column_mapping` | jsonb not null default '{}' | saved source-column → field mapping |
| `sync_enabled` | boolean not null default true | |
| `last_synced_at` | timestamptz null | written by the sync task |
| `sync_status` | text null | `ok` / `needs_review` / `error` |
| `sync_note` | text null | short human message (e.g. "mapping changed, re-confirm") |

**Admin write access (RLS):** add policies to `artists`, `shows`, `tourbook_details` allowing
`insert`/`update`/`delete` when `auth.jwt()->>'email' = 'antonio@nuda.studio'`. This lets the
admin web app write with the admin's own session — **no service-role key in the frontend**.
(The daily task keeps using its connector/service path.)

**Storage:** Supabase Storage buckets — `logos` (public read) for artist logos, `imports`
(private) for uploaded spreadsheets (kept for audit/re-map).

## 4. Onboarding flow

1. **/admin → Add artist:** name, slug (auto-suggested from name, unique-checked), logo upload
   → `logos` bucket → `logo_url`.
2. **Choose a dates source:**
   - **Upload** `.xlsx`/`.csv`: stored to `imports`; `parse.ts` extracts header + rows;
     `ai-map.ts` calls the Anthropic API to return `{ mapping, shows[] }` where each show has
     `date, city, prov, venue, status, tour_manager, formation, van_info, lat, lng`.
   - **Google link:** validate it's readable/shared; save `dates_source_url` +
     `dates_source_type`; mark `sync_status='needs_review'`. The first real read happens on the
     next daily task run, which proposes a mapping and leaves it `needs_review` until confirmed.
3. **Preview & confirm:** admin sees a table of normalized shows (and the inferred mapping);
   can fix status/coords inline; **Confirm** upserts `shows` (on conflict artist_id,date) and
   saves `column_mapping`. Bad/ambiguous rows are flagged, not published.
4. **Tourbooks (optional):** admin pastes the artist's Drive **tourbook folder** link →
   `tourbook_folder_id`. The daily task parses per-date docs (existing mechanism).
5. Artist page is immediately live at `/tour/<slug>`.

## 5. Recurring sync (generalize the existing task)

Update `gioia-lucia-tour-sync` → a single **all-artists** task (rename `tourbox-daily-sync`).
Each run: `select * from artists where sync_enabled`. For each artist with a Google
`dates_source_url`: read it (Drive connector), apply saved `column_mapping` (or, if empty /
mapping no longer fits, propose one and set `sync_status='needs_review'` instead of writing),
geocode only new cities, upsert `shows`. For each artist with a `tourbook_folder_id`: sync
tourbooks as today. Write `last_synced_at`/`sync_status`/`sync_note`. Never delete. Skip
`upload`-type sources (one-time). Self-stops after 2026-12-01 (revisit for future tours).

## 6. AI mapping (`lib/import/ai-map.ts`)

- Uses the **Anthropic SDK** server-side (`ANTHROPIC_API_KEY`, Vercel server env only).
  Model: the current recommended Claude model — verify the exact id via the `claude-api` skill
  at implementation time.
- Input: the sheet's header row + up to N sample data rows. Output (structured/JSON):
  `{ mapping: {date, city, venue, status, tm, formation, van}, rows: [{...normalized, lat, lng}] }`.
- Prompt rules mirror the current parser: Italian **or** English months; status →
  confirmed/interest/tbd; skip planning/placeholder/OFF rows; **never** ingest financial or
  private columns (cachet/fees/contacts) into the public `shows` table; emit city-centre
  lat/lng for the map.
- `normalize.ts` re-validates the AI output deterministically (date is real YYYY-MM-DD in the
  tour window; status in enum; lat/lng finite & within a sane bbox) before it can be committed.

## 7. Environment

- Add **`ANTHROPIC_API_KEY`** to Vercel (server-only; never `NEXT_PUBLIC`).
- Existing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` unchanged.
- Service-role key remains **only** in the Google Apps Script / task context, never in the web app.

## 8. Error handling

- Upload parse failure (bad file / empty) → inline error, nothing written.
- AI mapping low-confidence or `normalize.ts` rejects rows → those rows shown as **flagged** in
  the preview; admin fixes or excludes before Confirm.
- Google link not readable (not shared with antonio@nuda.studio) → save with
  `sync_status='error'`, `sync_note` explaining to share it; surfaced in `/admin`.
- Non-admin hitting `/admin` → redirect to `/login`; server actions re-check `isAdmin`.

## 9. Testing

- `normalize.ts`: unit tests (vitest) — Italian/English dates, status mapping, prov extraction,
  junk-row filtering, coord validation. (Pure functions, high value.)
- `guard.ts`: admin allowlist true/false.
- AI-map: a fixture test asserting the normalizer rejects a deliberately malformed AI response.
- Manual/preview verification for the end-to-end onboard (real Anthropic call) via the preview server.

## 10. Out of scope (future)

- Notion/Airtable/external-DB sources.
- Self-serve agent signup + productized multi-tenant infra (service account / hosted cron)
  replacing the Claude-task + personal-connector sync.
- Per-artist custom domains.
