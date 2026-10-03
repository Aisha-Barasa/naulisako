# Nauli SaKo — 3-minute demo

Live app: **https://nauli-sako.vercel.app**

| Screen | Address | Who holds it |
| :-- | :-- | :-- |
| Passenger | `/pay/KAB123B` (scan the QR) | Phone A (presenter's own Safaricom number) |
| Conductor | `/dashboard/KAB123B` | Phone B or laptop, alerts on |
| SACCO | `/sacco/c79705ee-573a-4d80-8836-f8fa00c2cf0b` | Laptop, PIN already entered |

## 30 minutes before

1. **LNbits instance is running** (lnbits.com dashboard). If it's off, fares go through M-Pesa but don't turn into sats.
2. **Treasury has sats:** at least 1,000. Return test sats first: `npx tsx scripts/sweep.ts`.
3. **Smoke test the live site:** `SMOKE_BASE_URL=https://nauli-sako.vercel.app npx tsx scripts/smoke.ts KAB123B 1 0708374149`, then sweep again.
4. **Conductor screen:** open the dashboard, tap **Turn on payment alerts** (sound, vibration, notifications). Turn the volume up.
5. **SACCO screen:** open it and enter the PIN so the cookie is set. Open the Forecast tab once.
6. **Passenger phone:** volume on, so the spoken result is heard. Know the fare you'll pay: **KES 1**.
7. Use a reliable connection (hotspot). The server runs on Vercel, but the phones and laptop still need internet.

## The script

**1. Problem (20 s).** Paying a matatu by M-Pesa means showing your phone to the conductor: your balance, your messages. Fake SMS confirmations are common. Owners can't see what each vehicle earned.

**2. Passenger (45 s).** On the conductor screen, tap **QR**. Scan it with phone A. The page shows the yellow plate **KAB 123B**. Tap **Other amount**, enter **1**, enter your number, **Pay**. The real M-Pesa prompt appears; enter the PIN. The screen turns green, vibrates and reads the result aloud, showing **phone ending** and **receipt ending**.

> Point out: no app to install, the passenger never hands over their phone, and only the last 3 digits are stored.

**3. Conductor (30 s).** The fare has already appeared on the conductor screen with a chime and a green banner. Type the passenger's 3 characters into **Check a passenger's code**; the row is highlighted. Tap the row to verify. Point at the **Wallet** tile: the sats landed in this vehicle's own Lightning wallet.

> Optional: show **Prompt passenger** in the bottom bar, for passengers who can't scan.

**4. Owner / SACCO (40 s).** On the SACCO screen: totals, then owner cards (Grace Wanjiru, Peter Otieno), each plate with KES, sats, verified %. Tap the **Forecast** tab: tomorrow's projected takings by hour, peak hours and the best 8-hour shift. It's an average of the last 4 same weekdays, not a trained model.

**5. Trust + cash-out (30 s).** Back on **Takings**, tap **Publish today's report**, then **View on Nostr**: a signed public summary anyone can check, with no phone numbers. Then **Cash out**: paste a Tando / bitcoin.co.ke Lightning invoice, **Check amount**, **Pay**.

**6. Close (15 s).** Next: a production Daraja till, USSD for feature phones (from Safaripap), and real accounts for conductors and owners.

## If something stalls on stage

| Problem | What to do |
| :-- | :-- |
| No M-Pesa prompt on phone A | Wait 10 s. If nothing, use the test number `0708374149` and continue with the fallback below. |
| Paid, but the passenger page still says "Check your phone" | It checks M-Pesa by itself after 30 s. After 45 s, tap **Check again**. |
| Still stuck, or used the test number | On the laptop: `curl -X POST https://nauli-sako.vercel.app/api/dev/simulate-callback -H 'Content-Type: application/json' -d '{"txId":"<id from the page address>","pin":"<DEMO_ADMIN_PIN>"}'` |
| Fare shows **Paid** but no bolt icon / wallet didn't grow | LNbits was slow or the treasury is low. Say "settlement retries automatically", move on; afterwards: `POST /api/tx/<id>/settle` with the PIN. |
| Conductor screen didn't update | It refreshes every 15 s anyway; pull it into view or reload. |
| Nostr publish fails | Relays are public and occasionally slow; tap it again. |

## Honest limits (say them if asked)

- **Daraja is the sandbox.** No real KES arrives; the treasury float is the real cost of the demo.
- **Wallets are custodial:** segregated per vehicle on a hosted LNbits server, not self-custody.
- **The PIN is a demo gate,** not real login.
- **Simulated callbacks** exist as a fallback because sandbox callbacks are unreliable.
