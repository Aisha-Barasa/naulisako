import Link from "next/link";
import { CodeEntry } from "@/components/CodeEntry";
import { Header } from "@/components/Logo";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

const DEMO_VEHICLE = "KAB123B";

async function demoSaccoId(): Promise<string | null> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("saccos")
      .select("id")
      .order("created_at")
      .limit(1)
      .maybeSingle<{ id: string }>();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export default async function Home() {
  const saccoId = await demoSaccoId();
  const links = [
    { href: `/pay/${DEMO_VEHICLE}`, label: "Pay a fare", sub: "Passenger" },
    { href: `/dashboard/${DEMO_VEHICLE}`, label: "Conductor dashboard", sub: DEMO_VEHICLE },
    ...(saccoId ? [{ href: `/sacco/${saccoId}`, label: "SACCO view", sub: "Owners & totals (PIN)" }] : []),
  ];

  return (
    <main className="mx-auto max-w-md">
      <Header />
      <section className="space-y-3 px-4 py-6">
        <h1 className="text-3xl font-black leading-tight">Matatu fares by M-Pesa, settled per vehicle.</h1>
        <p className="text-lg">
          Passengers pay with an M-Pesa prompt. Each fare lands in the vehicle&apos;s own Lightning wallet, the conductor sees it live, and
          owners see every plate&apos;s takings.
        </p>
      </section>
      <section className="space-y-2 border-y-2 border-ink bg-matatu px-4 py-5">
        <p className="text-xl font-extrabold">Pay your fare</p>
        <p className="text-base">Enter the number plate · Weka nambari ya gari</p>
        <CodeEntry />
      </section>
      <nav className="space-y-3 px-4 py-6" aria-label="Demo">
        <p className="text-sm font-bold uppercase text-neutral-600">Demo</p>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center justify-between rounded-xl border-2 border-ink px-4 py-3">
            <span className="text-lg font-bold">{l.label}</span>
            <span className="text-sm text-neutral-600">{l.sub}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
