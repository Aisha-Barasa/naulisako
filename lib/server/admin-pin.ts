// Demo guard for operator-only routes. Not auth: open in dev, PIN in production.
export function pinAllowed(pin: string | null | undefined): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const expected = process.env.DEMO_ADMIN_PIN;
  return Boolean(expected) && pin === expected;
}
