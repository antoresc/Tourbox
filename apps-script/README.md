# Tourbook auto-sync (Google Apps Script)

One Apps Script deployment **per artist**. It reads that artist's Google Drive booking
folder (one subfolder per show, each containing a "Tourbook" doc), parses each tourbook,
and upserts it into Supabase `tourbook_details` every 10 minutes. Runs on Google's side —
no page needs to stay open.

## Editing from the repo (clasp)

`vena-tour-feed.gs` is the source of truth in git. To keep the **live** Apps Script
project in sync with this file — so it can be edited and pushed from the repo instead of
pasted into the online editor — link it once with
[clasp](https://github.com/google/clasp):

```bash
cd ~/Dev/vena-tourbook
npm install                       # installs @google/clasp (devDependency)
npx clasp login                   # opens Google sign-in in your browser (one time)
cp .clasp.json.example .clasp.json
# paste the Script ID: Apps Script editor → Project Settings (gear) → IDs → Script ID
npm run as:pull                   # pull the live project (code + manifest) into apps-script/
```

Then the round-trip:

| Command | What it does |
|---|---|
| `npm run as:push` | deploy `apps-script/` to the live project |
| `npm run as:pull` | bring live changes back into the repo |
| `npm run as:run -- syncTourbooks` | execute a function remotely¹ |
| `npm run as:logs` | tail the execution logs¹ |

¹ `as:run` / `as:logs` also need the Apps Script API enabled
(script.google.com/home/usersettings) and a linked Google Cloud project. Without them,
`as:push` still works — run the function from the editor or let the 10-minute trigger fire,
then read the execution log there.

`.clasp.json` (holds the Script ID) and `~/.clasprc.json` (holds your Google credentials)
are gitignored. Each artist is a separate Apps Script project, so each gets its own
`.clasp.json` when you're working on it.

## Setup (per artist, first time)

1. Go to [script.google.com](https://script.google.com) → **New project** → paste
   `vena-tour-feed.gs` (or `clasp create` + `as:push` from the repo).
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
