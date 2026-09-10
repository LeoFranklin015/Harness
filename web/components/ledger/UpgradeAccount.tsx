"use client";

import { DELEGATE, MIN_APP_VERSION, atLeast } from "@/lib/delegation";

/**
 * Offered once, never forced.
 *
 * Adding code to the account that roots every machine you own is the most
 * consequential thing on this page, so it says plainly what it does, who wrote
 * the contract, and that declining costs nothing but three extra taps later.
 */
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
    <div className="flex min-h-dvh items-center justify-center px-6 py-14">
      <div className="w-full max-w-lg">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
          <span className="h-px w-8 bg-neutral-700" />
          Harness
        </div>

        <h1 className="text-2xl font-medium tracking-tight text-neutral-50">
          Sign once instead of four times
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-neutral-400">
          Setting up a machine takes four separate approvals, because an ordinary
          account can only do one thing per transaction. Your Ledger can give
          this account the ability to do them together, and then it is one.
        </p>

        <dl className="mt-7 space-y-3 border-y border-neutral-900 py-5 text-sm">
          <Row label="Account">
            <span className="font-mono text-xs">{address}</span>
          </Row>
          <Row label="Will run">
            <span className="font-mono text-xs">Simple7702Account</span>
            <span className="mt-0.5 block font-mono text-[11px] text-neutral-600">{DELEGATE}</span>
          </Row>
          <Row label="Costs you">nothing — we pay the gas, you approve on the device</Row>
        </dl>

        <p className="mt-5 text-xs leading-relaxed text-neutral-600">
          This is the one contract your Ledger will accept for this, and it is
          not ours: it is the reference account from the ERC-4337 team, on
          Ledger&apos;s own whitelist. It can only be used by the account itself,
          and you can undo it later.
        </p>

        {tooOld && (
          <p className="mt-5 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-300/90">
            Your Ethereum app is {appVersion}. This needs {MIN_APP_VERSION} or newer, so the
            device would refuse. Update it in Ledger Live, or continue without it.
          </p>
        )}

        {error && (
          <p className="mt-5 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-2.5 text-sm text-red-400/90" role="alert">
            {error}
          </p>
        )}

        {busy && step && (
          <p className="mt-5 flex items-center gap-2 text-sm text-neutral-400" role="status" aria-live="polite">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
            {step}
          </p>
        )}

        <div className="mt-8 flex items-center gap-3">
          <button
            onClick={onUpgrade}
            disabled={busy || tooOld}
            className="rounded-full bg-neutral-50 px-5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Upgrade this account
          </button>
          <button
            onClick={onSkip}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm text-neutral-400 transition hover:text-neutral-200 disabled:opacity-40"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <dt className="shrink-0 text-neutral-600">{label}</dt>
      <dd className="text-right text-neutral-300">{children}</dd>
    </div>
  );
}
