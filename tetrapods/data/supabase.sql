-- Drop us a tetrapod: the shared heap (DICTO, 2026-10-14). Run once in the Supabase SQL editor of the "dictospheres" project.
-- Anyone can see the heap and add blocks; nobody can change or delete them from the page. Every visit drops a block; each visitor may
-- add at most 25 a day (visits + 3 extras, the extras counted on the page), and the whole shore takes at most 2000 a day. Positions must lie on the scene.
create table if not exists public.tetrapods (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  family text not null check (family in ('tetra', 'octa', 'cube', 'd13')),
  p real[] not null check (array_length(p, 1) = 3 and abs(p[1]) < 1110 and abs(p[3]) < 360 and p[2] between -10 and 80),
  q real[] not null check (array_length(q, 1) = 4),
  visitor text not null check (char_length(visitor) between 8 and 64)
);
create index if not exists tetrapods_visitor_time on public.tetrapods (visitor, created_at);

alter table public.tetrapods enable row level security;
drop policy if exists "anyone can see the heap" on public.tetrapods;
create policy "anyone can see the heap" on public.tetrapods for select to anon, authenticated using (true);
drop policy if exists "anyone can add a block" on public.tetrapods;
create policy "anyone can add a block" on public.tetrapods for insert to anon, authenticated with check (true);

-- the visitor id stays private: the page may read only these columns
revoke select on public.tetrapods from anon, authenticated;
grant select (id, created_at, family, p, q) on public.tetrapods to anon, authenticated;
grant insert (family, p, q, visitor) on public.tetrapods to anon, authenticated;

create or replace function public.tetrapods_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.tetrapods where visitor = new.visitor and created_at > now() - interval '1 day') >= 25 then
    raise exception 'daily limit reached';
  end if;
  if (select count(*) from public.tetrapods where created_at > now() - interval '1 day') >= 2000 then
    raise exception 'the shore is full for today';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists tetrapods_limit on public.tetrapods;
create trigger tetrapods_limit before insert on public.tetrapods for each row execute function public.tetrapods_limit();
