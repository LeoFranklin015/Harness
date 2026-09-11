"use client";

import { Cascade } from "./Cascade";
import { Cubes } from "./Cubes";
import { Panels } from "./Panels";

/**
 * The claim, and the three screens that are the product.
 *
 * A device asking to be held, a sandbox running, and a shell showing what came
 * of it — including the moment all of it is taken back. The words only have to
 * make the claim; the band does the explaining.
 */
export function Hero({
  onConnect,
  connecting,
  status,
  supported,
}: {
  onConnect: () => void;
  connecting: boolean;
  status: React.ReactNode;
  supported: boolean;
}) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-black">
      {/* Scenery in the empty corner, at the edge of visible. */}
      <Cubes className="pointer-events-none absolute -bottom-28 -right-20 hidden w-[440px] lg:block xl:w-[520px]" />
      <header className="relative z-10 mx-auto flex w-full max-w-[1500px] items-center px-7 py-7 lg:px-10">
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[14px] font-medium tracking-tight text-neutral-100">Harness</span>
        </div>
      </header>

      <section className="relative mx-auto w-full max-w-[1500px] px-7 pb-16 lg:min-h-[calc(100dvh-7rem)] lg:px-10 lg:pb-20">
        <div className="max-w-[34rem] lg:pt-6">
          <h1 className="text-[clamp(2.6rem,5vw,4.1rem)] font-medium leading-[0.98] tracking-[-0.042em] text-neutral-50">
            Give agents
            <br />
            machines,
            <br />
            not wallets.
          </h1>

          <p className="mt-7 max-w-[30rem] text-[16px] leading-[1.65] text-neutral-400">
            One tap on a Ledger gives an agent a container, a name you can ssh
            into, and a daily limit it cannot raise. One more tap ends all
            three at once.
          </p>

          <div className="mt-9">
            <button
              onClick={onConnect}
              disabled={connecting || !supported}
              className="group relative overflow-hidden rounded-full bg-neutral-50 px-6 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="relative z-10">{connecting ? "Connecting…" : "Connect Ledger"}</span>
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </button>
            <div className="mt-4 min-h-5">{status}</div>
          </div>
        </div>

        {/* Staggered down a diagonal at desktop; plainly stacked on a phone,
            where a 1070-pixel frame would not fit. */}
        {/* All three step up to the right; the device starts beside the button
            rather than pinned to the page edge. */}
        <Cascade className="pointer-events-none absolute left-0 top-0 hidden origin-top-left scale-[0.6] lg:block xl:scale-[0.74] 2xl:scale-[0.79]" />
        <Panels className="mt-14 lg:hidden" />
      </section>
    </main>
  );
}

/** The mark: three tiers, which is the whole hierarchy at eighteen pixels. */
function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M9 2.4 L14.6 5.2 L9 8 L3.4 5.2 Z" fill="#f3f4f6" fillOpacity="0.95" />
      <path d="M9 7.2 L14.6 10 L9 12.8 L3.4 10 Z" fill="#9ca3af" fillOpacity="0.7" />
      <path d="M9 12 L14.6 14.8 L9 17.6 L3.4 14.8 Z" fill="#6b7280" fillOpacity="0.5" />
    </svg>
  );
}
