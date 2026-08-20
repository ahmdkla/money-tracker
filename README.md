# manimani

> **manimani, Brand New Day for Your Money**

A calm money tracker that exists to answer one question the moment it opens:
**am I okay to spend today?**

Everything on screen serves that question. It is not a guilt machine: budgets
that run over say so plainly and suggest rebalancing rather than scolding.

**Live: <https://manimani-app.vercel.app>**

---

## What it does

- **Safe to spend today.** Income, minus the bills you already know about,
  minus your savings goal, divided across the days that are actually left.
- **A seven day forecast** that shows rent landing as a visible cliff rather
  than a number that quietly shrinks.
- **Accounts and transfers.** Cash, bank, e-wallet, card, savings, each with a
  balance. Moving money between your own accounts is never counted as spending.
- **Budgets, savings goals, and reports** by day, week, month or year.
- **Bills that actually repeat**, rather than a label that means nothing next
  month.
- **Import a CSV from your bank.** Column detection, a preview, and duplicate
  rows found and unticked before anything is committed.
- **Bahasa Indonesia and English**, switchable from the top of the navigation
  on any screen rather than buried in settings. Indonesian is the default, and
  dates, numbers and the greeting all follow it.
- **Rupiah, US dollar or ringgit**, and switching genuinely converts every
  stored figure at the live rate rather than relabelling them. With no
  connection the switch does not happen and says so.
- **A month as a PDF**, in one tap, from the top of Home. Summary, spending by
  category, every budget, account balances, savings goals, and every
  transaction grouped by day.
- **Search everything**, plus a command palette on `Ctrl`/`Cmd` + `K`.
- **Two real layouts**: a sidebar application on desktop, a drawer and a
  floating action button on a phone. Not one scaled up.
- **Recording something takes seconds.** Direction, amount, account, and a
  note; the category is guessed from the note and is optional, so nothing
  blocks a save. Anything unmatched lands in a catch-all to fix later.
- Dark mode, reachable from the same place as the language, full keyboard
  access, and it respects `prefers-reduced-motion`.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type check, then a production build |
| `npm run preview` | Serve the production build locally |
| `npm test` | 174 unit tests over the money logic, translation, entry and the report |

It runs with no configuration at all. Without Supabase credentials the app is
entirely local: it stores everything in `localStorage`, needs no server, and
opens on a seeded demo month so the first screen has something to say. Adding
credentials switches accounts on. See **[SETUP.md](SETUP.md)**.

## Three decisions worth knowing about

**Money is stored in whatever currency is selected, as a plain number.**
Switching currency therefore rewrites every stored figure at the live rate
(`src/lib/currency.ts`), because relabelling would silently turn fifty thousand
rupiah into fifty thousand dollars. The rate comes from the network and there
is deliberately no offline fallback: a guessed rate would quietly corrupt every
number in the app, so a failed request cancels the switch and shows a message.

**The PDF writer is about four hundred lines, not a dependency**
(`src/lib/pdf.ts`). A money app should not pull three hundred kilobytes and a
supply chain into the browser to draw text and rectangles. It writes enough of
the format for the report to typeset properly, uses two of the fourteen fonts
every reader is required to carry so nothing is embedded, and the whole
feature, layout and all, is a 6 kB chunk fetched only when somebody asks for a
report. `src/lib/report.ts` works out the numbers as a pure function, so the
arithmetic is tested without a PDF reader in the loop.

**Translation is a dictionary and a lookup, not a library** (`src/lib/i18n.ts`).
One namespace, both languages in the bundle, so switching is instant with
nothing to fetch. Pure modules under `src/lib` never import it; they return
dictionary keys and let the screen do the wording, which is why they stay
testable without a React tree. A test asserts the two tables have not drifted
apart.

## Built with

React 18 + TypeScript, Vite, Tailwind CSS, Recharts, Phosphor icons, Vitest,
and Supabase (Postgres, auth, row level security) when accounts are enabled.
No router, no state library, no component library.

## Security

- **No secrets live in this repository.** `.env.example` holds placeholders
  only; real values are environment variables at build time.
