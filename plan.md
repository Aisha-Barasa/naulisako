# Nauli Sacco — 8-Hour Build Plan (for Claude Code)

Matatu fare payments: passenger pays by M-Pesa STK Push, the fare is settled to the vehicle's own Lightning wallet in sats, the conductor verifies on a live dashboard, owners/SACCOs see fleet totals and forecasts, and owners can cash out sats to M-Pesa through Tando or bitcoin.co.ke.

Read this whole file before writing code. Work phase by phase. Do not start a phase until the previous phase's checkpoint passes.

---

## 0. Rules for Claude Code (read first, follow always)

1. **Never run `git commit` or `git push`.** Not once, for any reason.
2. At the end of every phase:
   - Make sure `.gitignore` covers `.env*`, `node_modules`, `.next`, `.vercel`.
   - Run `git add -A`, then `git status` and confirm no `.env*` file is staged. If one is, `git restore --staged <file>`.
   - Print a block like this for the human to run herself:
     ```
     git commit -m "<phase N: short conventional message>"
     git push origin main
     ```
3. Don't run commands that need secrets the human hasn't put in `.env.local`. Stop and list exactly which variables are missing.
4. Don't install packages beyond the list in §3 without saying why.
5. Server secrets (Supabase service role, LNbits keys, Daraja keys, Nostr secret) only ever live in server code (`app/api/**`, `lib/server/**`). Never import `lib/server/**` from a client component.
6. Prefer working code over complete code. If a phase is running long, ship the P0 part and move on. The cut list in §9 says what to drop.
7. TypeScript strict. No `any` on payment paths.

---

## 1. Scope for 8 hours

**P0 — the demo must show this end to end**
1. Passenger opens `/pay/KAB123B`, picks fare, enters phone, gets a real Daraja **sandbox** STK prompt.
2. Daraja callback marks the transaction fulfilled with the M-Pesa receipt.
3. Treasury settles: equivalent sats move from the treasury LNbits wallet to the vehicle's LNbits wallet.
4. Conductor dashboard `/dashboard/KAB123B` updates live (Supabase Realtime) and shows last 3 digits of phone + receipt; conductor taps "Verified".
5. SACCO view `/sacco/[saccoId]` groups Owner → Plate → Conductor with today's totals in KES and sats.

**P1 — build if time allows, in this order**
6. Analytics `/analytics/[saccoId]`: hourly forecast from seeded history + optional Claude-written summary.
7. Off-ramp: owner pastes a Tando/bitcoin.co.ke invoice or Lightning address, vehicle wallet pays it.
8. Nostr: publish a signed daily summary per vehicle (totals + hash of transaction list).

**Out of scope today:** USSD (Safaripap already has it), real login/auth, production Daraja, automated tests beyond smoke scripts.

---

## 2. Corrections to the original concept (build to these, not the old wording)

- **Custodial, not non-custodial.** Vehicle wallets on a hosted LNbits instance are custodial (the LNbits server holds the keys). Segregated per vehicle, yes. Non-custodial, no. Say "segregated per-vehicle wallets" in UI and pitch.
- **The on-ramp is a treasury swap.** M-Pesa KES doesn't turn into sats on its own. Flow: passenger pays KES via STK → on success, treasury wallet (pre-funded with sats) pays an invoice issued by the vehicle wallet for the KES-equivalent amount. The treasury is the market maker. In sandbox no real KES arrives, so the treasury float is the demo's real cost; keep fares small or use a tiny sats-per-KES rate on the demo.
- **Off-ramp is "pay out", not LNURL-withdraw.** LNURL-withdraw lets someone *pull* sats from a wallet. To cash out through Tando/bitcoin.co.ke, the vehicle wallet must *pay* their invoice or Lightning address. Neither service has a public API we're relying on, so the integration is: user copies a BOLT11 invoice or Lightning address from the service's app → we pay it.
- **Use Daraja's real `CheckoutRequestID`**, not a generated `STK-xxxx` string. The old route sample created a fake ID and never called Daraja.
- **Don't store full phone numbers.** STK needs the full number only at request time. Store a masked number and the last 3 digits. This also makes Realtime to the browser safe.
- **"AI" analytics = statistical forecast + optional LLM narration.** Hour-of-day × day-of-week averages over seeded history. Don't call it a trained model.
- **Lightning address per vehicle is optional.** It needs the LNURLp extension. Column is nullable.

