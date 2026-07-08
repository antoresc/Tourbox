# VENA TourBook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static single-file Gioia Lucia tour map into a multi-tenant Next.js app (`/tour/[artistSlug]`) backed by Supabase, with an auth-gated tourbook and per-artist Google Apps Script sync, auto-deployed on Vercel.

**Architecture:** Next.js App Router server components fetch public artist/show data with the Supabase anon key and, when a session cookie is present, also fetch auth-gated `tourbook_details`. A single ported client component renders the pixel-for-pixel UI (CSS copied verbatim; pan/zoom math in an imperative hook). A per-artist Apps Script upserts tourbook JSON to Supabase on a 10-minute trigger using the service-role key.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind, `@supabase/ssr` + `@supabase/supabase-js`, Supabase (Postgres + Auth + RLS), Vercel, Google Apps Script.

## Global Constraints

- Supabase project: **new, dedicated**, named `vena-tourbook` (NOT `vena-distribution`).
- Repo root: `/Users/antoniorescigno/Dev/vena-tourbook`, branch `main`.
- Frontend env vars only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- The service-role key must **never** appear in the repo, Vercel, or any client bundle — Apps Script Script Properties only.
- RLS: `artists`/`shows` public `SELECT`; `tourbook_details` `SELECT` for `authenticated` only; no anon/authenticated write policies anywhere.
- UI must match the source `index.html` exactly — colors, fonts (Anton / Space Mono / Inter), animations, layout. CSS is copied verbatim, not rewritten in Tailwind.
- Source of truth for UI/data: `/Users/antoniorescigno/Downloads/index.html`. Source Apps Script: `/Users/antoniorescigno/Downloads/files/vena-tour-feed.gs`.
- `shows.date` is the authoritative date (year 2026); the `ds` integer key, `"17 Apr"` label, and month number are derived in code, never stored.
- Commit after every task with a `feat:`/`chore:`/`test:` message.

---

### Task 1: Scaffold the Next.js app

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `.env.local.example`

**Interfaces:**
- Produces: a runnable Next.js dev server on port 3000.

- [ ] **Step 1: Create the app with the official scaffolder**

Run from `/Users/antoniorescigno/Dev`:
```bash
npx create-next-app@latest vena-tourbook --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm
```
When it warns the directory is non-empty (the `docs/` + `.git` already exist), accept and keep existing files. If it refuses, scaffold in a temp dir and copy everything except `docs/` and `.git` into the repo.

- [ ] **Step 2: Add the root landing page**

Replace `app/page.tsx` with a minimal index (the app has no root UI; tours live at `/tour/[slug]`):
```tsx
export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>VENA TourBook</h1>
      <p>Apri una pagina tour: <code>/tour/[artistSlug]</code></p>
    </main>
  );
}
```

- [ ] **Step 3: Create the env example**

`.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 4: Run the dev server**

Run: `npm run dev`
Expected: server boots, `http://localhost:3000` shows the "VENA TourBook" heading. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app"
```

---

### Task 2: Create the Supabase project, schema, and RLS

**Files:**
- Create: `supabase/migrations/0001_init.sql` (kept in-repo as the source of truth for schema)

**Interfaces:**
- Produces: live `artists`, `shows`, `tourbook_details` tables with RLS; a project URL + anon key for env vars.

- [ ] **Step 1: Create the project**

Use the Supabase MCP `create_project` with name `vena-tourbook` in the user's org (call `list_organizations` first; if a cost confirmation is required, use `get_cost` + `confirm_cost`). Record the returned project ref/URL.

- [ ] **Step 2: Write the migration SQL**

`supabase/migrations/0001_init.sql`:
```sql
create table artists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  logo_url text,
  drive_folder_id text,
  created_at timestamptz not null default now()
);

create table shows (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  date date not null,
  city text not null,
  prov text,
  lat double precision not null,
  lng double precision not null,
  venue text,
  status text not null check (status in ('confirmed','interest','tbd')),
  formation int,
  tour_manager text,
  van_info text,
  unique (artist_id, date)
);
create index shows_artist_idx on shows(artist_id);

create table tourbook_details (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null unique references shows(id) on delete cascade,
  venue text,
  address text,
  wifi text,
  parking text,
  dressing text,
  payment text,
  dinner text,
  hotel jsonb not null default '{}'::jsonb,
  timings jsonb not null default '{}'::jsonb,
  arriving jsonb not null default '{}'::jsonb,
  leaving jsonb not null default '{}'::jsonb,
  contacts jsonb not null default '{}'::jsonb
);

