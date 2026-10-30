# Bug fixes (Oct 30) — human testing guide

Use this guide to check each fix by hand in the browser before merging or demoing.
Automated Playwright tests cover the same things (`tests/15`, `tests/17`, `tests/18`).

## Before you start

- **Database first:** the new migration
  `supabase/migrations/20261030120000_presence_and_account_audit.sql` must be applied
  (`supabase link --project-ref <ref>` then `supabase db push`). Without it, the Owners tab and
  login heartbeat will error.
- **Accounts you need:** one **Admin**, one **Staff**, and **at least 4 Owner** accounts
  (test logins are in your local `.env.local`, never in the repo).
- **Two browsers:** use a normal window and a private/incognito window (or two different
  browsers) so you can be signed in as two people at once.

## Progress checklist

- [x] #1 Owners tab: shows every owner + Online/Offline filter
- [ ] #2 Veterinarian → Appointments (waiting for the full description)
- [x] #3 Name/settings changes are recorded in Logs
- [x] #4 Booking limit: a full day cannot be booked; a cancellation frees a place
- [x] Extra: login sometimes stayed on a blank login page

---

## #1 Owners tab — all owners, Online/Offline filter

**What changed:** the Owners tab lists **every** owner account (it never filtered by online
before, but there was no way to tell who was online). Each card now shows **Online** (green dot)
or **Last seen …** / **Never signed in**, and there are three filter buttons with counts:
**All owners · Online · Offline**. Accounts still waiting for approval show a
**Pending approval** tag. Disapproved sign-ups are not listed.

An account counts as **Online** while it has the app open in a visible tab (it reports in
every minute). It turns **Offline** about **3 minutes** after the tab is closed or hidden.

| # | Step | Expected |
|---|------|----------|
| 1.1 | Sign in as **Staff** → **Owners** | The top shows **All owners (N)**, **Online (x)**, **Offline (y)**, and x + y = N. |
| 1.2 | Compare N with the number of owner accounts in Supabase → Table editor → `profiles` (role = owner, not rejected) | Same number. |
| 1.3 | In the private window, sign in as **Owner A** and stay on the dashboard | — |
| 1.4 | Back in the Staff window, wait up to 1 minute (the list refreshes itself) | Owner A's card shows a green dot and **Online**. **Online** count went up by 1. |
| 1.5 | Click **Online** | Only online owners are listed (Owner A is there). |
| 1.6 | Click **Offline** | Owner A is **not** listed; owners who are not signed in are, with **Last seen …** or **Never signed in**. |
| 1.7 | Click **All owners** | Everyone is back. Type part of a name in search: search works together with the filter. |
| 1.8 | Close the Owner A window, wait ~4 minutes | Owner A moves to **Offline** with **Last seen Xm ago**. |
| 1.9 | Repeat 1.1–1.6 signed in as **Admin** | Same results. |
| 1.10 | Phone width (DevTools → 375px) | Filter buttons wrap, nothing scrolls sideways. |

## #3 Logs — profile and password changes are recorded

**What changed:** a database trigger writes a log whenever someone changes their **name, phone,
address or emergency contact**, their **password**, or their **email**. They appear in
**Logs → Account Changes** (new filter). The log shows *which* fields changed (old and new
values are kept in the record; passwords are never stored). The Logs page also now always loads
fresh data when opened (before, it could show 3-minute-old cached data).

| # | Step | Expected |
|---|------|----------|
| 3.1 | Sign in as an **Owner** → **Settings** → change **Full name** and **Phone** → **Save Profile** | "Profile updated successfully!" |
| 3.2 | In the other window, sign in as **Admin** → **Logs** → **Account Changes** | Top entry: **PROFILE UPDATED** — "*New Name* updated their name, phone number." Time = just now. |
| 3.3 | Save the Settings form again **without changing anything** | No new log entry (only real changes are logged). |
| 3.4 | Owner → **Settings** → **Security** → change password | Logs → Account Changes shows **PASSWORD CHANGED** — "… changed their password." |
| 3.5 | Use **Forgot password** on the login page and set a new password from the email | Also shows **PASSWORD CHANGED**. |
| 3.6 | Sign in as **Staff** → **Logs** → **Account Changes** | Staff sees the same entries. |
| 3.7 | Do 3.1 as a **Vet** or **Staff** account | Logged the same way (works for every role). |
| 3.8 | Sign in as an **Owner** or **Vet** | There is no **Logs** tab (Admin/Staff only). |

## #4 Booking limit — the 4th booking is blocked, a cancellation frees a place

**What changed / how it works now:**

- Bookings are still confirmed instantly (Vinz's earlier request #6).
- A day's slot takes at most **Max capacity** bookings (e.g. 3). Every booking that is not
  **cancelled** or **no-show** holds a place.
- **New:** once a day is full, the calendar shows it in red with **FULL** and it **cannot be
  clicked**, so a 4th owner cannot even start booking it.
- The database still checks the limit when the booking is saved, so even a page that was opened
  earlier (stale) cannot overbook: it shows *"This schedule is fully booked…"*.
- When Admin/Staff **cancel** (disapprove) a booking, the place is freed and the day turns green
  again.
- Note: we checked Vinz's live database — the limit check from PR #8 is installed there. Over-bookings
  seen before Oct 30, 9:27 AM were made by the old code (it never counted bookings on Vercel).

| # | Step | Expected |
|---|------|----------|
| 4.1 | **Admin** → **Schedule** → create a date (future) 9:00–17:00, **Max capacity 3**, Open | Schedule saved. |
| 4.2 | **Owner 1** → Appointments → **Book** → pick pet & service → that date | Date is green. Time slot shows **0/3 booked · 3 left**. Book it → "Appointment booked!" |
| 4.3 | Repeat with **Owner 2** and **Owner 3** | Slot shows 1/3, then 2/3. Both book fine. |
| 4.4 | **Owner 4** opens the booking form | The date is **red with FULL**, hovering says "Fully booked", clicking does nothing. |
| 4.5 | Stale page test: open Owner 4's booking form **before** Owner 3 books (stop on the time-slot step), let Owner 3 book, then Owner 4 clicks **Book** | Owner 4 gets "This schedule is fully booked. Please choose another date or time." and no 4th booking is created. |
| 4.6 | **Admin/Staff** → Appointments → cancel one of the 3 bookings (with a clinic reason) | Cancelled. |
| 4.7 | Owner 4 reloads the booking form | The date is green again, slot shows **2/3 booked**. Owner 4 can book. |
| 4.8 | Supabase → `appointments` for that date (status not cancelled/no_show) | Never more than 3 rows. |

## Extra fix — login could stay on a blank page

After **Sign In**, the page sometimes stayed on a blank `/login` instead of opening the dashboard
(found by the automated tests). Cause: the login page navigated and refreshed at the same time.

| # | Step | Expected |
|---|------|----------|
| E.1 | Sign in and out 5 times in a row with different roles | Every time you land on the dashboard. |

## If something fails

Note the account, the step number, and take a screenshot. Check the browser console and the
Vercel function logs for the same time.
