export type Contact = { name?: string; phone?: string; tel?: string; email?: string };

export type Artist = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
};

export type Show = {
  id: string;
  artist_id: string;
  date: string; // YYYY-MM-DD
  city: string;
  prov: string | null;
  lat: number;
  lng: number;
  venue: string | null;
  status: "confirmed" | "interest" | "tbd";
  formation: number | null;
  tour_manager: string | null;
  van_info: string | null;
};

export type TourbookDetail = {
  show_id: string;
  venue: string | null;
  address: string | null;
  wifi: string | null;
  parking: string | null;
  dressing: string | null;
  payment: string | null;
  dinner: string | null;
  hotel: { name?: string; address?: string; distance?: string; rooming?: string };
  timings: { load?: string; sound?: string; dinner?: string; doors?: string; stage?: string };
  arriving: { time?: string; contacts?: Contact[] };
  leaving: { time?: string; contacts?: Contact[] };
  contacts: { rep?: Contact[]; venue?: Contact[]; sound?: Contact[] };
};

// A show enriched with the derived fields the ported UI relies on.
export type DerivedShow = Show & { ds: number; m: number; label: string };

// Tourbook details keyed by the derived `ds` integer; null means "locked".
export type DetailsByDs = Record<number, TourbookDetail> | null;