- The Supabase **anon key is public by design** and safe in browser code. It
  grants nothing on its own, because every table is locked behind row level
  security policies matching `auth.uid()` to the row owner. Those policies are
  in [`supabase/migrations/`](supabase/migrations/) and there are tests that
  assert one account cannot read, write, forge or delete another's rows.
- The **`service_role` key and the database password must never** appear in
  this repo, in client code, or in an environment variable prefixed `VITE_`.
  Anything with that prefix is compiled into the bundle and is public.
- Signed out, no data leaves the browser. There is no analytics and no
  tracking.
- `vercel.json` sets `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy` and a restrictive `Permissions-Policy`.

## Layout of the project

```
src/
  lib/          pure functions over state: the money logic, no React
  store/        reducer, persistence, auth session, theme
  components/   shell, navigation, sheets, shared primitives
  screens/      one file per screen
supabase/
  migrations/   schema, row level security, and the seeding trigger
```

Everything in `src/lib` is a pure function over state: no React, no storage,
no formatting decisions. That is what makes `npm test` meaningful, and it is
why the screens are almost entirely presentation.

---

## Where each piece lives

| What | Where |
|---|---|
| **The safe-to-spend formula** | [`src/lib/safeToSpend.ts`](src/lib/safeToSpend.ts) |
| Seven day cash projection | [`src/lib/forecast.ts`](src/lib/forecast.ts) |
| Natural language quick add | [`src/lib/parse.ts`](src/lib/parse.ts) |
| Subscription radar | [`src/lib/recurring.ts`](src/lib/recurring.ts) |
| Insights derivations | [`src/lib/insights.ts`](src/lib/insights.ts) |
| Search and filtering | [`src/lib/filter.ts`](src/lib/filter.ts) |
| Accounts, balances, transfers | [`src/lib/accounts.ts`](src/lib/accounts.ts) |
| Savings goals | [`src/lib/goals.ts`](src/lib/goals.ts) |
| Reports over a period | [`src/lib/reports.ts`](src/lib/reports.ts) |
| Reminders and warnings | [`src/lib/alerts.ts`](src/lib/alerts.ts) |
| Bills that actually repeat | [`src/lib/recurringEngine.ts`](src/lib/recurringEngine.ts) |
| Bank CSV parsing and mapping | [`src/lib/csv.ts`](src/lib/csv.ts) |
| Merchant to category matching | [`src/lib/parse.ts`](src/lib/parse.ts) |
| Money and date formatting | [`src/lib/format.ts`](src/lib/format.ts), [`src/lib/date.ts`](src/lib/date.ts) |
| Demo data | [`src/lib/seed.ts`](src/lib/seed.ts) |
| State, persistence, theme | [`src/store/`](src/store/) |
| Screens | [`src/screens/`](src/screens/) |
| Database schema and policies | [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) |
| Supabase reads and writes | [`src/lib/remote.ts`](src/lib/remote.ts) |
| Write queue and retry | [`src/lib/sync.ts`](src/lib/sync.ts) |
| Sessions and magic links | [`src/store/auth.ts`](src/store/auth.ts) |

## The formula

`computeSafeToSpend(state, today)` in
[`src/lib/safeToSpend.ts`](src/lib/safeToSpend.ts):

```
spendableThisMonth     = monthlyIncome - fixedBillsThisMonth - savingsGoalPerMonth
alreadySpentThisMonth  = discretionary expenses dated this month
remainingThisMonth     = spendableThisMonth - alreadySpentThisMonth
daysLeftIncludingToday = daysInMonth - todayDate + 1
dailyPace              = spendableThisMonth / daysInMonth
safeToSpendToday       = max(0, remainingThisMonth / daysLeftIncludingToday)
```

**One decision worth flagging.** A fixed bill is counted as *every* recurring
expense dated in the current month, paid or not, rather than only the unpaid
ones. Counting only the unpaid half drops a rent payment out of both terms the
moment it lands (it is no longer upcoming, and it was never discretionary),
which quietly hands back money that has already gone. It would also make
`dailyPace` climb each time a bill cleared, when the spec calls it "the steady
baseline". Counting all of them keeps the stated promise exactly: the number
does not move on the day rent lands, because rent was never in the
discretionary pot. There is a test pinning this behaviour.

