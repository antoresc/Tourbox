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