---

## 3. Stack and packages

- Next.js 14 App Router, TypeScript, Tailwind CSS
- `@supabase/supabase-js`
- `nostr-tools` (P1)
- `qrcode.react` (QR on dashboard so passengers can scan to `/pay/[code]`)
- `zod` (validate API inputs)
- `@anthropic-ai/sdk` (P1, optional)
- `tsx` (dev dependency, for scripts)

No ORM, no auth library, no state library.

Package manager: `npm`.

---

## 4. Environment (`.env.local`, and `.env.example` with blanks committed)

```
# App
APP_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Daraja (sandbox)
DARAJA_BASE_URL=https://sandbox.safaricom.co.ke
DARAJA_CONSUMER_KEY=
DARAJA_CONSUMER_SECRET=
DARAJA_SHORTCODE=174379
DARAJA_PASSKEY=
DARAJA_CALLBACK_BASE_URL=        # public HTTPS base: Vercel URL or cloudflared tunnel
DARAJA_CALLBACK_TOKEN=           # random string, appended to callback URL and checked

# LNbits
LNBITS_URL=https://mildjerky8.lnbits.com
LNBITS_TREASURY_ADMIN_KEY=
LNBITS_TREASURY_INVOICE_KEY=

# Pricing
BTC_KES_FALLBACK=13000000        # KES per 1 BTC if live price fetch fails
DEMO_SATS_PER_KES=               # optional override to keep the treasury float small

# Nostr (P1)
NOSTR_SECRET_KEY_HEX=
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol

# Optional
ANTHROPIC_API_KEY=
DEMO_ADMIN_PIN=                  # guards /sacco, /analytics, off-ramp
```

---

## 5. Database (`supabase/migrations/0001_init.sql`)

Run in Supabase SQL editor. RLS on everywhere; the server uses the service role.

```sql
create extension if not exists pgcrypto;

create table saccos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table vehicle_owners (
  id uuid primary key default gen_random_uuid(),
  sacco_id uuid not null references saccos(id),
  owner_name text not null,
  phone_masked text,
  created_at timestamptz default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  sacco_id uuid not null references saccos(id),
  owner_id uuid references vehicle_owners(id),
  vehicle_code text unique not null,          -- e.g. KAB123B
  route_name text,
  conductor_name text,
  preset_fare_kes integer,
  lightning_address text,                     -- optional, needs LNURLp
  created_at timestamptz default now()
);

-- Secrets split out so no browser-facing policy can ever touch them
create table vehicle_wallets (
  vehicle_id uuid primary key references vehicles(id) on delete cascade,
  lnbits_wallet_id text not null,
  lnbits_invoice_key text not null,
  lnbits_admin_key text not null              -- needed for off-ramp payouts
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  amount_kes integer not null check (amount_kes > 0),
  payer_phone_masked text not null,           -- e.g. 2547****678
  phone_last3 text not null,
  daraja_checkout_id text unique,
  daraja_merchant_request_id text,
  mpesa_receipt text,
  receipt_last3 text generated always as (right(coalesce(mpesa_receipt, ''), 3)) stored,
  status text not null default 'processing'
    check (status in ('processing','fulfilled','settled','failed')),
  failure_reason text,
  amount_sats integer,
  btc_kes_rate numeric,
  ln_payment_hash text,
  verified_by_conductor boolean default false,
  verified_at timestamptz,
  source text not null default 'pwa' check (source in ('pwa','ussd','seed')),
  created_at timestamptz default now(),
  completed_at timestamptz,
  settled_at timestamptz
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  destination text not null,                  -- bolt11 or lightning address
  provider text,                              -- 'tando' | 'bitcoin.co.ke' | 'other'
  amount_sats integer not null,
  ln_payment_hash text,
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  error text,
  created_at timestamptz default now()
);

create table nostr_reports (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  report_date date not null,
  event_id text not null,
  content_hash text not null,
  created_at timestamptz default now(),
  unique (vehicle_id, report_date)
);

create index idx_tx_vehicle_created on transactions(vehicle_id, created_at desc);

alter table saccos enable row level security;
alter table vehicle_owners enable row level security;
alter table vehicles enable row level security;
alter table vehicle_wallets enable row level security;
alter table transactions enable row level security;
alter table payouts enable row level security;
alter table nostr_reports enable row level security;

-- Browser (anon) may read only non-secret, PII-masked data
create policy anon_read_vehicles on vehicles for select to anon using (true);
create policy anon_read_tx on transactions for select to anon using (true);
-- No anon policies on vehicle_wallets, payouts, owners: server only.

alter publication supabase_realtime add table transactions;
```

