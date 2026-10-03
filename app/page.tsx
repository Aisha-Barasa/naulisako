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

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function Home() {
  const saccoId = await demoSaccoId();
  const links = [
    { href: `/pay/${DEMO_VEHICLE}`, label: "Pay a fare", sub: "Passenger" },
    { href: `/dashboard/${DEMO_VEHICLE}`, label: "Conductor dashboard", sub: DEMO_VEHICLE },
    ...(saccoId
      ? [
          { href: `/sacco/${saccoId}`, label: "SACCO view", sub: "Takings · forecast · PIN" },
        ]
      : []),
  ];

  return (
    <main className="relative min-h-screen">
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat brightness-110"
        style={{ backgroundImage: "url('/bus-cabin.jpg')" }}
      />
      <div className="relative mx-auto min-h-screen max-w-md">
        <div className="h-36" aria-hidden="true" />
        <div className="min-h-[calc(100vh-9rem)] bg-white">
          <Header />

          <section className="px-5 pb-7 pt-6">
            <h1 className="font-display text-[2.35rem] font-extrabold uppercase leading-[1.08] tracking-[0.005em]">
              Matatu fares by M-Pesa, settled per vehicle.
            </h1>
            <p className="mt-4 max-w-[36ch] text-lg leading-relaxed text-stone-700">
              Pay the fare with M-Pesa. Each vehicle keeps its own wallet. The conductor checks it without taking your phone.
            </p>
          </section>

          <section className="border-y-2 border-ink bg-matatu px-5 pb-6 pt-5" aria-labelledby="pay-heading">
            <h2 id="pay-heading" className="font-display text-[1.7rem] font-extrabold uppercase leading-tight">
              Pay your fare
            </h2>
            <p className="mt-2 text-base leading-relaxed text-ink/85">
              Scan the QR sticker inside the matatu, or type the code printed under it.
            </p>
            <p className="mt-1 text-base leading-relaxed text-ink/75">Changanua stika ya QR, au weka nambari iliyo chini yake.</p>
            <div className="mt-4">
              <CodeEntry showDemo />
            </div>
          </section>

          <nav className="space-y-3 px-5 pb-10 pt-7" aria-labelledby="demo-heading">
            <h2 id="demo-heading" className="pb-1 text-lg font-bold">
              Try the demo
            </h2>
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-ink bg-white px-4 py-3 transition-[transform,background-color] duration-150 ease-out hover:bg-matatu-soft active:scale-[0.98] active:bg-matatu-soft"
              >
                <span className="flex-1 text-lg font-bold">{l.label}</span>
                <span className="text-sm text-stone-600">{l.sub}</span>
                <Chevron />
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </main>
  );
}
