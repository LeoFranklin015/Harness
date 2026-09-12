"use client";

import { Deck } from "./Deck";
import { LiveTerminal } from "./Terminal";
import { Agent } from "@/components/tenants/Agent";

/**
 * Four slides.
 *
 * What it is, why it needs to exist, the part worth watching, and the
 * architecture. In that order, because a room that already knows what you
 * built hears the problem as confirmation, not as a preamble to sit through.
 */
export default function Pitch() {
  return (
    <Deck
      slides={[
        <What key="1" />,
        <Why key="2" />,
        <Cool key="3" />,
        <Built key="4" />,
      ]}
    />
  );
}

/** A line that arrives after the one above it. */
function Rise({ at, children }: { at: number; children: React.ReactNode }) {
  return (
    <div className="rise" style={{ animationDelay: `${at}ms` }}>
      {children}
    </div>
  );
}

// --- 1 ---------------------------------------------------------------------

/** Real marks, fetched from the brands, not drawn by us. */
function Logo({ src, alt, h = 26, className = "" }: { src: string; alt: string; h?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ height: h }} className={`w-auto ${className}`} />;
}

function What() {
  return (
    <div className="grid items-center gap-14 lg:grid-cols-[1fr_minmax(0,380px)] lg:gap-20">
      <div>
      <Rise at={0}>
        <div className="mb-8 flex items-center gap-2.5">
          <Mark />
          <span className="text-sm font-medium tracking-tight text-neutral-400">Harness</span>
        </div>
      </Rise>

      <Rise at={90}>
        <h1 className="text-[clamp(2.3rem,5vw,4.3rem)] font-medium leading-[0.97] tracking-[-0.04em] text-neutral-50">
          A scoped sandbox
          <br />
          for your agents.
        </h1>
      </Rise>

      <Rise at={260}>
        <div className="mt-12 flex flex-wrap gap-x-12 gap-y-5 text-[17px] text-neutral-400">
          <span>Its own machine.</span>
          <span>Its own name.</span>
          <span>A permission that lives on chain.</span>
        </div>
      </Rise>

      <Rise at={400}>
        <p className="mt-10 border-t border-neutral-900 pt-6 text-[15px] text-neutral-600">
          One tap on a Ledger creates all three. One tap ends them.
        </p>
      </Rise>
      </div>

      {/* The sandbox, drawn. A bordered box with the agent inside it is the
          slide's own sentence, and it belonged in the half that was empty. */}
      <Rise at={200}>
        <div className="relative">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] tracking-wider text-neutral-600">
                acme.harness.eth
              </p>
              <span className="rounded-full border border-emerald-900/60 px-2 py-0.5 text-[9px] uppercase tracking-widest text-emerald-500/80">
                live
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-neutral-900 bg-black/50">
              <Agent state="live" className="w-full" />
            </div>

            <dl className="mt-4 space-y-1.5 font-mono text-[11px]">
              <Row k="name" v="runner.acme.harness.eth" />
              <Row k="ceiling" v="$10.00 / day" />
              <Row k="spent" v="$4.25" />
            </dl>
          </div>

          <div className="mt-7 flex items-center gap-7 opacity-80">
            <Logo src="/logos/ledger.svg" alt="Ledger" h={22} />
            <Logo src="/logos/ens.svg" alt="ENS" h={26} />
          </div>
        </div>
      </Rise>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-700">{k}</dt>
      <dd className="text-neutral-400">{v}</dd>
    </div>
  );
}

// --- 2 ---------------------------------------------------------------------

function Why() {
  return (
    <div className="grid items-center gap-14 lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-20">
      <div>
        <Rise at={0}>
          <h2 className="text-[clamp(2rem,4.4vw,3.2rem)] font-medium leading-[1.12] tracking-[-0.03em]">
            <span className="text-neutral-500">Today we run agents on</span>
            <br />
            <span className="text-neutral-50">centralized compute</span>
            <br />
            <span className="text-neutral-500">and hand them</span>
            <br />
            <span className="text-neutral-50">private keys.</span>
          </h2>
        </Rise>

        <Rise at={700}>
          <p className="mt-12 text-[clamp(1.8rem,3.6vw,2.6rem)] font-medium tracking-[-0.03em] text-amber-400/90">
            That&apos;s not very cypherpunk.
          </p>
        </Rise>
      </div>

      <Rise at={340}>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-4">
            <Owned label="COMPUTE" note="someone else's">
              <div className="flex items-center gap-4">
                <Logo src="/logos/amazonwebservices.svg" alt="AWS" h={22} />
                <Logo src="/logos/googlecloud.svg" alt="Google Cloud" h={24} />
              </div>
            </Owned>
            <Owned label="KMS" note="someone else's">
              <KeyMark />
            </Owned>
          </div>

          {/* The dependency, drawn rather than labelled. Bright enough to be
              the thing you follow, since it is the argument. */}
          <div className="relative h-14">
            <svg className="h-full w-full" viewBox="0 0 400 56" preserveAspectRatio="none" aria-hidden>
              <path d="M100 0 L100 30 L200 30 L200 56" fill="none" stroke="#8d97a6" strokeWidth="1.6" />
              <path d="M300 0 L300 30 L200 30 L200 56" fill="none" stroke="#8d97a6" strokeWidth="1.6" />
              <path d="M194 46 L200 56 L206 46" fill="none" stroke="#8d97a6" strokeWidth="1.6" />
            </svg>
            <span className="absolute left-[14%] top-1 text-[11px] text-neutral-500">runs on</span>
            <span className="absolute right-[13%] top-1 text-[11px] text-neutral-500">signs with</span>
          </div>

          <div className="rounded-xl border border-red-900/70 bg-red-950/25 px-5 py-5 text-center">
            <p className="text-[17px] font-medium text-neutral-50">your agent</p>
            <p className="mt-1 text-[12px] text-red-300/70">
              runs on one, signs with the other
            </p>
          </div>
        </div>
      </Rise>
    </div>
  );
}

