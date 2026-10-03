import { SettingsButton } from "./SettingsButton";

// Inline SVG so the passenger page needs no image downloads.
export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#facc15" />
      <rect x="10" y="18" width="44" height="24" rx="5" fill="#0a0a0a" />
      <rect x="14" y="22" width="9" height="8" rx="1.5" fill="#facc15" />
      <rect x="26" y="22" width="9" height="8" rx="1.5" fill="#facc15" />
      <rect x="38" y="22" width="12" height="8" rx="1.5" fill="#facc15" />
      <circle cx="20" cy="45" r="5" fill="#0a0a0a" stroke="#facc15" strokeWidth="2" />
      <circle cx="44" cy="45" r="5" fill="#0a0a0a" stroke="#facc15" strokeWidth="2" />
    </svg>
  );
}

/** Site header: home link, optional extras (plate, links), accessibility settings. */
export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2 border-b-2 border-ink px-4 py-2.5">
      <a href="/" className="flex min-h-12 items-center gap-2.5 rounded-lg" aria-label="Nauli SaKo home">
        <Logo />
        <span className="hidden font-display text-2xl font-extrabold uppercase tracking-[0.02em] min-[380px]:inline">Nauli SaKo</span>
      </a>
      <span className="ml-auto flex items-center gap-2">
        {children}
        <SettingsButton />
      </span>
    </header>
  );
}
