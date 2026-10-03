// Conductor dashboard shapes. Client-safe: masked phone digits only, no wallet keys.
import type { TxStatus } from "./tx-public";

export type DashTx = {
  id: string;
  created_at: string;
  amount_kes: number;
  amount_sats: number | null;
  phone_last3: string;
  receipt_last3: string | null;
  status: TxStatus;
  verified_by_conductor: boolean;
  source: "pwa" | "ussd" | "seed";
};

export const DASH_TX_COLUMNS =
  "id, created_at, amount_kes, amount_sats, phone_last3, receipt_last3, status, verified_by_conductor, source";

export type VehicleToday = {
  todayKes: number;
  todaySats: number;
  todayCount: number;
  /** null when LNbits couldn't be reached. */
  walletSats: number | null;
  txs: DashTx[];
};