---

## 6. Folder layout

```
app/
  page.tsx                         landing: enter vehicle code, links to views
  pay/[vehicleCode]/page.tsx       passenger PWA
  pay/[vehicleCode]/status/[txId]/page.tsx   waiting → success/fail (Realtime)
  dashboard/[vehicleCode]/page.tsx conductor live view + QR
  sacco/[saccoId]/page.tsx         Owner → Plate → Conductor tree
  sacco/[saccoId]/payout/page.tsx  off-ramp (P1)
  analytics/[saccoId]/page.tsx     forecast (P1)
  api/
    pay/route.ts                   POST start STK
    hooks/payment-result/route.ts  POST Daraja callback (avoid "mpesa" in path)
    tx/[id]/route.ts               GET status (polling fallback)
    tx/[id]/query/route.ts         POST STK query fallback
    tx/[id]/verify/route.ts        POST conductor verify
    dev/simulate-callback/route.ts POST fake success (dev only)
    sacco/[saccoId]/summary/route.ts
    analytics/[saccoId]/route.ts   (P1)
    payout/route.ts                (P1)
    nostr/publish/route.ts         (P1)
lib/
  supabase-browser.ts              anon client
  server/supabase-admin.ts         service-role client
  server/daraja.ts                 token, stkPush, stkQuery, parseCallback
  server/lnbits.ts                 createInvoice, payInvoice, getBalance, decode, createWallet
  server/treasury.ts               settleTransaction(txId)
  server/pricing.ts                kesToSats()
  server/lnurl.ts                  resolveLightningAddress() (P1)
  server/nostr.ts                  publishDailyReport() (P1)
  server/forecast.ts               (P1)
  phone.ts                         normalize + mask
scripts/
  seed.ts                          sacco, owners, vehicles, wallets, 30 days history
  smoke.ts                         hits /api/pay + simulate-callback, checks settlement
supabase/migrations/0001_init.sql
.env.example
README.md
```

---

## 7. Phases (8 hours)

Times are targets. Checkpoints are hard gates.

### Phase 1 — Scaffold + database (0:00–0:45)

- `npx create-next-app@14 nauli-sacco --ts --tailwind --app --eslint --src-dir=false --import-alias "@/*"` (or scaffold in the current folder if it already exists).
- Install packages from §3. Create `.env.example`, `.gitignore`, the migration file, `lib/supabase-browser.ts`, `lib/server/supabase-admin.ts`, `lib/phone.ts`.
- `lib/phone.ts`:
  - `normalizeKePhone(input)` accepts `07xxxxxxxx`, `01xxxxxxxx`, `+2547…`, `2547…`, `2541…` → returns `2547xxxxxxxx` / `2541xxxxxxxx` or throws.
  - `maskPhone("254712345678")` → `2547****678`.
