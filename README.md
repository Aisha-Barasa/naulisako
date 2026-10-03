<div align="center">

# Nauli SaKo

### Matatu fare payments, settled in Bitcoin Lightning

Pay with ordinary M-Pesa. Fares settle into the vehicle's own segregated Lightning wallet, conductors verify on a live dashboard, and owners see fleet-wide totals and forecasts.

**Live demo:** [nauli-sako.vercel.app](https://nauli-sako.vercel.app)

<br />

![GirlCode](https://img.shields.io/badge/GirlCode-grey?style=for-the-badge)
![Demo Day](https://img.shields.io/badge/Demo_Day-October_4,_2026-b45309?style=for-the-badge)
![Payments](https://img.shields.io/badge/Daraja-Sandbox-15803d?style=for-the-badge)

![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ecf8e?style=flat-square&logo=supabase&logoColor=white)
![Lightning](https://img.shields.io/badge/Lightning-LNbits-f7931a?style=flat-square&logo=bitcoin&logoColor=white)
![Nostr](https://img.shields.io/badge/Nostr-Daily_Reports-8b5cf6?style=flat-square)

<br />

[The Problem](#the-problem) &nbsp;|&nbsp; [The Solution](#the-solution) &nbsp;|&nbsp; [Why Lightning and Why Bitcoin](#why-lightning-and-why-bitcoin) &nbsp;|&nbsp; [How It Works](#how-it-works) &nbsp;|&nbsp; [Screenshots](#screenshots) &nbsp;|&nbsp; [Security](#security-model) &nbsp;|&nbsp; [Setup](#local-setup) &nbsp;|&nbsp; [Status](#project-status)

</div>

<br />

---

## At a Glance

| | |
| :-- | :-- |
| **Passenger** | Scans the QR sticker inside the matatu (or types the code printed under it) and pays with M-Pesa from their own phone — no app, no new wallet |
| **Conductor** | Watches fares land on a live dashboard and verifies against a 3-character code, with no need to inspect anyone's phone |
| **Owner or SACCO** | Sees fares arrive in each vehicle's own segregated Lightning wallet, with fleet totals grouped Owner → Plate → Conductor, and can cash out sats to M-Pesa through a third-party provider |
| **Transparency** | A signed daily summary — total fares, total sats, and a hash of the day's transaction list — is published to Nostr per vehicle |
| **Accessibility** | Results are read aloud and confirmed by vibration, large tap targets throughout, larger-text and high-contrast modes, and screen-reader announcements for payments |

---

## The Problem

Paying a matatu fare by M-Pesa today usually means handing your phone, or at least its screen, to a stranger. The passenger sends the money, then shows the confirmation to the conductor, who checks it by eye against the fare.

| Issue | What happens |
| :-- | :-- |
| **Exposure** | The conductor sees the passenger's phone, and with it their balance, transaction history and contacts. Passengers seen carrying money or a valuable phone become easier targets for theft and social engineering, on the vehicle and after they get off. |
| **Friction** | Every payment needs manual confirmation, one passenger at a time, while the vehicle is loading or moving. This slows boarding and leads to queues, disputes and missed fares. |
| **Trust** | A message on a screen is easy to fake, and the conductor has no independent way to confirm that money actually arrived. Owners and SACCOs have no reliable per-vehicle record of what each matatu earned, let alone a forecast of what to expect tomorrow. |

---

## The Solution

Nauli SaKo removes the phone-showing step. The passenger pays from their own phone — scanning a QR code on the vehicle, entering the fare, and confirming a real M-Pesa STK prompt. The fare then appears on the conductor's live dashboard, driven by a verified payment callback rather than a screen shown by the passenger.

Under the hood, each matatu holds its own segregated Lightning wallet. When a fare is confirmed, a treasury wallet — pre-funded with sats — pays that vehicle's wallet the KES-equivalent amount, so the vehicle's balance grows in sats immediately. A signed daily summary per vehicle is published to Nostr, and owners can see fleet-wide totals grouped by owner, then plate, then conductor, with a simple next-day forecast.

---

## Why Lightning and Why Bitcoin

Nauli SaKo is not a payments app with Bitcoin attached. The design depends on properties ordinary payment rails don't give a matatu fleet — while being honest about what kind of custody is actually in play.

| Property | What it means for a matatu |
| :-- | :-- |
| **Segregated per-vehicle wallets** | Every matatu has its own Lightning wallet, hosted on our LNbits instance. Fares settle directly into it, with no shared till or paybill account between vehicles. These wallets are **custodial** — LNbits holds the keys — but each vehicle's funds are kept apart from every other vehicle's, which is the property that actually matters for a SACCO with many owners sharing one platform. |
| **Built for small, fast payments** | Lightning settles low-value payments in seconds, which suits fares of a few tens of shillings — far below what a typical on-chain Bitcoin transaction could sensibly handle. |
| **Open and borderless** | Bitcoin and Lightning are open protocols. A SACCO's balance isn't locked inside one company's proprietary ledger. |
| **Public, checkable record** | A signed daily summary per vehicle — total fares, total sats, and a hash of that day's transaction list — is published to Nostr, an open protocol with many independent relays. Anyone with the event data can verify it without asking Nauli SaKo's permission. |
| **Familiar for the passenger** | The passenger still pays with M-Pesa. There is no new wallet, no seed phrase and no learning curve. Bitcoin is the settlement layer underneath, not something they ever have to think about. |

---

## Who It Serves

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>Passengers</h4>
      Pay a fare without handing over their phone, so balances and contacts stay private. Scan the QR code on the vehicle, pick a fare, confirm on their own M-Pesa STK prompt.
    </td>
    <td width="33%" valign="top">
      <h4>Conductors</h4>
      See each fare arrive on a live dashboard scoped to their vehicle, without inspecting passengers' phones. A quick-check box matches a 3-character code the passenger is shown against the live list, and tapping the row marks it verified. Payment alerts (chime, vibration, a notification when the screen is off), and a <em>Prompt passenger</em> screen to send the M-Pesa prompt to a passenger who can't scan.
    </td>
    <td width="33%" valign="top">
      <h4>SACCOs and Owners</h4>
      See fares grouped Owner → Plate → Conductor, with today's totals in KES and sats per vehicle. A Forecast tab projects tomorrow's likely hourly earnings from recent history, and owners can cash out a vehicle's sats to M-Pesa by paying a Lightning invoice from a provider like Tando or bitcoin.co.ke.
    </td>
  </tr>
</table>

---

## How It Works

```mermaid
flowchart TD
    P[Passenger: scans QR, picks fare] -->|vehicle code, amount, phone| API[/api/pay/]
    API -->|STK push| D[Daraja sandbox]
    D -->|M-Pesa prompt| M[Passenger's phone]
    D -->|callback with CheckoutRequestID| CB[/api/hooks/payment-result/]
    CB -->|mark fulfilled| DB[(Supabase)]
    DB --> T[Treasury wallet]
    T -->|pays invoice for KES-equivalent sats| V[Vehicle's own LNbits wallet]
    DB -->|Realtime| CD[Conductor dashboard]
    DB -->|daily summary + hash| N[Nostr relays]
```

| Step | Stage | Description |
| :-: | :-- | :-- |
| 1 | **Initiate** | The passenger scans a QR code on the vehicle, opening `/pay/<vehicleCode>`. |
| 2 | **Pay** | They pick a fare and enter their M-Pesa number. The app calls Daraja's sandbox STK push endpoint and stores the real `CheckoutRequestID` Daraja returns — never a locally generated placeholder. |
| 3 | **Confirm** | Daraja sends a signed callback once the passenger enters their M-Pesa PIN. The server verifies it and marks the transaction fulfilled, recording only a masked phone number and its last 3 digits. |
| 4 | **Settle** | A treasury wallet, pre-funded with sats, pays an invoice issued by the vehicle's own LNbits wallet for the KES-equivalent amount. The treasury is the market maker standing between M-Pesa shillings and Lightning sats — it is not a direct KES-to-BTC conversion. |
| 5 | **Verify** | `/dashboard/<vehicleCode>` updates live through Supabase Realtime. The conductor matches the passenger's 3-character code against the new row and taps "Verified." |
| 6 | **Report** | Once a day, a signed summary per vehicle — total fares, total sats, and a hash of the transaction list — publishes to Nostr relays. |
| 7 | **Review and cash out** | `/sacco/<saccoId>` shows fares grouped Owner → Plate → Conductor, with Takings, Forecast and Cash out tabs. An owner can cash out a vehicle's sats by pasting a Lightning invoice or address from a provider like Tando or bitcoin.co.ke, which the vehicle's wallet pays directly. |

---

## Screenshots

<img width="389" height="585" alt="image" src="https://github.com/user-attachments/assets/bdb33c0e-d747-4547-9099-87b6c430c4b4" />
<img width="411" height="593" alt="image" src="https://github.com/user-attachments/assets/891f137b-c45c-4026-ad06-1b5ea3b80813" />
<img width="437" height="594" alt="image" src="https://github.com/user-attachments/assets/4ce2312c-f756-4a17-87b1-78518b773d0f" />
<img width="752" height="522" alt="image" src="https://github.com/user-attachments/assets/8a936dcb-dad4-490a-9c6f-63089e5a256b" />

---

## Security Model

| Concern | How it is handled |
| :-- | :-- |
| **M-Pesa PIN** | Entered only on Safaricom's own STK prompt on the passenger's phone. Nauli SaKo never displays a PIN field and never receives or stores a PIN. |
| **Payment authenticity** | The server tracks Daraja's real `CheckoutRequestID` for every request and only updates a transaction that is still `processing`, so a repeated or late callback can't double-apply. A manual STK-query fallback exists for when the sandbox callback doesn't arrive. |
| **Passenger privacy** | Only a masked phone number and its last 3 digits are stored — never the full number — which is what makes it safe to stream transaction rows to the browser over Supabase Realtime in the first place. |
| **Conductor and owner access** | There is no full account system yet. The SACCO view (Takings, Forecast and Cash out) and the Nostr publish action are guarded by a single shared PIN (`DEMO_ADMIN_PIN`) stored in a cookie. **This is a lightweight gate for a demo, not real authentication**, and the README says so plainly rather than overstating it. |
| **Demo data** | Seeded transactions used to populate dashboards and forecasts are tagged `source = 'seed'` and excluded from the live conductor list, so the real-time demo stays clean. |
| **Privileged keys** | The Supabase service role key, Daraja credentials, and LNbits admin keys exist only in server code (`app/api/**`, `lib/server/**`) and are never imported into a client component. The browser only ever uses the Supabase anon key, scoped by Row Level Security. |
| **Funds custody** | Each vehicle has its own LNbits wallet, so one vehicle's funds are never pooled with another's — but the wallets are custodial, held on a hosted LNbits instance, not self-custodied by the owner. This is stated as "segregated per-vehicle wallets," not "non-custodial," everywhere in this project. |
| **Off-ramp** | Cashing out is a payout, not a withdrawal link: the vehicle's wallet pays a BOLT11 invoice or Lightning address the owner supplies from their own provider (e.g. Tando, bitcoin.co.ke). Nauli SaKo does not integrate with either provider's API and never pulls funds on its own. |
| **Input handling** | Phone numbers are normalized server-side (`07`, `01`, and `254` formats are all accepted) before reaching Daraja. |

> [!WARNING]
> Never commit `.env*` files. They're listed in `.gitignore`; verify this before every push.

---

## Technology

| Layer | Technology | Purpose |
| :-- | :-- | :-- |
| Application | Next.js 14 (App Router), TypeScript, Tailwind | Passenger PWA, conductor dashboard, SACCO view, API routes |
| Data | Supabase (Postgres and Realtime) | SACCOs, owners, vehicles, transactions, payouts, live dashboard feed |
| Payments | Safaricom Daraja (sandbox) | M-Pesa STK push, collection, and status callbacks |
| Custody | LNbits | A treasury wallet plus one segregated, custodial wallet per vehicle |
| Forecasting | Statistical model (weekday × hour averages), optional Claude narration | Next-day earnings projection per vehicle — not a trained model |
| Transparency | Nostr | Signed daily summary event per vehicle, with a hash of that day's transactions |
| Off-ramp | Manual payout to Tando / bitcoin.co.ke | Owner-supplied BOLT11 invoice or Lightning address, paid directly from the vehicle's wallet |

<details>
<summary><strong>Repository structure</strong></summary>

<br />

```
app/
  page.tsx                              Landing: enter vehicle code, links to views
  pay/[vehicleCode]/page.tsx            Passenger PWA
  pay/[vehicleCode]/status/[txId]/page.tsx   Waiting → success/fail (Realtime)
  dashboard/[vehicleCode]/page.tsx      Conductor live view + QR
  sacco/[saccoId]/page.tsx              Owner → Plate → Conductor totals
  sacco/[saccoId]/forecast/page.tsx     Next-day forecast per vehicle (SACCO tab), optional AI summary
  sacco/[saccoId]/payout/page.tsx       Off-ramp: pay a BOLT11 invoice or Lightning address
  analytics/[saccoId]/page.tsx          Redirects to the forecast tab
  api/
    pay/route.ts                        Passenger payment initiation (real Daraja STK push)
    hooks/payment-result/route.ts       Daraja status callback
    tx/[id]/route.ts                    Status polling for the PWA
    tx/[id]/query/route.ts              STK query fallback, for stalled sandbox callbacks
    tx/[id]/verify/route.ts             Conductor verification
    dev/simulate-callback/route.ts      Dev-only fallback for a stalled sandbox callback
    sacco/[saccoId]/summary/route.ts    Owner → Plate → Conductor totals
    analytics/[saccoId]/route.ts        Forecast data
    payout/route.ts                     Off-ramp payment
    nostr/publish/route.ts              Daily summary publish
lib/
  supabase-browser.ts                   Anon client
  server/supabase-admin.ts              Service-role client
  server/daraja.ts                      Token, STK push, STK query, callback parsing
  server/lnbits.ts                      Invoices, payments, balances, decoding
  server/treasury.ts                    settleTransaction(txId) — the treasury swap
  server/pricing.ts                     KES-to-sats conversion, with a fallback rate
  server/lnurl.ts                       Resolves a Lightning address for payout
  server/nostr.ts                       Builds and publishes the daily summary event
  server/forecast.ts                    Weekday × hour averages, peak hours, suggested shift
  server/briefing.ts                    Optional Claude-written forecast summary (aggregates only)
  feedback.ts                           Read-aloud, vibration, chime and notifications
  preferences.ts                        Per-device accessibility settings
  phone.ts                              Kenyan phone normalization and masking
scripts/
  seed.ts                               Sacco, owners, vehicles, wallets, 30 days of history
  smoke.ts                              End-to-end check: pay → callback → settle
  sweep.ts                              Moves demo sats from vehicle wallets back to the treasury
supabase/
  migrations/0001_init.sql              Full database schema
.env.example
README.md
```

</details>

---

## Environment Variables

| Variable | Used by | Notes |
| :-- | :-- | :-- |
| `APP_URL` | Server | The app's public base URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Client and server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Full-access key. Never expose to the browser |
| `DARAJA_BASE_URL` | Server only | `https://sandbox.safaricom.co.ke` during development |
| `DARAJA_CONSUMER_KEY` / `DARAJA_CONSUMER_SECRET` | Server only | Issued from the Daraja developer portal |
| `DARAJA_SHORTCODE` / `DARAJA_PASSKEY` | Server only | Sandbox test shortcode and passkey |
| `DARAJA_CALLBACK_BASE_URL` | Server only | Public HTTPS base (tunnel or deployed URL) that Daraja can reach |
| `DARAJA_CALLBACK_TOKEN` | Server only | Random string appended to and checked on the callback URL |
| `LNBITS_URL` | Server only | The LNbits instance hosting the treasury and vehicle wallets |
| `LNBITS_TREASURY_ADMIN_KEY` / `LNBITS_TREASURY_INVOICE_KEY` | Server only | Treasury wallet keys used to fund vehicle wallets |
| `LNBITS_ACCESS_TOKEN` (or `LNBITS_USER_ID`) | Seed script only | Account-level token that lets `scripts/seed.ts` create vehicle wallets (LNbits 1.x refuses a wallet admin key for this). Not needed on the server |
| `SEED_WALLETS_JSON` | Seed script only | Fallback: wallet IDs and keys for wallets created by hand in LNbits |
| `BTC_KES_FALLBACK` | Server | KES-per-BTC rate used if a live price fetch fails |
| `DEMO_SATS_PER_KES` | Server | Optional override to keep the treasury float small during a demo |
| `NOSTR_SECRET_KEY_HEX` | Server only | Signs the daily summary events |
| `NOSTR_RELAYS` | Server | Comma-separated relay list |
| `ANTHROPIC_API_KEY` | Server, optional | Adds a short plain-English narration to the numeric forecast |
| `DEMO_ADMIN_PIN` | Server | Guards the SACCO view (Takings, Forecast, Cash out) and Nostr publishing — a demo gate, not real authentication |

---

## Local Setup

**1. Install dependencies**

```bash
npm install
```

**2. Configure the environment.** Copy `.env.example` to `.env.local` (or `.env`) and fill in the variables above.

**3. Apply the database schema.** Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor, then enable Realtime on the `transactions` table under Database, Replication.

**4. Set up LNbits.** On your LNbits instance, create the treasury wallet and fund it with a few thousand sats. For the seed script to create vehicle wallets, create an access control list that may write to wallets, generate a token for it, and set `LNBITS_ACCESS_TOKEN`. Keep the instance running for the whole demo: while it's off, fares still go through M-Pesa but can't settle to sats until retried.

**5. Seed demo data.**

```bash
npx tsx scripts/seed.ts
```

This creates a demo SACCO, owners, and vehicles, and backfills 30 days of realistic fare history for the analytics forecast.

**6. Start the app and expose it.** Run these in separate terminals.

```bash
npm run dev
ngrok http 3000        # or: cloudflared tunnel --url http://localhost:3000
```

If your network has broken IPv6 (Node errors like `fetch failed` / `ETIMEDOUT`), start the dev server with `NODE_OPTIONS="--dns-result-order=ipv4first --network-family-autoselection-attempt-timeout=3000" npm run dev`.

**7. Point the Daraja callback at your tunnel.** Set `DARAJA_CALLBACK_BASE_URL` to the tunnel's HTTPS address. The app sends `<base>/api/hooks/payment-result?token=<DARAJA_CALLBACK_TOKEN>` with every STK push, so nothing needs registering in the Daraja portal. On Vercel, use the Vercel URL instead.

**8. Run the smoke test.**

```bash
npx tsx scripts/smoke.ts KAB123B 50 0708374149
```

This pays a fare through `/api/pay`, simulates the callback, and confirms the transaction reaches `settled` with the vehicle wallet balance increased. Use `SMOKE_BASE_URL=https://nauli-sako.vercel.app` to run it against the deployed app, and `npx tsx scripts/sweep.ts` afterwards to move the test sats back to the treasury.

---

## Project Status

Status as of demo day (October 4, 2026). "Working" means exercised end to end against the real Supabase, LNbits and Daraja sandbox.

| Priority | Feature | Status |
| :-- | :-- | :-- |
| P0 | Passenger payment via real Daraja sandbox STK push | Working, including a real prompt to a phone |
| P0 | Daraja callback handling, with STK-query and simulate fallbacks | Working. The status page asks M-Pesa itself after 30 s because sandbox callbacks often don't arrive |
| P0 | Treasury settlement into the vehicle's own LNbits wallet | Working, with protection against paying twice. The treasury float is the demo's real cost |
| P0 | Live conductor dashboard via Supabase Realtime, with 3-character verification | Working (about 2 s from callback to screen), plus alerts and Prompt passenger |
| P0 | Sacco view: Owner → Plate → Conductor totals | Working; totals checked against database counts |
| P1 | Next-day forecast, with optional Claude narration | Forecast working; the AI summary needs `ANTHROPIC_API_KEY` |
| P1 | Off-ramp payout to Tando / bitcoin.co.ke via BOLT11 invoice or Lightning address | Working with test invoices; a real Tando payout not yet tried |
| P1 | Nostr daily summary per vehicle | Working; published and read back from relay.damus.io and nos.lol |
| Out of scope | USSD for feature phones, full login/auth, production Daraja | Deliberately deferred — see the build notes for reasoning |

> [!NOTE]
> `DEMO_ADMIN_PIN` guards a few screens for the demo. It is not an authentication system, and this README won't describe it as one.

---

## License

Nauli SaKo is open source under the [MIT License](LICENSE).

---

<div align="center">

Built for GirlCode.

</div>
