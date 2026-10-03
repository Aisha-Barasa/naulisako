"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Plate entry → /pay/<CODE>. Used on the landing page and the unknown-vehicle page. */
export function CodeEntry({
  initial = "",
  prominent = false,
}: {
  initial?: string;
  prominent?: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState(initial);
  const empty = code.trim().length === 0;

  return (
    <form
      className={prominent ? "flex flex-col gap-3" : "flex gap-2"}
      onSubmit={(e) => {
        e.preventDefault();
        const clean = code.replace(/\s+/g, "").toUpperCase();
        if (clean) router.push(`/pay/${encodeURIComponent(clean)}`);
      }}
    >
      {prominent ? (
        <label htmlFor="vehicle-code" className="text-lg font-bold">
          Vehicle code
          <span className="mt-1 block text-base font-normal text-stone-600">Nambari ya gari</span>
        </label>
      ) : null}
      <input
        id={prominent ? "vehicle-code" : undefined}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="KAB 123B"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        aria-label="Vehicle number plate"
        className="min-h-14 min-w-0 flex-1 rounded-xl border-[3px] border-ink bg-matatu px-4 py-2 font-display text-3xl font-extrabold uppercase tracking-[0.08em] text-ink shadow-[inset_0_0_0_3px_#facc15,inset_0_0_0_4px_rgb(22_19_15/0.3)] transition-shadow duration-150 placeholder:text-ink/65 focus:shadow-[inset_0_0_0_3px_#facc15,inset_0_0_0_4px_rgb(22_19_15/0.3),0_0_0_4px_rgb(22_19_15/0.15)] focus:outline-none"
      />
      <button type="submit" className={prominent ? "btn btn-ink min-h-14 w-full text-xl" : "btn btn-ink min-h-14 text-xl"}>
        {prominent ? "Continue" : "Go"}
      </button>
      {prominent && empty ? (
        <button type="button" className="min-h-11 self-start text-base font-semibold underline" onClick={() => setCode("KAB123B")}>
          Try KAB123B
        </button>
      ) : null}
    </form>
  );
}
