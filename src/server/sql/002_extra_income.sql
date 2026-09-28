-- Dodatkowe przychody w danym miesiącu (poza godzinami z kalendarza), każdy z własną stawką VAT.
--
-- * net_amount to kwota netto (bez VAT) — od niej liczony jest podatek dochodowy,
-- * vat_rate: '23', '8', '5', '0' albo 'zw' (zwolniony),
-- * skrypt można bezpiecznie uruchomić ponownie.
-- Uruchom: npm run db:migrate -- 002_extra_income.sql

begin;

create table if not exists public.earnings_extra_income (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.app_users (id) on delete cascade,
  month_key   text not null check (month_key ~ '^\d{4}-\d{2}$'),   -- 'YYYY-MM'
  description text not null default '',
  net_amount  numeric(12, 2) not null check (net_amount > 0),
  vat_rate    text not null check (vat_rate in ('23', '8', '5', '0', 'zw')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists earnings_extra_income_user_month_idx
  on public.earnings_extra_income (user_id, month_key);

-- Spójnie z pozostałymi tabelami: RLS włączone, backend (rola postgres) i tak je omija.
alter table public.earnings_extra_income enable row level security;

commit;
