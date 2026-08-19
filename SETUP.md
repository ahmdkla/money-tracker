# Turning on accounts

The app is already deployed and working at **https://manimani-app.vercel.app**,
running in local mode: everything is stored in the visitor's browser and there
is nothing to sign in to.

This guide connects it to Supabase so people can create accounts and reach
their own data from any device. Nothing in the app changes until you finish
step 5; you can stop half way and the deployment carries on working as it does
now.

Budget about fifteen minutes.

---

## 1. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. **New project**. Name it `manimani`, pick the region closest to your users,
   and let it generate a database password.
3. **Save that password somewhere safe.** You will not need it for this guide,
   but you will if you ever connect directly to the database, and Supabase will
   not show it again.

Provisioning takes a couple of minutes. Carry on once the project dashboard
loads.

---

## 2. Create the tables

1. In the project, open **SQL Editor** in the left sidebar.
2. **New query**.
3. Open [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   from this repo, copy the whole file, and paste it in.
4. **Run**.
5. **New query** again for each of the remaining files, in order:
   [`0002_recurring_series.sql`](supabase/migrations/0002_recurring_series.sql)
   (records which repeating bills you have stopped) and
   [`0003_accounts_transfers_goals.sql`](supabase/migrations/0003_accounts_transfers_goals.sql)
   (accounts, transfers and savings goals).

You should see `Success. No rows returned`. That one file creates all five
tables, the indexes, the row level security policies, and the trigger that
gives every new account its starting categories.

**Check it worked.** Open **Database → Tables**. You should see `profiles`,
`categories`, `transactions`, `budgets`, `net_worth_points`, `accounts`,
`transfers` and `goals`, each showing **RLS enabled**. If any of them says RLS is disabled, the script did not finish;
re-run it.

The script is safe to run more than once.

---

## 3. Point the auth settings at your site

Magic links only work if Supabase knows where to send people back to.

Open **Authentication → URL Configuration** and set:

| Field | Value |
|---|---|
| **Site URL** | `https://manimani-app.vercel.app` |
| **Redirect URLs** | `https://manimani-app.vercel.app/**` |

Add the older domain too, so links shared before the rename still sign people
in:

```
https://clearing-nine.vercel.app/**
```

Add a second redirect entry for local development:

```
http://localhost:5173/**
```

Then open **Authentication → Sign In / Providers** and confirm **Email** is
enabled. Magic links need nothing else there; there is no password in this app.

> If you skip this step, signing in fails with *"This address is not on the
> project allowed redirect list yet."* The app surfaces that message as written.

---

## 4. Fix the email limit before real people use it

**This is the step people skip and regret.**

Supabase's built-in email service is for development. It is rate limited to a
few messages per hour across the entire project. With magic links, every single
sign in is an email, so the third or fourth person to try your app will be told
to wait, and there is nothing the app can do about it.

Attach your own sender:

1. Create a free account at [resend.com](https://resend.com) (3,000 emails a
   month free), or use SendGrid, Postmark, Mailgun, or any SMTP provider.
2. Verify a sending domain there and generate an SMTP credential.
3. In Supabase, open **Project Settings → Authentication → SMTP Settings**,
   turn on **Enable Custom SMTP**, and fill in the host, port, username and
   password from your provider.
4. Under **Rate Limits** on the same page, raise **Rate limit for sending
   emails** from the default to something realistic, such as 100 per hour.

Until you do this, the app still works, it just cannot let many people in at
once. The error message it shows in that case explains the situation honestly
rather than looking broken.

---

## 5. Give the app its keys

Open **Project Settings → API** and copy two values:

- **Project URL**, which looks like `https://abcdefgh.supabase.co`
- The **anon** / **public** key (newer projects may label this
  **publishable key**, starting `sb_publishable_`). Either works.

> Both of these belong in the browser and are safe to expose. The anon key
> grants nothing on its own: every table is locked behind row level security,
> so the server refuses to return a row whose `user_id` is not the signed-in
> user. **Never** put the `service_role` or `secret` key in the app. That one
> bypasses row level security entirely.

### Add them to Vercel

Either through the dashboard, at **Project → Settings → Environment Variables**,
or from this directory:

```bash
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
```

Repeat for the `preview` and `development` environments if you want branch
deploys to work too.

### Redeploy

Environment variables are read at build time, so the existing deployment will
not pick them up on its own:

```bash
npx vercel deploy --prod
```

Open the site, go to **More**, and the Account panel should now offer to sign
you in rather than explaining that accounts are off.

---

## 6. Try it

1. Open the site, tap **More → Sign in or create an account**.
2. Enter your email. You should get a link within a minute.
3. Open the link **on the same device**. You will land back in the app, signed
   in, and the Account panel will show your address with a **Saved** indicator.
4. Because your new account is empty and the browser has demo data in it, the
   app offers to copy that across. Choose **Start clean** for a real account.
5. Add a transaction, then open the site on your phone and sign in with the
   same address. It should be there.

---

## Local development

```bash
cp .env.example .env.local
```

Fill in the same two values, then `npm run dev`. Without the file the app runs
in local mode, which is also a perfectly good way to work on anything that is
not the account layer.

---

## How the two modes differ

|  | Signed out | Signed in |
|---|---|---|
| Storage | `localStorage`, this browser only | Postgres, per account |
| Starting data | The seeded demo month | Categories only, no transactions |
| Across devices | No | Yes |
| Offline | Always works | Queues writes and sends them when the connection returns |
| Clearing the site data | Loses everything | Loses nothing |

Signing out returns the browser to its local copy. The two never overwrite each
other, and the only path between them is the import prompt, which asks first.

---

## If something goes wrong

**"This address is not on the project allowed redirect list yet."**
Step 3. The Redirect URLs entry needs the `/**` suffix.

**"Too many emails have gone out for now."**
Step 4. You are on the built-in email service.

**The link opens the site but you are still signed out.**
The link was opened in a different browser from the one that requested it. PKCE
ties the two together. Request a new link from the browser you want to use.

**Account panel still says accounts are off, after adding the keys.**
The build did not pick them up. Redeploy with `npx vercel deploy --prod` and
check the variable names are exactly `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. The `VITE_` prefix is what makes them visible to the
browser bundle; without it they are invisible to the app.

**"new row violates row-level security policy"**
The migration did not finish. Re-run step 2.