## Two layouts, not one scaled

Below 1024px the app is a phone: a slim top bar, a navigation drawer that
slides in **from the right** so the trigger and the panel both sit where a
thumb can reach, and one floating button for the only action that matters.

From 1024px it is a desktop application: a fixed left sidebar carrying
navigation, search and the account, and a main area laid out in real columns.
Home puts the hero beside the forecast with recent activity and budgets below;
Transactions runs a sticky filter rail next to the results.

These are different components rather than one component with things hidden.
The drawer is on the right because that is a thumb decision; the sidebar is on
the left because that is a pointer convention, and a mouse has no reach
problem to solve.

## Accounts, and why a transfer is not a transaction

Categories answer what money was *for*. Accounts answer where it *is*, which is
the first thing anyone opens a money app to find out, and the app had no answer
until now.

A transfer lives in its own table rather than as a kind of transaction. Moving
money from a bank account to a wallet is neither income nor spending, and
letting it into either bucket would quietly corrupt safe-to-spend, every budget
and every category chart the moment somebody topped up their wallet. Only
balances look at transfers. There is a test asserting that a transfer of any
size leaves the daily number untouched.

Balances count only what has already moved. A rent bill dated three days out is
a real commitment the forecast needs, but it is not money that has left, and a
balance that counted it would be wrong in the user's favour.

Deleting an account that has history archives it instead. Removing it would
either orphan the transactions or silently rewrite them, and both are worse
than a greyed out row.

## Savings goals

Separate from the monthly set-aside on purpose. That figure is a pacing tool:
it decides how much of this month is spendable. A goal is a named target with a
running total, answering "how far off am I". Folding them together would make
the hero number lurch every time somebody added an ambition.

With a deadline, the app works out what has to go in each month, and says so
when that is more than the monthly set-aside currently allows.

## Reports and alerts

[`src/lib/reports.ts`](src/lib/reports.ts) buckets by day, week, month or year.
Weeks start on Monday. Money out is drawn below the axis so the two bars never
stack and mislead.

[`src/lib/alerts.ts`](src/lib/alerts.ts) surfaces bills due inside a week,
budgets past eighty percent, a spent-out day, and goals that are falling
behind. They are in-app rather than push notifications: a permission prompt
before an app has earned any trust gets dismissed and never seen again. Every
alert has a threshold, because one that fires daily stops being read.

## Bills that repeat

`recurring` used to be a label and nothing more: rent was marked as a bill, the
forecast treated it as one, and next month it simply was not there.
[`expandRecurring`](src/lib/recurringEngine.ts) closes that. A series is one
merchant in one category; the next occurrence is one calendar month on; nothing
is created for a month that already has an instance, so running it twice is
harmless; and it only looks two months ahead, so the forecast has what it needs
without the ledger filling with imaginary future.

Stopping a bill is a first-class action rather than a delete that gets undone
on the next load. `endedSeries` records the decision, future instances are
cleared, and anything already paid stays, because that is history rather than a
plan.

## Importing from a bank

Parse anything, guess the columns, show the guess, and change nothing until the
user has looked at it.
[`src/lib/csv.ts`](src/lib/csv.ts) handles quoted fields, doubled quotes,
semicolon and tab separators, `1,234.56` and `1.234,56`, bracketed negatives,
separate debit and credit columns, and day-first against month-first dates.

Merchants are matched to categories by
[`matchCategory`](src/lib/parse.ts), which is deliberately separate from the
quick-add parser: quick add extracts an amount from the text, and running that
over a bank description eats the digits in `TESCO-STORES-3299` and takes the
merchant with them. Rows that already exist are found and unticked; rows that
cannot be placed are held back rather than filed somewhere wrong.

## Keyboard

