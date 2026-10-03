// Nairobi is UTC+3 all year (no DST).
const EAT_OFFSET_MS = 3 * 3600_000;

/** Start of the Nairobi calendar day containing `date`, as a UTC ISO string. `daysBack` steps to earlier days. */
export function nairobiDayStartISO(date: Date = new Date(), daysBack = 0): string {
  const eat = new Date(date.getTime() + EAT_OFFSET_MS);
  const startUtc = Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate() - daysBack) - EAT_OFFSET_MS;
  return new Date(startUtc).toISOString();
}

/** "14:05" in Nairobi time. */
export function formatNairobiTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** "2 Oct, 18:40" in Nairobi time. */
export function formatNairobiDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
