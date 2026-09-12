"use client";

import { Deck } from "./Deck";
import { LiveTerminal } from "./Terminal";

/**
 * Four slides.
 *
 * What it is, why it needs to exist, the part worth watching, and how it
 * works. In that order, because a room that already knows what you built
 * hears the problem as confirmation rather than as a preamble to sit through.
 */
export default function Pitch() {
  return (
    <Deck
      slides={[<What key="1" />, <Why key="2" />, <Cool key="3" />, <How key="4" />]}
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

function What() {
  return (
    <div>
      <Rise at={0}>
        <div className="mb-8 flex items-center gap-2.5">
          <Mark />
          <span className="text-sm font-medium tracking-tight text-neutral-400">Harness</span>
        </div>
      </Rise>

      <Rise at={90}>
        <h1 className="text-[clamp(2.8rem,7vw,5.6rem)] font-medium leading-[0.97] tracking-[-0.04em] text-neutral-50">
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
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Owned label="COMPUTE" note="someone else's">
              {/* Slots for real marks. Keep them small: big vendor logos turn
                  a diagnosis into an attack. */}
              <div className="flex gap-2">
                {[0, 1, 2].map((n) => (
                  <span
                    key={n}
                    className="h-9 w-9 rounded-lg border border-dashed border-neutral-800"
                  />
                ))}
              </div>
            </Owned>
            <Owned label="KMS" note="someone else's">
              <KeyMark />
            </Owned>
          </div>

          <div className="flex items-center justify-around px-8 text-[11px] text-neutral-700">
            <span>runs on</span>
            <span>signs with</span>
          </div>

          <div className="rounded-xl border border-dashed border-red-950/80 bg-red-950/10 px-5 py-5 text-center">
            <p className="text-[17px] font-medium text-neutral-100">your agent</p>
            <p className="mt-1 text-[12px] text-red-400/70">
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
    <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 px-5 py-5">
      <p className="text-[10px] font-semibold tracking-[0.16em] text-neutral-600">{label}</p>
      <div className="mt-4 flex h-10 items-center">{children}</div>
      <p className="mt-4 text-[11px] text-neutral-700">{note}</p>
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

function How() {
  const asks = [
    ["The name", "resolves, or does not"],
    ["The door", "sshd, at the fingerprint"],
    ["The shell", "re-asks every 15s"],
    ["The money", "before every payment"],
  ];
  return (
    <div>
      <Rise at={0}>
        <h2 className="text-[clamp(1.7rem,3.4vw,2.4rem)] font-medium tracking-[-0.03em] text-neutral-50">
          One tap writes it. Four things ask it.
        </h2>
      </Rise>

      <Rise at={140}>
        <div className="mt-12 rounded-xl border border-amber-900/40 bg-amber-950/10 px-6 py-5 text-center">
          <p className="text-[17px] font-medium text-neutral-100">One grant, on chain</p>
          <p className="mt-1 font-mono text-[12px] text-amber-400/70">
            who it is · what it may call · how much a day · revoked
          </p>
        </div>
      </Rise>

      <Rise at={260}>
        <div className="flex justify-center py-5">
          <div className="flex w-full max-w-[820px] justify-around">
            {asks.map(([n]) => (
              <svg key={n} width="14" height="42" viewBox="0 0 14 42" aria-hidden>
                <path d="M7 42 L7 8" stroke="#9b8cf5" strokeOpacity="0.5" strokeWidth="1.5" />
                <path d="M2.5 13 L7 6 L11.5 13" fill="none" stroke="#9b8cf5" strokeOpacity="0.7" strokeWidth="1.5" />
              </svg>
            ))}
          </div>
        </div>
      </Rise>

      <Rise at={380}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {asks.map(([name, sub]) => (
            <div
              key={name}
              className="rounded-xl border border-violet-950/70 bg-violet-950/15 px-4 py-4 text-center"
            >
              <p className="text-[15px] font-medium text-neutral-100">{name}</p>
              <p className="mt-1 text-[11px] leading-snug text-violet-300/50">{sub}</p>
            </div>
          ))}
        </div>
      </Rise>

      <Rise at={520}>
        <p className="mt-11 border-t border-neutral-900 pt-6 text-[15px] leading-relaxed text-neutral-500">
          Nothing keeps a copy of the answer — so one more tap makes all four say
          no, for every client, not just ours.
          <span className="mt-2 block font-mono text-[11px] tracking-wide text-neutral-700">
            ENSv2 · Ledger Key Ring · EIP-7702 · x402 · Tailscale · 60 contract tests · live on Sepolia
          </span>
        </p>
      </Rise>
    </div>
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
