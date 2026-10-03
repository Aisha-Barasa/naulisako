import { CodeEntry } from "@/components/CodeEntry";
import { Header } from "@/components/Logo";

export default function Home() {
  return (
    <main className="relative min-h-screen">
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/bus-cabin.jpg')" }}
      />
      <div aria-hidden="true" className="fixed inset-0 -z-10 bg-white/55" />
      <div className="relative mx-auto min-h-screen max-w-md">
        <Header />
        <section className="space-y-6 px-4 py-6">
          <p className="text-lg leading-snug">
            Pay the fare with M-Pesa. Each vehicle keeps its own wallet. The conductor checks it without taking your
            phone.
          </p>
          <CodeEntry prominent />
          <nav className="space-y-2 border-t-2 border-ink pt-4 text-base">
            <p className="text-sm font-semibold text-neutral-600">Demo</p>
            <a className="block underline" href="/dashboard/KAB123B">
              Conductor
            </a>
            <a className="block underline" href="/sacco">
              SACCO
            </a>
            <a className="block underline" href="/analytics">
              Forecast
            </a>
          </nav>
        </section>
      </div>
    </main>
  );
}
