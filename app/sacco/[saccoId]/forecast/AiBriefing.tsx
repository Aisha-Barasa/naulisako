"use client";

import { useEffect, useState } from "react";

export function AiBriefing({ saccoId }: { saccoId: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ok"; text: string } | { status: "error"; message: string }>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analytics/${saccoId}/briefing`, { method: "POST" })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (cancelled) return;
        setState(res.ok && json.text ? { status: "ok", text: json.text } : { status: "error", message: json.error ?? "AI summary unavailable" });
      })
      .catch(() => !cancelled && setState({ status: "error", message: "AI summary unavailable" }));
    return () => {
      cancelled = true;
    };
  }, [saccoId]);

  return (
    <section className="rounded-2xl border-2 border-ink bg-matatu-soft p-4" aria-live="polite">
      <h2 className="font-display text-2xl font-extrabold uppercase">AI summary</h2>
      <p className="mb-2 text-sm text-stone-700">Written by Claude from the numbers on this page.</p>
      {state.status === "loading" ? (
        <div className="space-y-2" aria-label="Writing the briefing">
          <div className="h-4 w-full rounded bg-ink/10 motion-safe:animate-pulse" />
          <div className="h-4 w-11/12 rounded bg-ink/10 motion-safe:animate-pulse" />
          <div className="h-4 w-3/4 rounded bg-ink/10 motion-safe:animate-pulse" />
        </div>
      ) : null}
      {state.status === "ok" ? <p className="text-lg leading-relaxed">{state.text}</p> : null}
      {state.status === "error" ? <p className="text-base text-stone-600">{state.message}</p> : null}
    </section>
  );
}
