-- Stopped recurring series.
--
-- `recurring` used to be only a label. Now that bills genuinely repeat, the
-- app needs somewhere to record the ones the user has cancelled, otherwise
-- deleting next month's rent just has it recreated on the next load.
--
-- A text array on the profile rather than its own table: the list is short,
-- it is always read with the profile, and it has no attributes of its own.

alter table public.profiles
  add column if not exists ended_series text[] not null default '{}';

comment on column public.profiles.ended_series is
  'Recurring series keys (categoryId::note) the user has stopped.';

-- The replace function predates the column, so it needs to carry it too.
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

  delete from public.transactions     where user_id = uid;
  delete from public.budgets          where user_id = uid;
  delete from public.net_worth_points where user_id = uid;
  delete from public.categories       where user_id = uid;

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