- `scripts/seed.ts`:
  - 1 SACCO ("Nauli Sacco Demo"), 2 owners, 3 vehicles (`KAB123B`, `KCD456C`, `KDE789D`) with conductor names and preset fares (e.g. 50, 80, 100).
  - Wallet per vehicle: try `POST {LNBITS_URL}/api/v1/wallet` with header `X-Api-Key: LNBITS_TREASURY_ADMIN_KEY` and body `{"name":"Nauli KAB123B"}`; store `id`, `inkey`, `adminkey` in `vehicle_wallets`. If the endpoint fails on this LNbits version, print instructions to create wallets in the LNbits UI and read keys from `SEED_WALLETS_JSON` env instead.
  - 30 days of history per vehicle with `source='seed'`, status `settled`, realistic shape: peaks 6–9am and 5–8pm weekdays, quieter weekends, Friday evening bump.
  - Idempotent: skip existing `vehicle_code`s.
- Human runs migration in Supabase SQL editor, then `npx tsx scripts/seed.ts`.

**Checkpoint 1:** `npm run dev` boots; seed output shows 3 vehicles with wallet IDs; transactions table has seeded rows.
→ `git add -A`, print commit/push commands.

### Phase 2 — Daraja STK Push (0:45–2:15)

`lib/server/daraja.ts`:
- `getToken()`: `GET {DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, Basic auth `base64(key:secret)`. Cache in memory until ~50 min.
- `stkPush({ phone, amount, accountRef, desc })`:
  - `Timestamp` = `YYYYMMDDHHmmss` in **Africa/Nairobi** time.
  - `Password` = `base64(SHORTCODE + PASSKEY + Timestamp)`.
  - POST `/mpesa/stkpush/v1/processrequest` with `BusinessShortCode`, `Password`, `Timestamp`, `TransactionType: "CustomerPayBillOnline"`, `Amount` (integer), `PartyA: phone`, `PartyB: SHORTCODE`, `PhoneNumber: phone`, `CallBackURL: ${DARAJA_CALLBACK_BASE_URL}/api/hooks/payment-result?token=${DARAJA_CALLBACK_TOKEN}`, `AccountReference` (vehicle code, ≤12 chars), `TransactionDesc` (≤13 chars, e.g. "Nauli fare").
  - Return `CheckoutRequestID`, `MerchantRequestID`. Throw with Daraja's `errorMessage` on non-zero `ResponseCode`.
- `stkQuery(checkoutRequestId)`: POST `/mpesa/stkpushquery/v1/query`.
- `parseCallback(body)`: read `Body.stkCallback`; on `ResultCode === 0` pull `MpesaReceiptNumber`, `Amount`, `PhoneNumber` from `CallbackMetadata.Item[]` by `Name`.

`app/api/pay/route.ts` (POST, zod body `{ vehicleCode, amountKes, phone }`):
1. Look up vehicle (404 if unknown). Validate `1 ≤ amountKes ≤ 5000`.
2. Normalize phone.
3. Call `stkPush`. On error → 502 with message, no DB row.
4. Insert transaction: masked phone, `phone_last3`, real `CheckoutRequestID`, `MerchantRequestID`, status `processing`, source `pwa`.
5. Return `{ txId, checkoutRequestId }`. Never return wallet keys or full phone.

`app/api/hooks/payment-result/route.ts`:
- Reject if `token` query param ≠ `DARAJA_CALLBACK_TOKEN` (return 200 anyway with `{ResultCode:0}` so Daraja doesn't retry, but do nothing).
- Find tx by `CheckoutRequestID`. If `ResultCode !== 0` → `failed` with `ResultDesc`.
- If success → set `status='fulfilled'`, `mpesa_receipt`, `completed_at`, **only where status = 'processing'** (idempotent; Daraja can call twice).
- Then call `settleTransaction(txId)` (Phase 3). Don't let settlement errors change the HTTP response.
- Always respond `{ "ResultCode": 0, "ResultDesc": "Accepted" }`.

`app/api/tx/[id]/query/route.ts`: runs `stkQuery`, applies the same state transition. Used when the sandbox callback never arrives (it often doesn't).

`app/api/dev/simulate-callback/route.ts`: only when `NODE_ENV !== 'production'` or `DEMO_ADMIN_PIN` matches. Builds a fake success callback (receipt like `SIM` + 7 random uppercase chars) for a given `txId` and runs the same handler logic. This is the demo safety net.

Public HTTPS for callbacks during dev: human runs `cloudflared tunnel --url http://localhost:3000` and sets `DARAJA_CALLBACK_BASE_URL` to the printed URL, or deploys to Vercel early.

