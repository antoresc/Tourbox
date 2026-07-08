// Generates idempotent seed SQL from scripts/source-data.json.
// Prints to stdout. Used to seed via the Supabase MCP / SQL editor.
// Usage: node scripts/gen-seed-sql.mjs > scripts/seed.sql
import { readFileSync } from "node:fs";

const { shows, details } = JSON.parse(
  readFileSync("scripts/source-data.json", "utf8")
);
const SLUG = "gioia-lucia";
const NAME = "Gioia Lucia";
const YEAR = 2026;

const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v == null || v === "" ? "null" : Number(v));
const jsonb = (v) => `'${JSON.stringify(v ?? {}).replace(/'/g, "''")}'::jsonb`;
const pad = (n) => String(n).padStart(2, "0");
const dateFromDs = (ds) =>
  `${YEAR}-${pad(Math.floor(ds / 100))}-${pad(ds % 100)}`;

const lines = [];
lines.push(
  `insert into artists (slug, name) values (${q(SLUG)}, ${q(NAME)}) on conflict (slug) do nothing;`
);

const showTuples = shows
  .map((s) => {
    const d = dateFromDs(s.ds);
    return `  (${q(d)}::date, ${q(s.city)}, ${q(s.prov)}, ${num(s.lat)}, ${num(s.lng)}, ${q(s.venue || null)}, ${q(s.status)}, ${num(s.form)}, ${q(s.tm || null)}, ${q(s.van || null)})`;
  })
  .join(",\n");

lines.push(
  `insert into shows (artist_id, date, city, prov, lat, lng, venue, status, formation, tour_manager, van_info)
select (select id from artists where slug = ${q(SLUG)}), v.date, v.city, v.prov, v.lat, v.lng, v.venue, v.status, v.formation, v.tour_manager, v.van_info
from (values
${showTuples}
) as v(date, city, prov, lat, lng, venue, status, formation, tour_manager, van_info)
on conflict (artist_id, date) do nothing;`
);

for (const [ds, d] of Object.entries(details)) {
  const date = dateFromDs(Number(ds));
  const contacts = { rep: d.rep || [], venue: d.venueContacts || [], sound: d.sound || [] };
  lines.push(
    `insert into tourbook_details (show_id, venue, address, wifi, parking, dressing, payment, dinner, hotel, timings, arriving, leaving, contacts)
values (
  (select s.id from shows s join artists a on a.id = s.artist_id where a.slug = ${q(SLUG)} and s.date = ${q(date)}::date),
  ${q(d.venue || null)}, ${q(d.address || null)}, ${q(d.wifi || null)}, ${q(d.parking || null)}, ${q(d.dressing || null)}, ${q(d.payment || null)}, ${q(d.dinner || null)},
  ${jsonb(d.hotel)}, ${jsonb(d.timings)}, ${jsonb(d.arriving)}, ${jsonb(d.leaving)}, ${jsonb(contacts)}
) on conflict (show_id) do update set
  venue = excluded.venue, address = excluded.address, wifi = excluded.wifi, parking = excluded.parking,
  dressing = excluded.dressing, payment = excluded.payment, dinner = excluded.dinner,
  hotel = excluded.hotel, timings = excluded.timings, arriving = excluded.arriving,
  leaving = excluded.leaving, contacts = excluded.contacts;`
  );
}

process.stdout.write(lines.join("\n\n") + "\n");