alter table artists enable row level security;
alter table shows enable row level security;
alter table tourbook_details enable row level security;

create policy "artists public read" on artists for select to anon, authenticated using (true);
create policy "shows public read" on shows for select to anon, authenticated using (true);
create policy "tourbook auth read" on tourbook_details for select to authenticated using (true);
```

- [ ] **Step 3: Apply the migration**

Use the Supabase MCP `apply_migration` with name `init` and the SQL above.

- [ ] **Step 4: Verify tables and RLS**

Use MCP `list_tables` → confirm the three tables exist. Use `execute_sql`:
```sql
select tablename, rowsecurity from pg_tables where schemaname='public';
```
Expected: all three tables show `rowsecurity = true`. Run `get_advisors` (type `security`) and confirm no "RLS disabled" errors.

- [ ] **Step 5: Capture keys into env**

Use MCP `get_project_url` and `get_publishable_keys` (anon key). Write them into `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=<project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0001_init.sql && git commit -m "feat: supabase schema + RLS"
```
(`.env.local` is gitignored — do not commit it.)

---

### Task 3: Derivation helpers (date → ds / label / month) with tests

**Files:**
- Create: `lib/tour-derive.ts`
- Test: `lib/tour-derive.test.ts`

**Interfaces:**
- Produces:
  - `dsFromDate(date: string): number` — `"2026-04-17"` → `417`
  - `labelFromDate(date: string): string` — `"2026-04-17"` → `"17 Apr"`
  - `monthFromDate(date: string): number` — `"2026-04-17"` → `4`
  - `MONTHS: string[]` — index 1..12 → `["","Jan",...]` matching the source
  - `shortDs(ds: number): string` — `417` → `"17.04"` (source `shortDate`)

- [ ] **Step 1: Install a test runner**

Run: `npm i -D vitest` and add `"test": "vitest run"` to `package.json` scripts.

- [ ] **Step 2: Write the failing test**

`lib/tour-derive.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { dsFromDate, labelFromDate, monthFromDate, shortDs, MONTHS } from "./tour-derive";

