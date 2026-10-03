// A Kenyan rear number plate: yellow, black border, condensed lettering, "KAB 123B".
// The app's signature element: every vehicle code is shown as its plate.

const SIZES = {
  sm: "px-2 py-0.5 text-lg rounded-md border-2",
  md: "px-3 py-1 text-2xl rounded-lg border-[3px]",
  lg: "px-4 py-1.5 text-5xl rounded-xl border-4",
} as const;

/** "KAB123B" → "KAB 123B" (letters, then the rest). */
export function formatPlate(code: string): string {
  const m = /^([A-Z]{3})(\d{3}[A-Z]?)$/.exec(code.toUpperCase());
  return m ? `${m[1]} ${m[2]}` : code.toUpperCase();
}

export function Plate({ code, size = "md", className = "" }: { code: string; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap border-ink bg-matatu font-display font-extrabold leading-none tracking-[0.06em] text-ink shadow-[inset_0_0_0_2px_#facc15,inset_0_0_0_3px_rgb(22_19_15/0.35)] ${SIZES[size]} ${className}`}
      aria-label={`Vehicle ${formatPlate(code)}`}
    >
      {formatPlate(code)}
    </span>
  );
}
