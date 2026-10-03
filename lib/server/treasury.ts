// Treasury settlement: KES received → sats from treasury wallet to vehicle wallet.
// Phase 3 fills this in; Phase 2 callers already invoke it.

export type SettleResult = { ok: true; amountSats: number } | { ok: false; reason: string };

export async function settleTransaction(txId: string): Promise<SettleResult> {
  void txId;
  return { ok: false, reason: "not_implemented" };
}
