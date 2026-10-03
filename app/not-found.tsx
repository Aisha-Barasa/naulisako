import Link from "next/link";
import { CodeEntry } from "@/components/CodeEntry";
import { Header } from "@/components/Logo";
import { Plate } from "@/components/Plate";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md">
      <Header />
      <section className="space-y-5 px-4 py-8">
        <Plate code="404" size="lg" />
        <h1 className="font-display text-4xl font-extrabold uppercase leading-none">Wrong stage</h1>
        <p className="text-lg text-stone-700">
          This page doesn&apos;t exist. To pay a fare, scan the QR sticker inside the matatu or type the code printed under it.
          <span className="block text-base text-stone-600">Ukurasa huu haupo. Weka nambari iliyo chini ya stika ya QR.</span>
        </p>
        <CodeEntry />
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold underline">
          Back to the start
        </Link>
      </section>
    </main>
  );
}
