import { notFound } from "next/navigation";
import { z } from "zod";
import { Header } from "@/components/Logo";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { cleanVehicleCode } from "@/lib/server/vehicles";
import { TX_PUBLIC_COLUMNS, toTxPublic, type TxRowLike } from "@/lib/tx-public";
import { StatusView } from "./StatusView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment status · Nauli SaKo" };

export default async function StatusPage({ params }: { params: { vehicleCode: string; txId: string } }) {
  const id = z.string().uuid().safeParse(params.txId);
  if (!id.success) notFound();

  const { data, error } = await getSupabaseAdmin()
    .from("transactions")
    .select(TX_PUBLIC_COLUMNS)
    .eq("id", id.data)
    .maybeSingle<TxRowLike>();
  if (error) throw error;
  if (!data) notFound();

  const vehicleCode = cleanVehicleCode(params.vehicleCode);
  return (
    <main className="mx-auto max-w-md">
      <Header>
        <span className="text-lg font-black tracking-wider">{vehicleCode}</span>
      </Header>
      <StatusView initial={toTxPublic(data)} vehicleCode={vehicleCode} />
    </main>
  );
}