function Owned({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900/60 px-5 py-5">
      <p className="text-[10px] font-semibold tracking-[0.16em] text-neutral-400">{label}</p>
      <div className="mt-4 flex h-10 items-center">{children}</div>
      <p className="mt-4 text-[11px] text-neutral-500">{note}</p>
    </div>
  );
}

function KeyMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#e8a33d" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="7" cy="7" r="4.4" />
      <path d="M10.4 10.4 L20 20" />
      <path d="M16.6 16.6 L14.4 18.8" />
      <path d="M19 19 L16.8 21.2" />
    </svg>
  );
}

// --- 3 ---------------------------------------------------------------------

function Cool() {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-16">
      <div>
        <Rise at={0}>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-neutral-600">
            THE COOL PART
          </p>
          <h2 className="mt-5 text-[clamp(2rem,4.2vw,3rem)] font-medium leading-[1.08] tracking-[-0.03em] text-neutral-50">
            It has a name.
            <br />
            So just ssh to it.
          </h2>
        </Rise>

        <Rise at={200}>
          <p className="mt-7 text-[16px] leading-relaxed text-neutral-500">
            A real ENS name, over ordinary DNS. No wallet, no plugin, no copied
            IP address.
          </p>

          {/* Because it is DNS and not a wallet connection, the list of things
              that can reach it is just "things with a terminal". */}
          <div className="mt-7 flex items-center gap-5">
            <Laptop />
            <Phone />
            <Watch />
            <span className="text-[13px] text-neutral-600">anything with a terminal</span>
          </div>
        </Rise>

        <Rise at={340}>
          <p className="mt-6 text-[16px] leading-relaxed text-neutral-300">
            Now revoke it while you are sitting in that shell.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
            The name stops resolving. The door stops opening. The terminal
            closes by itself — because all three were reading the same boolean
            the whole time.
          </p>
        </Rise>
      </div>

      <Rise at={140}>
        <LiveTerminal />
      </Rise>
    </div>
  );
}

// --- 4 ---------------------------------------------------------------------

function Built() {
  return (
    <Rise at={0}>
      {/* The diagram is the whole slide: full width, shrinking to fit. */}
      <div
        className="relative left-1/2 -translate-x-1/2"
        style={{ width: "min(100vw - 4rem, 1700px)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/diagrams/architecture.svg"
          alt="Harness architecture"
          className="mx-auto w-full object-contain"
          style={{ maxHeight: "calc(100dvh - 6rem)" }}
        />
      </div>
    </Rise>
  );
}


/* Devices, drawn at a weight that sits beside body text rather than shouting.
   They are a list, not an illustration. */
const dev = {
  fill: "none" as const,
  stroke: "#8d97a6",
  strokeWidth: 1.5,
  strokeLinejoin: "round" as const,
};

function Laptop() {
  return (
    <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden {...dev}>
      <rect x="5" y="3" width="24" height="15" rx="2" />
      <path d="M1 22 H33" strokeLinecap="round" />
    </svg>
  );
}

function Phone() {
  return (
    <svg width="18" height="26" viewBox="0 0 18 26" aria-hidden {...dev}>
      <rect x="3" y="2" width="12" height="21" rx="2.5" />
      <path d="M7.6 20 H10.4" strokeLinecap="round" />
    </svg>
  );
}

function Watch() {
  return (
    <svg width="18" height="26" viewBox="0 0 18 26" aria-hidden {...dev}>
      <rect x="4" y="7" width="10" height="11" rx="2.5" />
      <path d="M7 7 V3.5 M11 7 V3.5 M7 18 V21.5 M11 18 V21.5" strokeLinecap="round" />
    </svg>
  );
}

/** Three tiers, which is the whole hierarchy at eighteen pixels. */
function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M9 2.4 L14.6 5.2 L9 8 L3.4 5.2 Z" fill="#f3f4f6" fillOpacity="0.95" />
      <path d="M9 7.2 L14.6 10 L9 12.8 L3.4 10 Z" fill="#9ca3af" fillOpacity="0.7" />
      <path d="M9 12 L14.6 14.8 L9 17.6 L3.4 14.8 Z" fill="#6b7280" fillOpacity="0.5" />
    </svg>
  );
}
