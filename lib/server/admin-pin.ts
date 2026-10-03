import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Demo guard for operator-only pages and routes. Not auth.
// DEMO_ADMIN_PIN set → it's required everywhere. Unset → open in dev, closed in production.

export const ADMIN_COOKIE = "nauli_admin";

function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

export function pinAllowed(pin: string | null | undefined): boolean {
  const expected = process.env.DEMO_ADMIN_PIN;
  if (!expected) return process.env.NODE_ENV !== "production";
  return typeof pin === "string" && timingSafeEqual(sha256(pin), sha256(expected));
}

/** Cookie value stored after a correct PIN: a hash, so the PIN itself never sits in the browser. */
export function adminCookieValue(pin: string): string {
  return sha256(`nauli:${pin}`).toString("hex");
}

/** For pages and GET routes: PIN cookie (or x-admin-pin header) is valid. */
export function adminSessionOk(headerPin?: string | null): boolean {
  const expected = process.env.DEMO_ADMIN_PIN;
  if (!expected) return process.env.NODE_ENV !== "production";
  if (headerPin && pinAllowed(headerPin)) return true;
  const cookie = cookies().get(ADMIN_COOKIE)?.value;
  return cookie === adminCookieValue(expected);
}