| Key | Does |
|---|---|
| `Ctrl`/`Cmd` + `K` | Command palette: screens, actions, and transaction search together |
| `N` | Add a transaction |
| `/` | Jump to Transactions and focus the search field |
| `Esc` | Close whatever is open |

## How the backend fits

The app was local first and stays that way. `AppProvider` runs the same pure
reducer either way; the only difference is what happens after a dispatch.

Signed out, state is written to `localStorage` and that is the end of it.
Signed in, the reducer still runs first so the UI moves immediately, and the
action is then translated into the smallest write that reflects it and pushed
onto a queue. Adding a coffee is one upsert, not a re-send of everything.

Three details worth knowing:

- **Writes are ordered.** The queue runs one job at a time, because an add
  followed by a delete arriving out of order would resurrect a deleted record.
  Failures retry with backoff, and going offline parks the queue rather than
  dropping it.
- **Ids come from the client.** A record has an identity before it ever reaches
  the network, which is what lets a local copy be imported into an account with
  a plain insert and no id rewriting.
- **Row level security is the whole security model.** The anon key is public by
  design. Every table carries the same policy, `auth.uid() = user_id`, so the
  database itself refuses to hand over another account's rows.

Local storage is keyed per account, so signing back in repaints instantly from
cache while the server response is still in flight, and two people sharing a
laptop never see each other's numbers.

## Deploying

Vercel, from this directory:

```bash
npx vercel deploy --prod
```

`vercel.json` sets the SPA rewrite, immutable caching for hashed assets, and
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and
`Permissions-Policy`. Accounts need two environment variables; see
[SETUP.md](SETUP.md).

## Resetting the demo data

**More → Your data → Reset demo data**, then either restore the seeded month or
start completely empty. Clearing the site data for `localhost:5173` does the
same thing. The storage key is `manimani.state.v1`; anything saved under the
older `clearing.state.v1` key is migrated across on first load, so the rename
cost nobody their months.

The seed is built relative to today, so the app always opens on a month in
progress. It is tuned to show the product doing its job: a month running a
little warm, with rent landing in a few days and dragging the forecast under
the line. Last month is seeded too, so the Insights comparison has something
true to say on first open.

## Tests

```bash
npm test
```

91 tests over the formula, the forecast, the parser, the recurring detector,
the repeat engine, search and filtering, CSV parsing, the import validator,
account balances, transfers, savings goals, reports and alerts.
The expected values were worked out by hand from the seed rows and are
commented with their arithmetic, so a failure tells you which assumption broke.

## Design notes

- **Type.** Body is Public Sans; the hero number, and only the hero number, is
  Fraunces. Both are self hosted through Fontsource, so no font is ever fetched
  from a third party and the signed-out app makes no network requests at all.
- **Colour.** Evergreen, mint, amber and coral over a green-tinted neutral
  ramp. Every foreground and background pair, in both themes, was checked at
  4.5:1 for text and 3:1 for chart marks.
- **Surfaces** are separated with hairline borders rather than drop shadows.
  There is exactly one shadow in the app, under the floating plus button, which
  has to read as raised.
- **Colour is never the only signal.** Tight days in the forecast carry a coral
  bar, a coral axis label, a dot, a named legend entry and a labelled reference
  line. Budget states carry words as well as bar colour.
- **Motion** is limited to the hero count-up, the sheet, and a press scale. All
  of it collapses under `prefers-reduced-motion`.
- **Loading.** Recharts is not in the first chunk. The hero number is the
  reason the app opens and does not wait on a chart library, so the forecast
  arrives behind a skeleton that is already holding its space. Insights,
  Budgets and More are lazy too, and so is the Supabase client, which is 57 kB
  gzipped that a visitor trying the demo never downloads. The entry chunk is
  about 108 kB gzipped.

## Accessibility

Keyboard reachable throughout, with a visible focus ring that is shaped but
never removed. The sheet traps focus, restores it to whatever opened it, and
closes on Escape. Charts carry text summaries for screen readers. Every touch
target is at least 44px tall. Toasts announce politely and never steal focus.
Tab changes move focus to the top of the new view.
