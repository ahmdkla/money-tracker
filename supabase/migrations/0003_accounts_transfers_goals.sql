-- manimani: accounts, transfers and savings goals.
--
-- Until now the app knew what money was *for* (categories) but never where it
-- actually was. That is the difference between "what did I spend on coffee"
-- and "how much have I got", and the second is the first thing anyone opens a
-- money app to find out.
--
-- A transfer is its own table rather than a kind of transaction, on purpose.
-- Moving money from a bank account to a wallet is neither income nor spending;
-- letting it into the transactions table would corrupt safe-to-spend, every
-- budget and every category chart the moment somebody topped up their wallet.

-- ---------------------------------------------------------------- accounts

create table if not exists public.accounts (
  user_id         uuid not null references auth.users on delete cascade,
  id              text not null,
  name            text not null check (length(trim(name)) > 0),
  kind            text not null default 'cash'
                    check (kind in ('cash', 'bank', 'ewallet', 'card', 'savings')),
  icon            text not null default 'Wallet',
  color_key       text not null default 'slate',
  -- What was in it before the app started watching. May be negative: a credit
  -- card is an account you owe money on.
  opening_balance numeric(14,2) not null default 0,
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.accounts is
  'Where money physically is: cash, a bank account, an e-wallet, a card.';

-- ------------------------------------------------------------- transfers

create table if not exists public.transfers (
  user_id         uuid not null references auth.users on delete cascade,
  id              text not null,
  amount          numeric(12,2) not null check (amount > 0),
  from_account_id text not null,
  to_account_id   text not null,
  note            text,
  date            timestamptz not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, id),
  -- Money cannot move from an account to itself.
  constraint transfers_distinct_accounts check (from_account_id <> to_account_id),
  foreign key (user_id, from_account_id)
    references public.accounts (user_id, id) on delete restrict,
  foreign key (user_id, to_account_id)
    references public.accounts (user_id, id) on delete restrict
);

create index if not exists transfers_user_date_idx
  on public.transfers (user_id, date desc);

-- ------------------------------------------------------------------ goals

create table if not exists public.goals (
  user_id    uuid not null references auth.users on delete cascade,
  id         text not null,
  name       text not null check (length(trim(name)) > 0),
  target     numeric(14,2) not null check (target >= 0),
  saved      numeric(14,2) not null default 0 check (saved >= 0),
  deadline   date,
  icon       text not null default 'Target',
  color_key  text not null default 'evergreen',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.goals is
  'Named savings targets. Separate from the monthly set-aside, which is a pacing figure.';

-- ------------------------------------------- transactions gain an account

-- Nullable on purpose. Rows recorded before accounts existed have no answer,
-- and inventing one would be a lie; the app falls back to the first account
-- when it needs to place them.
alter table public.transactions
  add column if not exists account_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_account_fk'
  ) then
    alter table public.transactions
      add constraint transactions_account_fk
      foreign key (user_id, account_id)
      references public.accounts (user_id, id) on delete set null;
  end if;
end
$$;

create index if not exists transactions_user_account_idx
  on public.transactions (user_id, account_id);

-- ----------------------------------------------------- row level security

alter table public.accounts  enable row level security;
alter table public.transfers enable row level security;
alter table public.goals     enable row level security;

drop policy if exists "own accounts" on public.accounts;
create policy "own accounts" on public.accounts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own transfers" on public.transfers;
create policy "own transfers" on public.transfers
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own goals" on public.goals;
create policy "own goals" on public.goals
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------ new accounts get somewhere to put money

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(split_part(new.email, '@', 1), ''), 'there')
  )
  on conflict (id) do nothing;

  insert into public.categories (user_id, id, name, icon, color_key, kind) values
    (new.id, 'cat_coffee',     'Coffee',        'Coffee',       'amber',     'expense'),
    (new.id, 'cat_groceries',  'Groceries',     'ShoppingCart', 'clay',      'expense'),
    (new.id, 'cat_dining',     'Dining',        'ForkKnife',    'coral',     'expense'),
    (new.id, 'cat_rent',       'Rent',          'House',        'evergreen', 'expense'),
    (new.id, 'cat_transport',  'Transport',     'Car',          'slate',     'expense'),
    (new.id, 'cat_subs',       'Subscriptions', 'Repeat',       'plum',      'expense'),
    (new.id, 'cat_home',       'Home',          'Lightning',    'sand',      'expense'),
    (new.id, 'cat_health',     'Health',        'Heartbeat',    'mint',      'expense'),
    (new.id, 'cat_payroll',    'Payroll',       'Briefcase',    'evergreen', 'income')
  on conflict (user_id, id) do nothing;

  -- Two to start with, both at zero. A real opening balance is something only
  -- the user knows, so the app asks rather than guesses.
  insert into public.accounts (user_id, id, name, kind, icon, color_key, opening_balance) values
    (new.id, 'acc_bank', 'Current account', 'bank', 'Bank',   'evergreen', 0),
    (new.id, 'acc_cash', 'Cash',            'cash', 'Wallet', 'sand',      0)
  on conflict (user_id, id) do nothing;

  return new;
