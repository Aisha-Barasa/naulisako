import Link from "next/link";

// Bottom navigation on conductor screens. Real links, so keyboard, screen
// readers and the back button behave normally.
type Section = "fares" | "prompt" | "home";

export function ConductorNav({ active, vehicleCode }: { active: Section; vehicleCode: string }) {
  const items: { id: Section; label: string; href: string; icon: JSX.Element }[] = [
    { id: "fares", label: "Fares", href: `/dashboard/${vehicleCode}`, icon: <path d="M4 6h16M4 12h16M4 18h10" /> },
    {
      id: "prompt",
      label: "Prompt passenger",
      href: `/pay/${vehicleCode}?from=conductor`,
      icon: (
        <>
          <rect x="7" y="3" width="10" height="18" rx="2" />
          <path d="M11 17h2" />
        </>
      ),
    },
    { id: "home", label: "Home", href: "/", icon: <path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" /> },
  ];

  return (
    <nav aria-label="Conductor" className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-2xl gap-2 px-2 py-2">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <li key={item.id} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 transition-[transform,background-color] duration-150 ease-out active:scale-[0.97] ${
                  isActive ? "bg-ink text-white" : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {item.icon}
                </svg>
                <span className="text-center text-sm font-bold leading-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
