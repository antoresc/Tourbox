alter table tourbook_details add column if not exists updated_at timestamptz not null default now();

create or replace function set_tourbook_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tourbook_updated_at on tourbook_details;
create trigger trg_tourbook_updated_at
  before update on tourbook_details
  for each row execute function set_tourbook_updated_at();