**Checkpoint 2:** a real STK prompt reaches the sandbox test phone (or Daraja returns `ResponseCode: "0"`); simulate-callback moves a row to `fulfilled`.
→ `git add -A`, print commit/push commands.

### Phase 3 — Treasury settlement (2:15–3:15)

`lib/server/pricing.ts`:
- `getBtcKes()`: fetch `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=kes` with 3s timeout, cache 60s, fall back to `BTC_KES_FALLBACK`.
- `kesToSats(kes)`: if `DEMO_SATS_PER_KES` set, use it; else `Math.max(1, Math.round(kes / btcKes * 1e8))`. Return `{ sats, rate }`.

`lib/server/lnbits.ts` (all with `X-Api-Key` header, JSON):
- `createInvoice(invoiceKey, sats, memo)` → `POST /api/v1/payments` `{ out:false, amount:sats, memo }` → `{ payment_hash, payment_request }` (newer LNbits may name it `bolt11`; handle both).
- `payInvoice(adminKey, bolt11)` → `POST /api/v1/payments` `{ out:true, bolt11 }`.
- `getBalance(key)` → `GET /api/v1/wallet` → `balance` is **msats**; divide by 1000.
- `decodeInvoice(key, bolt11)` → `POST /api/v1/payments/decode` `{ data: bolt11 }`.

`lib/server/treasury.ts` → `settleTransaction(txId)`:
1. Load tx + vehicle wallet. Only proceed if `status = 'fulfilled'` and `ln_payment_hash is null`.
2. `kesToSats(amount_kes)`.
3. Check treasury balance ≥ sats; if not, leave as `fulfilled`, set `failure_reason='treasury_low'`, return. (KES was still received; settlement can be retried.)
4. Create invoice on the vehicle wallet (memo `Nauli KAB123B fare <receipt>`), pay it from the treasury admin key.
5. Update tx: `status='settled'`, `amount_sats`, `btc_kes_rate`, `ln_payment_hash`, `settled_at`.
6. Add `POST /api/tx/[id]/settle` (PIN-guarded) for manual retry.

**Checkpoint 3:** `npx tsx scripts/smoke.ts KAB123B 50 0708374149` → creates tx via `/api/pay`, simulates callback, then confirms the tx is `settled` and the vehicle wallet balance went up.
→ `git add -A`, print commit/push commands.

### Phase 4 — Passenger PWA (3:15–4:30)

