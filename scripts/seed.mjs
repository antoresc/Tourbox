// Seeds artist + shows + tourbook_details into Supabase using the service-role key.
// The service-role key bypasses RLS and must NEVER be committed — pass it at run time:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... [LOGO_URL=...] \
//     node scripts/extract-source.mjs && node scripts/seed.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const { shows, details } = JSON.parse(
  readFileSync("scripts/source-data.json", "utf8")
);
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const pad = (n) => String(n).padStart(2, "0");
const dateFromDs = (ds) => `2026-${pad(Math.floor(ds / 100))}-${pad(ds % 100)}`;

const { data: artist } = await db
  .from("artists")
  .upsert(
    { slug: "gioia-lucia", name: "Gioia Lucia", logo_url: process.env.LOGO_URL || null },
    { onConflict: "slug" }
  )
  .select()
  .single();

const showRows = shows.map((s) => ({
  artist_id: artist.id,
  date: dateFromDs(s.ds),
  city: s.city,
  prov: s.prov,
  lat: s.lat,
  lng: s.lng,
  venue: s.venue || null,
  status: s.status,
  formation: s.form,
  tour_manager: s.tm || null,
  van_info: s.van || null,
}));
await db.from("shows").upsert(showRows, { onConflict: "artist_id,date" });

const { data: dbShows } = await db
  .from("shows")
  .select("id,date")
  .eq("artist_id", artist.id);
const idByDs = Object.fromEntries(
  dbShows.map((r) => {
    const [, m, d] = r.date.split("-").map(Number);
    return [m * 100 + d, r.id];
  })
);

const tbRows = Object.entries(details)
  .map(([ds, d]) => ({
    show_id: idByDs[Number(ds)],
    venue: d.venue || null,
    address: d.address || null,
    wifi: d.wifi || null,
    parking: d.parking || null,
    dressing: d.dressing || null,
    payment: d.payment || null,
    dinner: d.dinner || null,
    hotel: d.hotel || {},
    timings: d.timings || {},
    arriving: d.arriving || {},
    leaving: d.leaving || {},
    contacts: { rep: d.rep || [], venue: d.venueContacts || [], sound: d.sound || [] },
  }))
  .filter((r) => r.show_id);
await db.from("tourbook_details").upsert(tbRows, { onConflict: "show_id" });

console.log(`seeded artist + ${showRows.length} shows + ${tbRows.length} tourbooks`);
