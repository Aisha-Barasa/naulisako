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
    { href: `/dashboard/${DEMO_VEHICLE}`, label: "Conductor" },
    ...(saccoId
      ? [
          { href: `/sacco/${saccoId}`, label: "SACCO" },
          { href: `/analytics/${saccoId}`, label: "Forecast" },
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
          <section className="space-y-6 px-4 py-6">
            <p className="text-lg leading-snug">
              Pay the fare with M-Pesa. Each vehicle keeps its own wallet. The conductor checks it without taking your phone.
            </p>
            <CodeEntry prominent />
            <nav className="space-y-2 border-t-2 border-ink pt-4 text-base" aria-label="Demo">
              <p className="text-sm font-semibold text-neutral-600">Demo</p>
              {links.map((l) => (
                <Link key={l.href} className="block underline" href={l.href}>
                  {l.label}
                </Link>
              ))}
            </nav>
          </section>
        </div>
      </div>
    </main>
  );
}
