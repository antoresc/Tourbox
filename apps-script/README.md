# Tourbook auto-sync (Google Apps Script)

One Apps Script deployment **per artist**. It reads that artist's Google Drive booking
folder (one subfolder per show, each containing a "Tourbook" doc), parses each tourbook,
and upserts it into Supabase `tourbook_details` every 10 minutes. Runs on Google's side —
no page needs to stay open.

## Setup (per artist)

1. Go to [script.google.com](https://script.google.com) → **New project** → paste
   `vena-tour-feed.gs`.
2. Left sidebar → **Services (+)** → add **Drive API** (Advanced). Required to read Word
   (`.docx`) tourbooks; Google-Docs ones work without it.
3. **Project Settings** → **Script properties** → add:

   | Property | Value |
   |---|---|
   | `SUPABASE_URL` | `https://ilrqowrmhnffccprquii.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | *(service-role key — Supabase → Project Settings → API)* |
   | `ARTIST_SLUG` | `gioia-lucia` |
   | `FOLDER_ID` | *(the Drive booking folder id — from its URL)* |
   | `TOUR_YEAR` | `2026` |

4. Run **`installTrigger`** once → authorize when prompted. This schedules
   `syncTourbooks` every 10 minutes.
5. Run **`syncTourbooks`** once manually. Check the execution log
   (`View → Logs`): it reports how many tourbooks were written vs. skipped.

## How matching works

Each show subfolder is named like `17/04 - Venue`. The script builds the date
`TOUR_YEAR-04-17`, looks up the show by `(ARTIST_SLUG, date)` in Supabase, and upserts the
parsed tourbook onto that show's `tourbook_details` row (conflict target `show_id`).
**Dates not yet in the database are skipped** — add the show first (Supabase table editor
or, later, the booker admin page).

## Security

- The **service-role key lives only in Script Properties**. It is never in the repo,
  Vercel, or any browser bundle.
- The key bypasses RLS, which is why the script can write `tourbook_details` even though
  that table is otherwise read-only and auth-gated.

## Parsing

`findTourbook`, `readTable`, `parseContacts`, `extract` (and the "Name Number" → name+phone
splitting) are unchanged from the original map feed — only the output target changed from a
JSONP response to a Supabase upsert.