end;
$$;

-- ------------------------------------------- replace now carries the lot

create or replace function public.replace_account_data(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- Children first, all the way down to accounts, which everything points at.
  delete from public.transfers        where user_id = uid;
  delete from public.transactions     where user_id = uid;
  delete from public.budgets          where user_id = uid;
  delete from public.net_worth_points where user_id = uid;
  delete from public.goals            where user_id = uid;
  delete from public.categories       where user_id = uid;
  delete from public.accounts         where user_id = uid;

  insert into public.profiles (
    id, name, monthly_income, savings_goal_per_month, currency, dark_mode, ended_series
  )
  values (
    uid,
    coalesce(payload -> 'profile' ->> 'name', 'there'),
    coalesce((payload -> 'profile' ->> 'monthly_income')::numeric, 0),
    coalesce((payload -> 'profile' ->> 'savings_goal_per_month')::numeric, 0),
    coalesce(payload -> 'profile' ->> 'currency', 'USD'),
    coalesce(payload -> 'profile' ->> 'dark_mode', 'system'),
    coalesce(
      (select array_agg(value #>> '{}')
       from jsonb_array_elements(payload -> 'profile' -> 'ended_series')),
      '{}'
    )
  )
  on conflict (id) do update set
    name                   = excluded.name,
    monthly_income         = excluded.monthly_income,
    savings_goal_per_month = excluded.savings_goal_per_month,
    currency               = excluded.currency,
    dark_mode              = excluded.dark_mode,
    ended_series           = excluded.ended_series;

  insert into public.accounts (user_id, id, name, kind, icon, color_key, opening_balance, archived)
  select
    uid, a ->> 'id', a ->> 'name',
    coalesce(a ->> 'kind', 'cash'),
    coalesce(a ->> 'icon', 'Wallet'),
    coalesce(a ->> 'color_key', 'slate'),
    coalesce((a ->> 'opening_balance')::numeric, 0),
    coalesce((a ->> 'archived')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'accounts', '[]'::jsonb)) as a;

  insert into public.categories (user_id, id, name, icon, color_key, kind)
  select uid, c ->> 'id', c ->> 'name', c ->> 'icon', c ->> 'color_key', c ->> 'kind'
  from jsonb_array_elements(coalesce(payload -> 'categories', '[]'::jsonb)) as c;

  insert into public.transactions (
    user_id, id, amount, type, category_id, note, date, recurring, account_id
  )
  select
    uid,
    t ->> 'id',
    (t ->> 'amount')::numeric,
    t ->> 'type',
    t ->> 'category_id',
    nullif(t ->> 'note', ''),
    (t ->> 'date')::timestamptz,
    coalesce((t ->> 'recurring')::boolean, false),
    nullif(t ->> 'account_id', '')
  from jsonb_array_elements(coalesce(payload -> 'transactions', '[]'::jsonb)) as t;

  insert into public.transfers (user_id, id, amount, from_account_id, to_account_id, note, date)
  select
    uid,
    r ->> 'id',
    (r ->> 'amount')::numeric,
    r ->> 'from_account_id',
    r ->> 'to_account_id',
    nullif(r ->> 'note', ''),
    (r ->> 'date')::timestamptz
  from jsonb_array_elements(coalesce(payload -> 'transfers', '[]'::jsonb)) as r;

  insert into public.budgets (user_id, category_id, monthly_limit)
  select uid, b ->> 'category_id', (b ->> 'monthly_limit')::numeric
  from jsonb_array_elements(coalesce(payload -> 'budgets', '[]'::jsonb)) as b;

  insert into public.goals (user_id, id, name, target, saved, deadline, icon, color_key)
  select
    uid, g ->> 'id', g ->> 'name',
    (g ->> 'target')::numeric,
    coalesce((g ->> 'saved')::numeric, 0),
    nullif(g ->> 'deadline', '')::date,
    coalesce(g ->> 'icon', 'Target'),
    coalesce(g ->> 'color_key', 'evergreen')
  from jsonb_array_elements(coalesce(payload -> 'goals', '[]'::jsonb)) as g;

  insert into public.net_worth_points (user_id, month, value)
  select uid, n ->> 'month', (n ->> 'value')::numeric
  from jsonb_array_elements(coalesce(payload -> 'net_worth', '[]'::jsonb)) as n;
end;
$$;

revoke all on function public.replace_account_data(jsonb) from public;
grant execute on function public.replace_account_data(jsonb) to authenticated;
