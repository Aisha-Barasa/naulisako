import Anthropic from "@anthropic-ai/sdk";
import type { SaccoForecast } from "./forecast";

// Optional "AI summary": Claude narrates the forecast numbers in plain English.
// Only aggregates are sent — no phone numbers, receipts or individual payments.

const CACHE_MS = 30 * 60_000;
const cache = new Map<string, { text: string; at: number }>();

export function briefingEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

function numericSummary(f: SaccoForecast) {
  return {
    sacco: f.saccoName,
    method: "Mean KES per weekday-hour over the last 28 days",
    tomorrow: {
      day: `${f.tomorrow.weekday} ${f.tomorrow.date}`,
      projectedKes: f.fleet.tomorrowKes,
      projectedFares: f.fleet.tomorrowFares,
      peakHours: f.fleet.peakHours.map(hh),
      suggestedShift: `${hh(f.fleet.shift.start)}–${hh(f.fleet.shift.end)} (KES ${f.fleet.shift.kes})`,
    },
    todaySoFar: {
      day: f.today.weekday,
      throughHour: hh(f.today.currentHour),
      actualKes: f.vehicles.reduce((s, v) => s + v.todayActualKes, 0),
      projectedKes: f.vehicles.reduce((s, v) => s + v.todayProjectedSoFarKes, 0),
    },
    vehicles: f.vehicles.map((v) => ({
      plate: v.vehicleCode,
      tomorrowKes: v.tomorrowKes,
      peakHours: v.peakHours.map(hh),
      suggestedShift: `${hh(v.shift.start)}–${hh(v.shift.end)}`,
    })),
  };
}

const SYSTEM = `You write a short daily briefing for a Kenyan matatu SACCO manager.
Use only the numbers provided. Write 3–4 plain-English sentences, no headings, lists or markdown.
Cover tomorrow's projected takings and busiest hours, the suggested 8-hour shift, and how today is tracking against its projection.
Mention a vehicle only if it clearly stands out. Amounts are in KES. Say "projected", not "predicted"; this is an average of past weeks, not a model.`;

/** Returns the briefing text, or null when disabled, refused or the API fails. */
export async function getBriefing(f: SaccoForecast): Promise<string | null> {
  if (!briefingEnabled()) return null;
  const key = `${f.saccoId}:${f.tomorrow.date}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;

  const client = new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      // Re-run on another model if this one declines, instead of returning nothing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(numericSummary(f)) }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (!text) return null;
    cache.set(key, { text, at: Date.now() });
    return text;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.error("briefing: ANTHROPIC_API_KEY rejected");
    else if (e instanceof Anthropic.RateLimitError) console.warn("briefing: rate limited");
    else if (e instanceof Anthropic.APIError) console.error(`briefing: API error ${e.status}: ${e.message}`);
    else console.error("briefing: failed", e);
    return null;
  }
}
