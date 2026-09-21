-- Przejście z Supabase Auth na własne logowanie.
--
-- * tworzy public.app_users (własna tabela użytkowników),
-- * kopiuje istniejących użytkowników z auth.users Z TYMI SAMYMI UUID — dzięki temu
--   wszystkie wiersze w earnings_settings / earnings_days zostają przypisane do właściwych osób,
-- * przepina klucze obce user_id z auth.users na app_users,
-- * niczego nie usuwa: auth.users, dane i polityki RLS zostają bez zmian.
--
-- Uruchom JEDEN raz, póki schemat auth jeszcze istnieje. Skrypt jest w jednej transakcji —
-- przy błędzie nic się nie zmieni.
-- Hasła ustawia się osobno: npm run user:password -- <email>

begin;

create table if not exists public.app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  password_hash text,               -- null = konto zmigrowane, hasło jeszcze nieustawione (logowanie zablokowane)
  created_at    timestamptz not null default now()
);

create unique index if not exists app_users_email_key on public.app_users (lower(email));

-- Zachowaj dotychczasowe UUID użytkowników.
insert into public.app_users (id, email, created_at)
select id, lower(email), created_at
from auth.users
where email is not null
on conflict (id) do nothing;

-- Zrzuć klucze obce wskazujące na auth.users (nazwy constraintów nie są nam znane).
do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'f'
      and confrelid = 'auth.users'::regclass
      and conrelid in ('public.earnings_settings'::regclass, 'public.earnings_days'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- Wiersze z user_id spoza app_users przerwą migrację na tym kroku (i wycofają transakcję) — to celowe.
alter table public.earnings_settings drop constraint if exists earnings_settings_user_id_fkey;
alter table public.earnings_settings
  add constraint earnings_settings_user_id_fkey
  foreign key (user_id) references public.app_users (id) on delete cascade;

alter table public.earnings_days drop constraint if exists earnings_days_user_id_fkey;
alter table public.earnings_days
  add constraint earnings_days_user_id_fkey
  foreign key (user_id) references public.app_users (id) on delete cascade;

-- Backend używa INSERT ... ON CONFLICT, więc potrzebne są unikalne indeksy.
create unique index if not exists earnings_settings_user_id_key on public.earnings_settings (user_id);
create unique index if not exists earnings_days_user_id_date_key_key on public.earnings_days (user_id, date_key);

commit;