`/pay/[vehicleCode]`:
- Server component loads vehicle (plate, route, conductor first name, preset fare). Unknown code → friendly not-found with a code-entry box.
- Big-text, one-column, mobile-first, high contrast. Fare buttons: preset + 2 neighbours (e.g. 50 / 70 / 100) + "Other amount". Phone input with `inputmode="tel"`, remembered in `localStorage` (passenger's own device, fine).
- Submit → `/api/pay` → redirect to `/pay/[code]/status/[txId]`.
- Plain-language copy, English with short Swahili line under key labels ("Lipa nauli", "Angalia simu yako"). Low data: no images except the logo SVG, no web fonts.

`/pay/[code]/status/[txId]`:
- Subscribe to Realtime `UPDATE` on `transactions` filtered `id=eq.<txId>`; also poll `/api/tx/[id]` every 4s as fallback; after 45s show "Check again" → calls `/api/tx/[id]/query`.
- States: waiting ("Enter your M-Pesa PIN on your phone") → success (big tick, amount, last 3 receipt chars, "Show the conductor these 3 characters") → failed (reason + retry).
- Minimal `manifest.json` + icons so it installs as a PWA. No service worker needed today.

**Checkpoint 4:** on a phone over the tunnel/Vercel URL, full flow from fare tap to success screen.
→ `git add -A`, print commit/push commands.

### Phase 5 — Conductor dashboard (4:30–5:30)

`/dashboard/[vehicleCode]`:
- Header: plate, conductor, today's total KES, today's sats, wallet balance (from a server route, not the browser).
- Live list of today's transactions, newest first: time, KES, `***` + `phone_last3`, receipt last 3, status badge, "Verified" button.
- Realtime: subscribe to `INSERT` and `UPDATE` on `transactions` filtered `vehicle_id=eq.<id>`. New fulfilled payments flash and play a short beep (Web Audio, no file).
- Quick-check box: conductor types 3 characters → matching row highlights (phone last3 or receipt last3).
- "Verified" → `POST /api/tx/[id]/verify` sets `verified_by_conductor`, `verified_at`.
- QR code (`qrcode.react`) linking to `${APP_URL}/pay/${vehicleCode}`, toggle to full screen for passengers to scan.
- Hide seeded rows from the live list (`source <> 'seed'`) so the demo list is clean.

**Checkpoint 5:** two browser windows, passenger pays in one, row appears in the dashboard in under ~2s.
→ `git add -A`, print commit/push commands.

### Phase 6 — SACCO view (5:30–6:15)

`/api/sacco/[saccoId]/summary` (server, service role) returns:
```
owners[] → { ownerName, vehicles[] → { vehicleCode, conductorName,
  todayKes, todaySats, todayCount, verifiedPct, walletSats, lastPaymentAt } }
totals { todayKes, todaySats, todayCount, walletSats }
```
`/sacco/[saccoId]`:
- Totals strip on top. Owner cards, each with a plate table (sorted by today's KES desc). Click a plate → its conductor dashboard.
- Date picker: today / yesterday / last 7 days.
- Guard with `DEMO_ADMIN_PIN` (simple PIN prompt stored in a cookie). Not real auth; say so in README.

**Checkpoint 6:** totals match a manual SQL sum for today.
→ `git add -A`, print commit/push commands.

### Phase 7 — P1 features (6:15–7:15). Do 7a first; stop at 7:15 whatever state 7b/7c are in.

**7a. Analytics `/analytics/[saccoId]` (~25 min)**
- `lib/server/forecast.ts`: from the last 28 days of `settled`/`fulfilled` rows, compute per vehicle a 7×24 matrix (weekday × hour) of mean KES and mean count. Tomorrow's projection = that weekday's row. Peak hours = top 3 hours by mean KES. Suggested shift = the contiguous 8-hour window with highest projected KES.
- Charts in plain SVG or Tailwind bars (no chart library): projected hourly KES for tomorrow, actual vs projected for today so far.
- If `ANTHROPIC_API_KEY` is set, `POST` the numeric summary (not raw rows, no phone data) to Claude for a 3–4 sentence plain-English briefing; label it "AI summary". If not set, hide the box.

**7b. Off-ramp `/sacco/[saccoId]/payout` (~20 min)**
- Pick vehicle, show wallet balance. Input: BOLT11 invoice **or** Lightning address, plus provider dropdown (Tando / bitcoin.co.ke / Other).
- BOLT11: decode, show amount, confirm, pay with that vehicle's admin key.
- Lightning address `user@domain` (`lib/server/lnurl.ts`): `GET https://domain/.well-known/lnurlp/user` → check `minSendable`/`maxSendable` (msats) → `GET {callback}?amount=<msats>` → pay returned `pr`. Amount input in sats for this case.
- Record in `payouts`. PIN-guarded. Show the instruction line: "Open Tando or bitcoin.co.ke, create a Lightning invoice to your M-Pesa number, paste it here."

**7c. Nostr daily report (~15 min)**
- `lib/server/nostr.ts` with `nostr-tools`: for a vehicle + date, build sorted list of `[txId, amount_kes, mpesa_receipt_last3, status]`, `content_hash = sha256(JSON)`. Content: `Nauli Sacco | KAB123B | 2026-10-03 | 42 fares | KES 3,150 | 61,230 sats | hash <hex>`. Tags: `["t","naulisacco"]`, `["d","KAB123B:2026-10-03"]`, `["sacco", saccoName]`.
- Kind 30078 (replaceable app data) so re-publishing the same day replaces it. `finalizeEvent` with `NOSTR_SECRET_KEY_HEX`, publish to `NOSTR_RELAYS` via `SimplePool`, store event id in `nostr_reports`.
- Button on the SACCO view: "Publish today's report to Nostr", shows event id + link to `https://njump.me/<nevent>`.

→ `git add -A`, print commit/push commands.

### Phase 8 — Deploy, harden, rehearse (7:15–8:00)

- Deploy to Vercel; human sets env vars there and points `DARAJA_CALLBACK_BASE_URL` at the Vercel URL.
- Landing page `/`: one-paragraph pitch, vehicle code box, links to demo dashboard / SACCO / analytics.
- Error states everywhere on the payment path (Daraja down, LNbits down, unknown vehicle, treasury low).
- README: what it does, architecture diagram (text), setup steps, env table, known limits (sandbox Daraja, custodial LNbits, PIN not auth, simulated callbacks available in demo).
- Run `scripts/smoke.ts` against the deployed URL.
- Write `DEMO.md`: the 3-minute script below.

→ `git add -A`, print final commit/push commands.

---

## 8. Demo script (3 minutes)

1. Problem (20s): fake M-Pesa SMS, conductors handling passengers' phones, owners can't see per-vehicle income.
2. Passenger (45s): scan QR on conductor screen → tap KES 50 → STK prompt → success screen with 3-char code.
3. Conductor (30s): row appears live, types the 3 chars, taps Verified. Show sats landed in the vehicle wallet.
4. Owner/SACCO (40s): Owner → Plate → Conductor totals; tomorrow's forecast and suggested shift.
5. Trust + cash-out (30s): Nostr report event on njump; paste a Tando invoice and pay out.
6. Close (15s): what's next (production Daraja till, USSD from Safaripap, real auth).

If the sandbox callback stalls on stage: use "Check again" (STK query), then the simulate button as last resort.

---

## 9. Cut list (drop from the bottom up when behind)

1. Nostr report (7c)
2. Off-ramp Lightning-address path (keep BOLT11 only)
3. Off-ramp entirely
4. Claude summary on analytics
5. Analytics page entirely
6. Date picker on SACCO view
7. PWA manifest

Never cut: STK push, callback/query/simulate, treasury settlement, conductor Realtime dashboard, SACCO totals.

---

## 10. Known gotchas

- Daraja sandbox callbacks are unreliable; always keep STK query + simulate available.
- Callback URLs containing words like "mpesa" or "safaricom" have been rejected by Daraja; keep `/api/hooks/payment-result`.
- Daraja `Timestamp` must be Nairobi time, not UTC.
- `Amount` must be an integer; `AccountReference` ≤ 12 chars.
- LNbits balances are in msats; invoice amounts are in sats.
- Supabase Realtime only delivers rows the anon role can `select` under RLS (handled by the policies in §5).
- Realtime filters take one condition; filter by `vehicle_id` or `id`, then filter further in the client.
- Don't use the service-role key in any `"use client"` file.
