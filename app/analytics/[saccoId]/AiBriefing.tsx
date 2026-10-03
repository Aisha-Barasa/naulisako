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
    <section className="rounded-2xl border-2 border-ink p-4" aria-live="polite">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-600">AI summary · written by Claude from the numbers below</p>
      {state.status === "loading" ? <p className="animate-pulse text-base text-neutral-600">Writing today&apos;s briefing…</p> : null}
      {state.status === "ok" ? <p className="text-lg leading-relaxed">{state.text}</p> : null}
      {state.status === "error" ? <p className="text-base text-neutral-600">{state.message}</p> : null}
    </section>
  );
}
