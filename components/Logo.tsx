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

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-3 border-b-2 border-ink px-4 py-3">
      <Logo />
      <span className="text-xl font-extrabold tracking-tight">Nauli Sacco</span>
      {children ? <span className="ml-auto">{children}</span> : null}
    </header>
  );
}
