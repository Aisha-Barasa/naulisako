// Kenyan mobile numbers: 2547xxxxxxxx (Safaricom/Airtel) and 2541xxxxxxxx (newer ranges).

export class InvalidPhoneError extends Error {
  constructor(input: string) {
    super(`Invalid Kenyan phone number: ${input}`);
    this.name = "InvalidPhoneError";
  }
}

/** Accepts 07…, 01…, +2547…, 2547…, +2541…, 2541… (spaces/dashes allowed). Returns 2547xxxxxxxx / 2541xxxxxxxx. */
export function normalizeKePhone(input: string): string {
  const digits = input.trim().replace(/[\s\-()]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) throw new InvalidPhoneError(input);

  let local: string;
  if (/^0[17]\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^254[17]\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^[17]\d{8}$/.test(digits)) local = digits;
  else throw new InvalidPhoneError(input);

  return `254${local}`;
}

/** "254712345678" → "2547****678" */
export function maskPhone(normalized: string): string {
  return `${normalized.slice(0, 4)}****${normalized.slice(-3)}`;
}

export function phoneLast3(normalized: string): string {
  return normalized.slice(-3);
}