describe("tour-derive", () => {
  it("derives ds as month*100+day", () => {
    expect(dsFromDate("2026-04-17")).toBe(417);
    expect(dsFromDate("2026-11-12")).toBe(1112);
  });
  it("derives the display label", () => {
    expect(labelFromDate("2026-04-17")).toBe("17 Apr");
    expect(labelFromDate("2026-08-01")).toBe("1 Aug");
  });
  it("derives the month number", () => {
    expect(monthFromDate("2026-05-23")).toBe(5);
  });
  it("formats shortDs as DD.MM", () => {
    expect(shortDs(417)).toBe("17.04");
    expect(shortDs(801)).toBe("01.08");
  });
  it("exposes month names indexed from 1", () => {
    expect(MONTHS[4]).toBe("Apr");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — module `./tour-derive` not found.

- [ ] **Step 4: Implement**

`lib/tour-derive.ts` (labels/format match the source exactly; parse date parts manually to avoid timezone drift):
```ts
export const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}
export function dsFromDate(date: string): number {
  const { m, d } = parts(date);
  return m * 100 + d;
}
export function labelFromDate(date: string): string {
  const { m, d } = parts(date);
  return `${d} ${MONTHS[m]}`;
}
export function monthFromDate(date: string): number {
  return parts(date).m;
}
const pad = (n: number) => String(n).padStart(2, "0");
export function shortDs(ds: number): string {
  return `${pad(ds % 100)}.${pad(Math.floor(ds / 100))}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/tour-derive.* package.json package-lock.json && git commit -m "feat: date derivation helpers"
```

---

### Task 4: Projection + Europe geometry static assets

**Files:**
- Create: `lib/europe-geometry.ts`
- Create: `lib/projection.ts`
- Test: `lib/projection.test.ts`

**Interfaces:**
- Produces:
  - `EUROPE: number[][][][]` — polygon rings, copied verbatim from source.
  - `BBOX`, `COSLAT`, `K`, `FULL` constants (from source lines ~270–281).
  - `project(lng: number, lat: number): [number, number]`

- [ ] **Step 1: Extract the geometry**

Open `/Users/antoniorescigno/Downloads/index.html`. Find `const EUROPE = [...]` (a single long line in the `<script>` block, around line 260–270). Copy the array literal verbatim into `lib/europe-geometry.ts`:
```ts
export const EUROPE = /* paste the exact array literal here */;
```

- [ ] **Step 2: Write the failing test**

`lib/projection.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { project } from "./projection";

describe("projection", () => {
  it("is deterministic and returns two finite numbers", () => {
    const [x, y] = project(9.19, 45.4642); // Milano
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
  });
  it("places a more-eastern point to the right", () => {
    const [xWest] = project(4.35, 50.85); // Bruxelles
    const [xEast] = project(14.27, 40.85); // Napoli
    expect(xEast).toBeGreaterThan(xWest);
  });
  it("places a more-southern point lower (larger y)", () => {
    const [, yNorth] = project(4.35, 50.85);
    const [, ySouth] = project(14.27, 40.85);
    expect(ySouth).toBeGreaterThan(yNorth);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `./projection` not found.

- [ ] **Step 4: Implement**

Copy the projection constants + `project` from the source (`<script>` lines ~270–281) into `lib/projection.ts`. It looks like:
```ts
export const BBOX = { minLng: /* from source */, maxLat: /* from source */, /* ... */ };
export const COSLAT = /* from source */;
export const K = /* from source */;
export const project = (lng: number, lat: number): [number, number] =>
  [(lng - BBOX.minLng) * COSLAT * K, (BBOX.maxLat - lat) * K];
export const FULL = /* from source, if defined */;
```
Copy the exact numeric values and any derived constants (`ASPECT`, `FULL`) verbatim so pin placement is identical.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/europe-geometry.ts lib/projection.* && git commit -m "feat: europe geometry + projection"
```

---

### Task 5: Supabase client factories

**Files:**
- Create: `lib/supabase/client.ts` (browser)
- Create: `lib/supabase/server.ts` (server, cookie-aware)
- Create: `lib/types.ts`

**Interfaces:**
- Produces:
  - `createBrowserSupabase()` → browser client (anon key).
  - `createServerSupabase()` → async server client bound to Next cookies.
  - Types: `Artist`, `Show`, `TourbookDetail`, `Contact`.

- [ ] **Step 1: Install deps**

Run: `npm i @supabase/supabase-js @supabase/ssr`

- [ ] **Step 2: Define shared types**

`lib/types.ts`:
```ts
export type Contact = { name?: string; phone?: string; tel?: string; email?: string };
export type Artist = { id: string; slug: string; name: string; logo_url: string | null };
export type Show = {
  id: string; artist_id: string; date: string; city: string; prov: string | null;
  lat: number; lng: number; venue: string | null;
  status: "confirmed" | "interest" | "tbd";
  formation: number | null; tour_manager: string | null; van_info: string | null;
};
export type TourbookDetail = {
  show_id: string; venue: string | null; address: string | null;
  wifi: string | null; parking: string | null; dressing: string | null;
  payment: string | null; dinner: string | null;
  hotel: { name?: string; address?: string; distance?: string; rooming?: string };
  timings: { load?: string; sound?: string; dinner?: string; doors?: string; stage?: string };
  arriving: { time?: string; contacts?: Contact[] };
  leaving: { time?: string; contacts?: Contact[] };
  contacts: { rep?: Contact[]; venue?: Contact[]; sound?: Contact[] };
};
```

- [ ] **Step 3: Browser client**

`lib/supabase/client.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";
export const createBrowserSupabase = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
```

- [ ] **Step 4: Server client**

`lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* called from a Server Component render; middleware refreshes instead */ }
        },
      },
    }
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase lib/types.ts package.json package-lock.json && git commit -m "feat: supabase client factories + types"
```

---

### Task 6: Seed Gioia Lucia data

**Files:**
- Create: `scripts/seed.mjs`
- Create: `scripts/extract-source.mjs`

**Interfaces:**
- Consumes: `SHOWS` + `DETAILS` from the source `index.html`; the service-role key (passed via env at run time, never committed).
- Produces: one `artists` row (`gioia-lucia`), 32 `shows` rows, 6 `tourbook_details` rows.

- [ ] **Step 1: Extract SHOWS + DETAILS from source**

`scripts/extract-source.mjs` reads `/Users/antoniorescigno/Downloads/index.html`, regex-captures the `const SHOWS = [...]` and `let DETAILS = {...}` literals, `JSON.parse`s them, and writes `scripts/source-data.json` `{ shows, details }`.
```js
import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync("/Users/antoniorescigno/Downloads/index.html", "utf8");
const shows = JSON.parse(html.match(/const SHOWS\s*=\s*(\[[\s\S]*?\]);/)[1]);
const details = JSON.parse(html.match(/let DETAILS\s*=\s*(\{[\s\S]*?\});\s*\n/)[1]);
writeFileSync("scripts/source-data.json", JSON.stringify({ shows, details }, null, 2));
console.log(`extracted ${shows.length} shows, ${Object.keys(details).length} tourbooks`);
```
Run: `node scripts/extract-source.mjs`
Expected: `extracted 32 shows, 6 tourbooks`.

- [ ] **Step 2: Write the seed script**

`scripts/seed.mjs` uses `@supabase/supabase-js` with the **service-role key from `process.env.SUPABASE_SERVICE_ROLE_KEY`** (never hardcoded). It:
1. upserts the artist `{ slug:"gioia-lucia", name:"Gioia Lucia", logo_url: process.env.LOGO_URL || null }` and reads back its `id`;
2. maps each source show → a `shows` row, converting `ds` → date `2026-MM-DD` (`MM`=`Math.floor(ds/100)`, `DD`=`ds%100`), `form`→`formation`, `tm`→`tour_manager`, `van`→`van_info`; upserts on `(artist_id,date)`;
3. for each `DETAILS[ds]`, finds the matching show row, and upserts `tourbook_details` reshaping `venueContacts→contacts.venue`, `rep→contacts.rep`, `sound→contacts.sound`, passing `hotel/timings/arriving/leaving` through.
```js
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const { shows, details } = JSON.parse(readFileSync("scripts/source-data.json", "utf8"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const pad = (n) => String(n).padStart(2, "0");
const dateFromDs = (ds) => `2026-${pad(Math.floor(ds / 100))}-${pad(ds % 100)}`;

const { data: artist } = await db.from("artists")
  .upsert({ slug: "gioia-lucia", name: "Gioia Lucia", logo_url: process.env.LOGO_URL || null },
          { onConflict: "slug" }).select().single();

const showRows = shows.map((s) => ({
  artist_id: artist.id, date: dateFromDs(s.ds), city: s.city, prov: s.prov,
  lat: s.lat, lng: s.lng, venue: s.venue || null, status: s.status,
  formation: s.form, tour_manager: s.tm || null, van_info: s.van || null,
}));
await db.from("shows").upsert(showRows, { onConflict: "artist_id,date" });
const { data: dbShows } = await db.from("shows").select("id,date").eq("artist_id", artist.id);
const idByDs = Object.fromEntries(dbShows.map((r) => {
  const [, m, d] = r.date.split("-").map(Number); return [m * 100 + d, r.id];
}));

const tbRows = Object.entries(details).map(([ds, d]) => ({
  show_id: idByDs[Number(ds)],
  venue: d.venue || null, address: d.address || null, wifi: d.wifi || null,
  parking: d.parking || null, dressing: d.dressing || null, payment: d.payment || null,
  dinner: d.dinner || null, hotel: d.hotel || {}, timings: d.timings || {},
  arriving: d.arriving || {}, leaving: d.leaving || {},
  contacts: { rep: d.rep || [], venue: d.venueContacts || [], sound: d.sound || [] },
})).filter((r) => r.show_id);
await db.from("tourbook_details").upsert(tbRows, { onConflict: "show_id" });
console.log(`seeded artist + ${showRows.length} shows + ${tbRows.length} tourbooks`);
```

- [ ] **Step 3: Run the seed**

Get the service-role key via Supabase MCP (or the dashboard) and run **without persisting it to disk**:
```bash
NEXT_PUBLIC_SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<service key> node scripts/seed.mjs
```
Expected: `seeded artist + 32 shows + 6 tourbooks`.

- [ ] **Step 4: Verify**

Supabase MCP `execute_sql`:
```sql
select (select count(*) from shows) as shows,
       (select count(*) from tourbook_details) as tourbooks,
       (select slug from artists limit 1) as artist;
```
Expected: `shows=32, tourbooks=6, artist=gioia-lucia`.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed.mjs scripts/extract-source.mjs && git commit -m "feat: seed script for Gioia Lucia"
```
(Do not commit `scripts/source-data.json` — add it to `.gitignore`.)

---

### Task 7: Port the CSS verbatim

**Files:**
- Create: `app/tour/tour.css`
- Modify: `app/layout.tsx` (add the Google Fonts `<link>` tags)

**Interfaces:**
- Produces: the complete visual styling, identical to source.

- [ ] **Step 1: Copy the stylesheet**

From `index.html`, copy the **entire** contents of the `<style>...</style>` block (lines ~10–184, including the `@media` mobile rules) into `app/tour/tour.css` verbatim. Do not alter any rule.

- [ ] **Step 2: Add fonts**

In `app/layout.tsx` `<head>` (or via `next/font` if preferred), add the exact font links from source lines 7–9:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
```

- [ ] **Step 3: Commit**

```bash
git add app/tour/tour.css app/layout.tsx && git commit -m "feat: port tour CSS + fonts"
```

---

### Task 8: `useMapView` hook (pan / zoom / pinch)

**Files:**
- Create: `lib/useMapView.ts`

**Interfaces:**
- Consumes: `project`, `BBOX`, `K`, `FULL` from `lib/projection.ts`; refs to the `<svg>`, land `<g>`, route `<polyline>`, and overlay element.
- Produces: `useMapView({ svgRef, ... , shows })` returning `{ applyVB, fitVisible, focusOn, zoomAt, positionPins }` and wiring wheel/pointer handlers — behavior identical to source functions `applyVB`, `clampView`, `zoomAt`, `screenToInternal`, `fitVisible`, `focusOn`, `tweenOrSet`, `positionPins`, plus the `wheel`/`pointerdown|move|up|cancel|leave` listeners (source lines ~417–606).

- [ ] **Step 1: Port the view math**

Copy the `view` state object and functions `vbFrom`, `applyVB`, `clampView`, `zoomAt`, `screenToInternal`, `fitVisible`, `focusOn`, `tweenOrSet`, `positionPins` from the source `<script>` into the hook, converting module-level `svg`/`landG`/`routeEl`/`overlay` DOM lookups to the passed refs and `visibleShows()` to the `shows` argument. Register the pointer/wheel listeners inside a `useEffect` that returns a cleanup removing them.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/useMapView.ts && git commit -m "feat: map pan/zoom hook"
```
(Interaction is verified end-to-end in Task 11 via the preview server.)

---

### Task 9: `TourApp` client component (ported UI)

**Files:**
- Create: `app/tour/TourApp.tsx`
- Create: `lib/tourbook-html.tsx` (the detail-card render helpers)

**Interfaces:**
- Consumes: `Artist`, `Show[]`, `Record<number, TourbookDetail> | null` (details keyed by `ds`, `null` when locked); `useMapView`; derivation helpers; `EUROPE`.
- Produces: `<TourApp artist shows details onUnlock />` — the full interactive page. Calls `onUnlock()` (a prop) when the locked "Scheda tecnica" button is pressed.

- [ ] **Step 1: Build the JSX shell**

Port the `<body>` markup (source lines ~200–259: header, sidebar `<aside>`, `.mapwrap` with `<svg>`, `.tl` cluster, `.zoom`, `.card`) into `TourApp`'s returned JSX. Replace the header `.wordmark`/`.logo-img` with `artist.logo_url` (fallback to `artist.name` text if null). Attach refs for svg/land/route/overlay/card.

- [ ] **Step 2: Port the render functions to React**

Convert `renderStats`, `renderChips`, `renderManifest`, `renderPins`, `renderNextChip`, `renderRoute`, `showCard`, `selectCity`, `deselect`, `highlight` into component state + JSX. Data sources change:
- `SHOWS` → `shows` prop; each show gains derived `ds = dsFromDate(date)`, `m = monthFromDate(date)`, `date`-label `= labelFromDate(date)`.
- `det(ds)` → `details ? details[ds] : undefined`; `cityHasBook`/the `TB` badge is shown when a detail exists.
- `state.month`, `sel`, route toggles → `useState`.
- `todayDs`, `isPast`, `nextShow` → keep verbatim (they read derived `ds`).

- [ ] **Step 3: Port the detail-card body with the auth gate**

Copy `contactRow`, `timelineHTML`, `contactsBlock`, `pickupBlock`, `logisticsBlock`, `stayBlock`, `dinnerBlock`, `eventHTML` (source ~463–537) into `lib/tourbook-html.tsx` as functions returning JSX. In the card, the public event header (date/status/city/venue/formation/TM/van) always renders. The **"Scheda tecnica"** section:
- if `details` is `null` → render a `<button className="unlock" onClick={onUnlock}>🔒 Sblocca scheda tecnica</button>`;
- else if a detail exists for that `ds` → render the full blocks;
- else → render nothing (no tourbook for that date yet).
Style `.unlock` minimally inside `tour.css` (bordered button matching `.chip-btn`).

- [ ] **Step 4: Wire the map hook + init**

In a `useEffect`, replicate `init()` (source ~633): `drawLand()` (render `EUROPE` into the land `<g>`), then `applyVB()` + `fitVisible(false)` from `useMapView`. Re-run `positionPins()`/`applyVB()` on `shows`/month changes and on window resize.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/tour/TourApp.tsx lib/tourbook-html.tsx app/tour/tour.css && git commit -m "feat: ported TourApp UI with auth gate"
```

---

### Task 10: Auth unlock modal

**Files:**
- Create: `app/tour/UnlockModal.tsx`
- Create: `middleware.ts`

**Interfaces:**
- Consumes: `createBrowserSupabase`.
- Produces: `<UnlockModal open onClose />` — email+password sign-in (with a "magic link" fallback button); on success calls `router.refresh()`. `middleware.ts` refreshes the auth cookie on navigation.

- [ ] **Step 1: Middleware for session refresh**

`middleware.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
    }});
  await supabase.auth.getUser();
  return res;
}
export const config = { matcher: ["/tour/:path*"] };
```

- [ ] **Step 2: The modal**

`app/tour/UnlockModal.tsx` (client): email + password fields → `supabase.auth.signInWithPassword`; on success `onClose()` then `router.refresh()`. A secondary button calls `supabase.auth.signInWithOtp({ email })` and shows "Controlla la tua email". Show any auth error inline. Style with a simple overlay matching the app palette (`--panel`, `--line`).

- [ ] **Step 3: Wire into TourApp**

Add `const [showLogin, setShowLogin] = useState(false)` in `TourApp`; pass `onUnlock={() => setShowLogin(true)}`; render `<UnlockModal open={showLogin} onClose={() => setShowLogin(false)} />`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/tour/UnlockModal.tsx middleware.ts app/tour/TourApp.tsx && git commit -m "feat: auth unlock modal + middleware"
```

---

### Task 11: The dynamic route + end-to-end verification

**Files:**
- Create: `app/tour/[artistSlug]/page.tsx`
- Create: `.claude/launch.json`

**Interfaces:**
- Consumes: `createServerSupabase`, `TourApp`, derivation helpers.
- Produces: `/tour/[artistSlug]` fetching artist + shows (public) and, when authed, `tourbook_details`, keyed into `Record<ds, TourbookDetail>`.

- [ ] **Step 1: The page**

`app/tour/[artistSlug]/page.tsx` (server):
```tsx
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { dsFromDate } from "@/lib/tour-derive";
import TourApp from "../TourApp";
import "../tour.css";

export default async function Page({ params }: { params: Promise<{ artistSlug: string }> }) {
  const { artistSlug } = await params;
  const db = await createServerSupabase();
  const { data: artist } = await db.from("artists").select("*").eq("slug", artistSlug).single();
  if (!artist) notFound();
  const { data: shows } = await db.from("shows").select("*").eq("artist_id", artist.id);
  const { data: { user } } = await db.auth.getUser();

  let details: Record<number, any> | null = null;
  if (user && shows?.length) {
    const { data: tb } = await db.from("tourbook_details")
      .select("*").in("show_id", shows.map((s) => s.id));
    if (tb) {
      const dsByShow = Object.fromEntries(shows.map((s) => [s.id, dsFromDate(s.date)]));
      details = Object.fromEntries(tb.map((d) => [dsByShow[d.show_id], d]));
    }
  }
  return <TourApp artist={artist} shows={shows ?? []} details={details} />;
}
```

- [ ] **Step 2: Launch config for preview**

`.claude/launch.json`:
```json
{ "version": "0.0.1", "configurations": [
  { "name": "vena-tourbook", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000 }
]}
```

- [ ] **Step 3: Start the preview and verify the public view**

Start the `vena-tourbook` server (preview_start). Load `/tour/gioia-lucia`. Verify with `preview_snapshot` + `preview_screenshot`: 32 dates appear grouped by month in the sidebar; pins render on the Italy/Europe map; the logo shows in the header; clicking a pin/row opens the detail card. Check `preview_console_logs` for errors — fix any before proceeding.

- [ ] **Step 4: Verify the auth gate**

Open a show that has a tourbook (e.g. 17 Apr / Bruxelles). Confirm the card shows the public header **and** a "🔒 Sblocca scheda tecnica" button (not the contacts). Confirm no phone numbers/hotel data appear in the page HTML while logged out (`preview_snapshot`). This proves sensitive data is not shipped to anonymous clients.

- [ ] **Step 5: Verify unlock**

Create a test user via Supabase MCP/dashboard (Auth → add user, email+password). In the preview, click unlock, sign in, and confirm the card now renders contacts/hotel/timings and `router.refresh()` populated them. Screenshot as proof.

- [ ] **Step 6: Commit**

```bash
git add app/tour/[artistSlug]/page.tsx .claude/launch.json && git commit -m "feat: dynamic tour route + verified e2e"
```

---

### Task 12: Adapt the Google Apps Script for Supabase upsert

**Files:**
- Create: `apps-script/vena-tour-feed.gs`
- Create: `apps-script/README.md`

**Interfaces:**
- Consumes: Supabase REST (`/rest/v1/artists`, `/rest/v1/shows`, `/rest/v1/tourbook_details`) with the service-role key from Script Properties.
- Produces: `syncTourbooks()` (timed) + `installTrigger()` (one-time setup).

- [ ] **Step 1: Copy parsing logic verbatim**

Copy `/Users/antoniorescigno/Downloads/files/vena-tour-feed.gs` into `apps-script/vena-tour-feed.gs`, keeping `findTourbook`, `readTable`, `cleanVal`, `telHref`, `parseContacts`, `extract` **unchanged**. Remove `doGet` and the hardcoded `var FOLDER_ID`.

- [ ] **Step 2: Add config + sync + trigger**

Prepend config read from Script Properties and add the sync/upsert:
```js
function cfg_() {
  const p = PropertiesService.getScriptProperties();
  return {
    url: p.getProperty('SUPABASE_URL'),
    key: p.getProperty('SUPABASE_SERVICE_ROLE_KEY'),
    slug: p.getProperty('ARTIST_SLUG'),
    folder: p.getProperty('FOLDER_ID'),
    year: p.getProperty('TOUR_YEAR') || '2026',
  };
}
function rest_(c, path, opts) {
  const res = UrlFetchApp.fetch(c.url + '/rest/v1/' + path, Object.assign({
    muteHttpExceptions: true,
    headers: { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' },
  }, opts || {}));
  const body = res.getContentText();
  return body ? JSON.parse(body) : null;
}
function pad2_(n) { n = String(n); return n.length < 2 ? '0' + n : n; }

function syncTourbooks() {
  const c = cfg_();
  const artist = rest_(c, 'artists?slug=eq.' + encodeURIComponent(c.slug) + '&select=id')[0];
  if (!artist) throw new Error('artist not found: ' + c.slug);
  const subs = DriveApp.getFolderById(c.folder).getFolders();
  while (subs.hasNext()) {
    const f = subs.next();
    const m = f.getName().match(/(\d{1,2})\s*\/\s*(\d{1,2})/);   // "DD/MM ..."
    if (!m) continue;
    const isoDate = c.year + '-' + pad2_(m[2]) + '-' + pad2_(m[1]); // YYYY-MM-DD
    const file = findTourbook(f);
    if (!file) continue;
    const rows = readTable(file);
    if (!rows || !rows.length) continue;
    const d = extract(rows);

    const show = rest_(c, 'shows?artist_id=eq.' + artist.id + '&date=eq.' + isoDate + '&select=id')[0];
    if (!show) continue; // date not in DB yet — booker adds it first

    const payload = {
      show_id: show.id, venue: d.venue || null, address: d.address || null,
      wifi: d.wifi || null, parking: d.parking || null, dressing: d.dressing || null,
      payment: d.payment || null, dinner: d.dinner || null,
      hotel: d.hotel || {}, timings: d.timings || {},
      arriving: d.arriving || {}, leaving: d.leaving || {},
      contacts: { rep: d.rep || [], venue: d.venueContacts || [], sound: d.sound || [] },
    };
    rest_(c, 'tourbook_details?on_conflict=show_id', {
      method: 'post', payload: JSON.stringify(payload),
      headers: { apikey: c.key, Authorization: 'Bearer ' + c.key,
                 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    });
  }
}
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncTourbooks').timeBased().everyMinutes(10).create();
}
```

- [ ] **Step 3: Write setup docs**

`apps-script/README.md`: per-artist setup — create Apps Script project, enable the advanced **Drive API** service (needed for `.docx` tourbooks), set Script Properties (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ARTIST_SLUG`, `FOLDER_ID`, `TOUR_YEAR`), run `installTrigger()` once, then `syncTourbooks()` manually to confirm. Note: the service-role key lives only here.

- [ ] **Step 4: Manual verification (documented, run by the operator)**

In the Apps Script editor: set Script Properties for `gioia-lucia`, run `syncTourbooks()`, then confirm via Supabase MCP `execute_sql` that a known folder date's `tourbook_details` row matches the Drive doc. Note this is an operator step (requires the real Drive folder + service key), not a repo test.

- [ ] **Step 5: Commit**

```bash
git add apps-script/ && git commit -m "feat: per-artist Apps Script Supabase sync"
```

---

### Task 13: GitHub + Vercel deploy

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: a GitHub repo, a Vercel project with env vars, auto-deploy on push to `main`, and a live tour URL.

- [ ] **Step 1: Push to GitHub**

```bash
gh repo create vena-tourbook --private --source=/Users/antoniorescigno/Dev/vena-tourbook --push
```

- [ ] **Step 2: Create the Vercel project + env vars**

Link the repo to Vercel (via the Vercel MCP `deploy_to_vercel` or the dashboard). Set Production + Preview env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. **Do not** set the service-role key. Add the Vercel deploy domain to Supabase Auth → URL Configuration (redirect URLs) so magic links work.

- [ ] **Step 3: Verify the deploy**

Trigger a deploy (push or redeploy). Confirm the build succeeds (Vercel MCP `get_deployment` / build logs) and `https://<deploy>/tour/gioia-lucia` renders the map. Confirm the tourbook is locked when logged out.

- [ ] **Step 4: Write the README**

`README.md`: what the app is, the `/tour/[slug]` route, local dev (`npm run dev`), env vars, where the seed script and Apps Script live, and the "map public / tourbook auth-gated" model.

- [ ] **Step 5: Commit**

```bash
git add README.md && git commit -m "docs: readme + deploy notes" && git push
```

---

## Self-Review

**Spec coverage:**
- Project structure (Next.js/TS/Tailwind, new repo, Vercel auto-deploy) → Tasks 1, 13. ✅
- Supabase schema (artists/shows/tourbook_details) + RLS → Task 2. ✅
- Data migration from SHOWS/DETAILS → Task 6. ✅
- Dynamic `/tour/[artistSlug]` replicating UI/colors/animations/logic, logo from `logo_url` → Tasks 4, 7, 8, 9, 11. ✅
- Auth-gated tourbook (map public, details protected) → Tasks 9, 10, 11. ✅
- Apps Script → Supabase upsert on a 10-min trigger, parsing verbatim → Task 12. ✅
- Deploy + env vars (anon on frontend, service key only in Apps Script) → Tasks 2, 6, 13. ✅
- Phase-2 admin explicitly out of scope; schema has `drive_folder_id` → Task 2. ✅

**Placeholder scan:** UI-port tasks (7, 8, 9) intentionally reference exact source line ranges instead of re-transcribing verbatim code — the source file is the authoritative copy and re-typing it risks drift. All logic/config/SQL/script tasks contain complete code.

**Type consistency:** `Artist`/`Show`/`TourbookDetail`/`Contact` (Task 5) are used consistently in Tasks 9 and 11; `details` is `Record<ds, TourbookDetail> | null` throughout; `dsFromDate` (Task 3) is the single ds derivation used in Tasks 6, 9, 11. Contact reshaping `{rep, venue, sound}` is identical in Tasks 6 and 12.
