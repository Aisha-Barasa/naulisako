"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Plate entry → /pay/<CODE>. Used on the landing page and the unknown-vehicle page. */
export function CodeEntry({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initial);

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = code.replace(/\s+/g, "").toUpperCase();
        if (clean) router.push(`/pay/${encodeURIComponent(clean)}`);
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="KAB 123B"
        autoCapitalize="characters"
        autoComplete="off"
        aria-label="Vehicle number plate"
        className="min-w-0 flex-1 rounded-xl border-2 border-ink px-4 py-3 text-2xl font-bold uppercase tracking-wider"
      />
      <button type="submit" className="rounded-xl bg-ink px-5 py-3 text-xl font-bold text-white">
        Go
      </button>
    </form>
  );
}
