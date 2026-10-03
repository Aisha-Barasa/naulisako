import Link from "next/link";

// One tab bar for the SACCO's features, so Forecast and Cash out read as part of the SACCO view.
type Tab = "takings" | "forecast" | "payout";

export function SaccoTabs({ saccoId, active }: { saccoId: string; active: Tab }) {
  const tabs: { id: Tab; label: string; href: string }[] = [
    { id: "takings", label: "Takings", href: `/sacco/${saccoId}` },
    { id: "forecast", label: "Forecast", href: `/sacco/${saccoId}/forecast` },
    { id: "payout", label: "Cash out", href: `/sacco/${saccoId}/payout` },
  ];
  return (
    <nav aria-label="SACCO" className="border-b-2 border-ink bg-white px-4">
      <ul className="flex gap-1">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <li key={t.id} className="flex-1 sm:flex-none">
              <Link
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex min-h-12 items-center justify-center px-4 text-base font-bold transition-colors duration-150 ${
                  isActive ? "text-ink" : "text-stone-600 hover:text-ink"
                }`}
              >
                {t.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-2 -bottom-[2px] h-1 rounded-t-full ${isActive ? "bg-ink" : "bg-transparent"}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
