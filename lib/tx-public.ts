// The passenger-safe view of a transaction. Shared by server and client.

export type TxStatus = "processing" | "fulfilled" | "settled" | "failed";

export type TxPublic = {
  id: string;
  status: TxStatus;
  amountKes: number;
  receiptLast3: string | null;
  phoneLast3: string;
  failureReason: string | null;
};

export type TxRowLike = {
  id: string;
  status: TxStatus;
  amount_kes: number;
  receipt_last3: string | null;
  phone_last3: string;
  failure_reason: string | null;
};

export const TX_PUBLIC_COLUMNS = "id, status, amount_kes, receipt_last3, phone_last3, failure_reason";

export function toTxPublic(row: TxRowLike): TxPublic {
  return {
    id: row.id,
    status: row.status,
    amountKes: row.amount_kes,
    receiptLast3: row.receipt_last3 || null,
    phoneLast3: row.phone_last3,
    // failure_reason also carries settlement notes (treasury_low…) that the passenger doesn't need.
    failureReason: row.status === "failed" ? row.failure_reason : null,
  };
}

/** Money received from the passenger's side, whether or not sats have settled yet. */
export function isPaid(status: TxStatus): boolean {
  return status === "fulfilled" || status === "settled";
}
