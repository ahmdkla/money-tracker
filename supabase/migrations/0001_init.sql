-- manimani: schema, row level security, and new-account bootstrapping.
--
-- Design notes
--
-- Ids are text and generated on the client (cat_coffee, tx_lm3f9_a2b). That is
-- deliberate: the app was local first, so a record already has an identity
-- before it ever reaches the network. It also makes the local-to-account
-- import a straight insert with no id rewriting, and it lets the client stay
-- optimistic without waiting for a server-assigned key.
--
-- Every table is keyed on (user_id, id) rather than id alone, so two people
-- can both own a category called cat_coffee without collision.
--
-- Money is numeric(12,2), never float. Rounding happens once, at write.

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id                      uuid primary key references auth.users on delete cascade,
  name                    text not null default 'there',
  monthly_income          numeric(12,2) not null default 0 check (monthly_income >= 0),
  savings_goal_per_month  numeric(12,2) not null default 0 check (savings_goal_per_month >= 0),
  currency                text not null default 'USD',
  dark_mode               text not null default 'system'
                            check (dark_mode in ('system', 'light', 'dark')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.profiles is
  'One row per user: the settings that feed the safe-to-spend calculation.';

-- -------------------------------------------------------------- categories

create table if not exists public.categories (
  user_id    uuid not null references auth.users on delete cascade,
  id         text not null,
  name       text not null check (length(trim(name)) > 0),
  icon       text not null default 'Tag',
  color_key  text not null default 'slate',
  kind       text not null check (kind in ('expense', 'income')),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ------------------------------------------------------------ transactions

create table if not exists public.transactions (
  user_id     uuid not null references auth.users on delete cascade,
  id          text not null,
  amount      numeric(12,2) not null check (amount >= 0),
  type        text not null check (type in ('expense', 'income')),
  category_id text not null,
  note        text,
  date        timestamptz not null,
  recurring   boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (user_id, id),
  -- A transaction cannot outlive its category, and renaming or deleting a
  -- category must not orphan history.
  foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete restrict
);

-- Every screen filters by user and month, in date order.
create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc);

-- The forecast and the subscription radar both scan for fixed bills.
create index if not exists transactions_user_recurring_idx
  on public.transactions (user_id, recurring)
  where recurring;

-- ----------------------------------------------------------------- budgets

create table if not exists public.budgets (
  user_id       uuid not null references auth.users on delete cascade,
  category_id   text not null,
  monthly_limit numeric(12,2) not null check (monthly_limit >= 0),
  primary key (user_id, category_id),
  foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete cascade
);

-- -------------------------------------------------------- net worth points

create table if not exists public.net_worth_points (
  user_id uuid not null references auth.users on delete cascade,
  month   text not null check (month ~ '^\d{4}-\d{2}$'),
  value   numeric(14,2) not null,
  primary key (user_id, month)
);

-- ------------------------------------------------------------ updated_at

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------- row level security
--
-- The anon key ships in the browser, so RLS is the only thing standing
-- between one person's money and everyone else's. Every table is locked, and
-- every policy is the same single rule: you may touch your own rows.

alter table public.profiles         enable row level security;
alter table public.categories       enable row level security;
alter table public.transactions     enable row level security;
alter table public.budgets          enable row level security;
alter table public.net_worth_points enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own budgets" on public.budgets;
create policy "own budgets" on public.budgets
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own net worth points" on public.net_worth_points;
create policy "own net worth points" on public.net_worth_points
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------- new account bootstrap
--
-- A new account gets a profile and a starting set of categories, but no
-- transactions. Seeding someone's real money app with a fake month of
-- spending would be worse than an empty screen; the demo already exists for
-- people who have not signed up.

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

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------- atomic replace
--
-- Import, reset, and carrying a local demo into an account all mean "throw
-- away everything and put this there instead". Doing that over five separate
-- HTTP calls means a connection dropping between the delete and the insert
-- leaves someone with an empty account and no way back.
--
-- One function, one transaction. It either all lands or none of it does.

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

  -- Children first: transactions and budgets both point at categories.
  delete from public.transactions     where user_id = uid;
  delete from public.budgets          where user_id = uid;
  delete from public.net_worth_points where user_id = uid;
  delete from public.categories       where user_id = uid;

  insert into public.profiles (
    id, name, monthly_income, savings_goal_per_month, currency, dark_mode
  )
  values (
    uid,
    coalesce(payload -> 'profile' ->> 'name', 'there'),
    coalesce((payload -> 'profile' ->> 'monthly_income')::numeric, 0),
    coalesce((payload -> 'profile' ->> 'savings_goal_per_month')::numeric, 0),
    coalesce(payload -> 'profile' ->> 'currency', 'USD'),
    coalesce(payload -> 'profile' ->> 'dark_mode', 'system')
  )
  on conflict (id) do update set
    name                   = excluded.name,
    monthly_income         = excluded.monthly_income,
    savings_goal_per_month = excluded.savings_goal_per_month,
    currency               = excluded.currency,
    dark_mode              = excluded.dark_mode;

  insert into public.categories (user_id, id, name, icon, color_key, kind)
  select uid, c ->> 'id', c ->> 'name', c ->> 'icon', c ->> 'color_key', c ->> 'kind'
  from jsonb_array_elements(coalesce(payload -> 'categories', '[]'::jsonb)) as c;

  insert into public.transactions (user_id, id, amount, type, category_id, note, date, recurring)
  select
    uid,
    t ->> 'id',
    (t ->> 'amount')::numeric,
    t ->> 'type',
    t ->> 'category_id',
    nullif(t ->> 'note', ''),
    (t ->> 'date')::timestamptz,
    coalesce((t ->> 'recurring')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'transactions', '[]'::jsonb)) as t;

  insert into public.budgets (user_id, category_id, monthly_limit)
  select uid, b ->> 'category_id', (b ->> 'monthly_limit')::numeric
  from jsonb_array_elements(coalesce(payload -> 'budgets', '[]'::jsonb)) as b;

  insert into public.net_worth_points (user_id, month, value)
  select uid, n ->> 'month', (n ->> 'value')::numeric
  from jsonb_array_elements(coalesce(payload -> 'net_worth', '[]'::jsonb)) as n;
end;
$$;

revoke all on function public.replace_account_data(jsonb) from public;
grant execute on function public.replace_account_data(jsonb) to authenticated;
