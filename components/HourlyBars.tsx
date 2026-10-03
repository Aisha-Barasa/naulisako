// 24-hour bar chart in plain SVG (no chart library).
// Bars = primary series; optional `line` = second series drawn as a thin step outline.
// Every hour has a full-height hit area with a native tooltip; a table view sits below.

const BAR = "#2a78d6"; // categorical slot 1 (validated against the light surface)
const LINE = "#eb6834"; // categorical slot 2

type Series = { label: string; values: number[] };

type Props = {
  title: string;
  bars: Series;
  line?: Series;
  /** Hours after this one are drawn faded (e.g. not happened yet today). */
  upToHour?: number;
  highlight?: { start: number; end: number; label: string };
};

const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 48 };
const fmt = (n: number) => Math.round(n).toLocaleString();
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p / 2) * 2 * p;
}

/** Bar with a 4px rounded top, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function HourlyBars({ title, bars, line, upToHour, highlight }: Props) {
  const max = niceMax(Math.max(...bars.values, ...(line?.values ?? [0])));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / 24;
  const barW = Math.max(2, slot - 2); // 2px surface gap between bars
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const x = (h: number) => PAD.left + h * slot;
  const ticks = [0, max / 2, max];

  const stepPath = line
    ? line.values.map((v, h) => `${h === 0 ? "M" : "L"}${x(h)},${y(v)}H${x(h + 1)}`).join("")
    : "";

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-2xl font-extrabold uppercase leading-tight">{title}</span>
        {line ? (
          <span className="flex gap-4 text-sm text-stone-700">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: BAR }} aria-hidden="true" />
              {bars.label}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: LINE }} aria-hidden="true" />
              {line.label}
            </span>
          </span>
        ) : null}
      </figcaption>

      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
        {highlight ? (
          <g>
            <rect x={x(highlight.start)} y={PAD.top} width={(highlight.end - highlight.start) * slot} height={plotH} fill="#facc15" opacity={0.18} />
            <text x={x(highlight.start) + 4} y={PAD.top + 12} fontSize={11} fill="#52514e">
              {highlight.label}
            </text>
          </g>
        ) : null}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e5e5e5" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#52514e">
              {fmt(t)}
            </text>
          </g>
        ))}
        {bars.values.map((v, h) => (
          <path
            key={h}
            d={barPath(x(h) + 1, y(v), barW, PAD.top + plotH - y(v))}
            fill={BAR}
            opacity={upToHour !== undefined && h > upToHour ? 0.25 : 1}
          />
        ))}
        {line ? <path d={stepPath} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" /> : null}
        {Array.from({ length: 24 }, (_, h) =>
          h % 3 === 0 ? (
            <text key={h} x={x(h) + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#52514e">
              {String(h).padStart(2, "0")}
            </text>
          ) : null,
        )}
        {/* Hit areas: whole column per hour, larger than the bar */}
        {bars.values.map((v, h) => (
          <rect key={`hit-${h}`} x={x(h)} y={PAD.top} width={slot} height={plotH} fill="transparent" className="hover:fill-black/5">
            <title>
              {`${hh(h)}–${hh(h + 1)}\n${bars.label}: KES ${fmt(v)}${line ? `\n${line.label}: KES ${fmt(line.values[h])}` : ""}`}
            </title>
          </rect>
        ))}
      </svg>

      <details className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-stone-700 underline">Show as table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="num w-full text-left">
            <thead>
              <tr className="text-xs uppercase text-stone-600">
                <th className="py-1 pr-4">Hour</th>
                <th className="py-1 pr-4 text-right">{bars.label} (KES)</th>
                {line ? <th className="py-1 text-right">{line.label} (KES)</th> : null}
              </tr>
            </thead>
            <tbody>
              {bars.values.map((v, h) => (
                <tr key={h} className="border-t border-stone-200">
                  <td className="py-1 pr-4">{hh(h)}</td>
                  <td className="py-1 pr-4 text-right">{fmt(v)}</td>
                  {line ? <td className="py-1 text-right">{fmt(line.values[h])}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
