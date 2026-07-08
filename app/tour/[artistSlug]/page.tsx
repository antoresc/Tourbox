import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { dsFromDate } from "@/lib/tour-derive";
import type { TourbookDetail } from "@/lib/types";
import TourApp from "../TourApp";
import "../tour.css";

export default async function Page({
  params,
}: {
  params: Promise<{ artistSlug: string }>;
}) {
  const { artistSlug } = await params;
  const db = await createServerSupabase();

  const { data: artist } = await db
    .from("artists")
    .select("*")
    .eq("slug", artistSlug)
    .single();
  if (!artist) notFound();

  const { data: shows } = await db.from("shows").select("*").eq("artist_id", artist.id);

  const {
    data: { user },
  } = await db.auth.getUser();

  let details: Record<number, TourbookDetail> | null = null;
  if (user && shows?.length) {
    const { data: tb } = await db
      .from("tourbook_details")
      .select("*")
      .in(
        "show_id",
        shows.map((s) => s.id)
      );
    if (tb) {
      const dsByShow = Object.fromEntries(shows.map((s) => [s.id, dsFromDate(s.date)]));
      details = Object.fromEntries(tb.map((d) => [dsByShow[d.show_id], d]));
    }
  }

  return <TourApp artist={artist} shows={shows ?? []} details={details} />;
}
