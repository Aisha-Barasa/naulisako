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
          <span className="mt-1 block text-base font-normal text-neutral-600">Nambari ya gari</span>
        </label>
      ) : null}
      <input
        id={prominent ? "vehicle-code" : undefined}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="KAB123B"
        autoCapitalize="characters"
        autoComplete="off"
        aria-label="Vehicle number plate"
        className="min-h-14 min-w-0 flex-1 rounded-xl border-2 border-ink px-4 py-3 text-2xl font-bold uppercase tracking-wider"
      />
      <button
        type="submit"
        className={
          prominent
            ? "min-h-14 w-full rounded-xl bg-matatu text-xl font-bold text-ink"
            : "rounded-xl bg-ink px-5 py-3 text-xl font-bold text-white"
        }
      >
        {prominent ? "Continue" : "Go"}
      </button>
      {prominent && empty ? (
        <button type="button" className="text-left text-base underline" onClick={() => setCode("KAB123B")}>
          Try KAB123B
        </button>
      ) : null}
    </form>
  );
}
