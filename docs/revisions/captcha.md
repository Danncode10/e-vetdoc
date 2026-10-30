# Spam protection (captcha) — Oct 30, 2026

## Why
The sign-up form had Cloudflare Turnstile, but it only switches on when two keys are set in
Vercel. They were never set, so **production had no captcha**: bots could create pending accounts
and make the site send confirmation and password-reset emails to any address.

## What it does now
The **Register** and **Forgot password** forms always have a spam check:

1. **Built-in math captcha (default, no setup).** A small sum such as `4 + 1 = ?` drawn as a
   distorted image (strokes, noise lines and dots — not text, so it cannot be read from the page).
   The person types the answer; a refresh button shows a different question.
2. **Honeypot.** A hidden field people never see. Bots that fill every field are rejected.
3. **Single use + expiry.** Each question can be answered once and expires after 10 minutes, so a
   bot cannot reuse one solved answer to send many requests.
4. **Rate limits** on sign-up and reset (already present; active when Upstash is configured).

If both Turnstile keys are added later, the forms automatically use **Cloudflare Turnstile**
instead of the math question (the honeypot stays).

## How it works (technical)
- `src/services/captcha.ts` (server only)
  - `createCaptchaChallenge()` picks two numbers and `+`/`−`, renders the SVG, and returns a
    token `payload.signature`. `payload` = random nonce + expiry; `signature` =
    HMAC-SHA256(`payload|answer`) with a server key. The answer itself is never sent.
  - `verifyCaptcha()` rejects a filled honeypot, then checks the Turnstile token (if configured)
    or the built-in answer: recomputes the HMAC with the typed answer (constant-time compare),
    checks expiry, and marks the nonce as used with `consume_captcha_challenge()`.
  - Signing key: `CAPTCHA_SECRET` if set, otherwise derived from `SUPABASE_SERVICE_ROLE_KEY`
    (which every deployment already has) — that is why it works with no new settings.
- `src/services/captcha-actions.ts` — `getCaptchaChallenge()` server action for the form.
- `src/components/auth/spam-check.tsx` — the form widget (image, answer box, refresh, honeypot,
  or Turnstile).
- `src/services/auth-server.ts` — sign-up and password-reset check the spam answer **before**
  calling Supabase, so no account is created and no email is sent on failure.
- Database: `supabase/migrations/20261030140000_captcha_used_challenges.sql` — table
  `private.captcha_used_challenges` (not reachable through the API) and
  `public.consume_captcha_challenge(nonce)` (service role only; returns false on reuse; forgets
  entries older than a day).
- Development/tests only: the dev server adds the answer as `data-test-answer` so Playwright can
  solve it. Production builds never send it (checked against a production build).

## Rollout
1. `supabase db push` on the production project (adds the single-use table/function).
2. Merge the PR → Vercel deploys. Nothing to configure. (Optional: set `CAPTCHA_SECRET`.)
3. Check: open the live site → **Create Account** → the math question is shown.

## Tests
- `tests/20-captcha.spec.ts` (7 tests): image not readable as text; Turnstile not used without
  keys; refresh gives a new question; empty answer caught; wrong answer rejected with no account
  created and a new question shown; honeypot rejected; correct answer creates the pending
  account; **replaying the same solved challenge with another email is rejected**; forgot
  password requires the check too.
- `tests/12-registration.spec.ts` updated to use the built-in captcha.

## Manual test (5 minutes)
| # | Step | Expected |
|---|------|----------|
| 1 | Open the site → **Create Account** | Under the password: "SPAM CHECK — SOLVE THE QUESTION", a math image, a refresh button, an Answer box. |
| 2 | Click the refresh button | A different question appears. |
| 3 | Fill the form, type a **wrong** answer, submit | "The spam check answer is wrong or expired. Please try the new question." A new question appears. No account in Supabase. |
| 4 | Leave the answer empty, submit | "Answer the spam check question." |
| 5 | Type the right answer, submit | "Account created" message; the account appears as Pending in **Approvals**. |
| 6 | **Forgot password** → enter an email → wrong answer | Same error; no email sent. With the right answer: "Reset email sent". |
| 7 | Phone (375px wide) | Everything fits; no sideways scrolling. |

## Limitations
- A math image stops simple bots and mass spam, not a determined attacker using OCR. For stronger
  protection, add the free Cloudflare Turnstile keys in Vercel — no code change needed.
- The question is an image; people using screen readers get an alt text but cannot read the
  numbers. Turnstile is more accessible if that matters.
