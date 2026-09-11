"use client";

import { DELEGATE, MIN_APP_VERSION, atLeast } from "@/lib/delegation";
import { Batch } from "./Batch";

/**
 * Offered once, never forced.
 *
 * Adding code to the account that roots every machine you own is the most
 * consequential thing on this page, so it says plainly what it does, who wrote
 * the contract, and that declining costs nothing but three extra taps later.
 *
 * The claim is a count — four approvals or one — and a count is what prose is
 * worst at making felt. So the page is built around the drawing, and the words
 * only have to name the four calls the drawing is stacking.
 */

/** What the four approvals actually are, in the order they are sent. */
const CALLS = [
  ["Executor", "where the machine's money comes from"],
  ["Host record", "its address and who may ssh in"],
  ["Allowance", "how much of your USDC it may draw"],
  ["Ceiling", "the daily limit, which mints the name"],
];

export function UpgradeAccount({
  address,
  appVersion,
  busy,
  step,
  error,
  onUpgrade,
  onSkip,
}: {
  address: string;
  appVersion: string | null;
  busy: boolean;
  step: string | null;
  error: string | null;
  onUpgrade: () => void;
  onSkip: () => void;
}) {
  // An older app has no entry for this contract and will refuse to sign, so say
  // so instead of walking someone into a rejection they cannot read.
  const tooOld = appVersion !== null && !atLeast(appVersion, MIN_APP_VERSION);

  return (
    <main className="relative min-h-dvh overflow-hidden bg-black">
      <header className="relative z-10 mx-auto flex w-full max-w-[1100px] items-center px-7 py-7 lg:px-10">
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[14px] font-medium tracking-tight text-neutral-100">Harness</span>
        </div>
      </header>

      <section className="relative mx-auto grid w-full max-w-[1060px] items-center gap-14 px-7 pb-16 lg:min-h-[calc(100dvh-7rem)] lg:grid-cols-[34rem_1fr] lg:gap-10 lg:px-10">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-600">
            Optional
          </p>
          <h1 className="mt-3 text-[clamp(1.9rem,3.4vw,2.6rem)] font-medium leading-[1.05] tracking-[-0.03em] text-neutral-50">
            Sign once instead
            <br />
            of four times.
          </h1>

          <p className="mt-5 max-w-[30rem] text-[15px] leading-[1.65] text-neutral-400">
            Setting up a machine takes four approvals, because an ordinary
            account can only do one thing per transaction. Your Ledger can give
            this account the ability to do them together.
          </p>

          <ol className="mt-7 border-y border-neutral-900">
            {CALLS.map(([name, what], i) => (
              <li
                key={name}
                className="flex items-baseline gap-3 border-neutral-900 py-2.5 text-sm [&:not(:first-child)]:border-t"
              >
                <span className="w-3 shrink-0 font-mono text-[11px] text-neutral-700">{i + 1}</span>
                <span className="w-28 shrink-0 text-neutral-200">{name}</span>
                <span className="text-[13px] leading-snug text-neutral-600">{what}</span>
              </li>
            ))}
          </ol>

          <dl className="mt-6 space-y-2.5 text-[13px]">
            <Row label="Account">{address}</Row>
            <Row label="Will run">
              Simple7702Account
              <span className="mt-0.5 block text-[11px] text-neutral-700">{DELEGATE}</span>
            </Row>
            <Row label="Costs" mono={false}>
              nothing, we pay the gas
            </Row>
          </dl>

          <p className="mt-6 max-w-[30rem] text-xs leading-relaxed text-neutral-600">
            This is the one contract your Ledger will accept for this, and it is
            not ours: the reference account from the ERC-4337 team, on
            Ledger&apos;s own whitelist. Only the account itself can use it, and
            you can undo it later.
          </p>

          {tooOld && (
            <Notice tone="amber">
              Your Ethereum app is {appVersion}. This needs {MIN_APP_VERSION} or newer, so the
              device would refuse. Update it in Ledger Live, or continue without it.
            </Notice>
          )}

          {error && (
            <Notice tone="red" role="alert">
              {error}
            </Notice>
          )}

          {busy && step && (
            <p
              className="mt-5 flex items-center gap-2 text-sm text-neutral-400"
              role="status"
              aria-live="polite"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
              {step}
            </p>
          )}

          <div className="mt-8 flex items-center gap-3">
            <button
              onClick={onUpgrade}
              disabled={busy || tooOld}
              className="group relative overflow-hidden rounded-full bg-neutral-50 px-6 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="relative z-10">
                {busy ? "On the device…" : "Make it one signature"}
              </span>
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </button>
            <button
              onClick={onSkip}
              disabled={busy}
              className="rounded-full px-4 py-2 text-sm text-neutral-500 transition hover:text-neutral-200 disabled:opacity-40"
            >
              Not now
            </button>
          </div>
        </div>

        <figure className="order-first lg:order-none">
          <Batch className="mx-auto w-[240px] lg:w-[300px]" />
          <figcaption className="mt-2 text-center text-[11px] uppercase tracking-[0.18em] text-neutral-700">
            four calls, one tap
          </figcaption>
        </figure>
      </section>
    </main>
  );
}

function Row({
  label,
  children,
  mono = true,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-20 shrink-0 text-neutral-700">{label}</dt>
      <dd className={`min-w-0 break-all text-neutral-400 ${mono ? "font-mono text-[12px]" : ""}`}>
        {children}
      </dd>
    </div>
  );
}

function Notice({
  tone,
  children,
  role,
}: {
  tone: "amber" | "red";
  children: React.ReactNode;
  role?: string;
}) {
  const skin =
    tone === "amber"
      ? "border-amber-900/50 bg-amber-950/30 text-amber-300/90"
      : "border-red-900/50 bg-red-950/30 text-red-400/90";
  return (
    <p className={`mt-5 rounded-lg border px-4 py-2.5 text-sm ${skin}`} role={role}>
      {children}
    </p>
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
