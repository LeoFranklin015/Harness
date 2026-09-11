"use client";

import { DELEGATE, MIN_APP_VERSION, atLeast } from "@/lib/delegation";
import { Batch } from "./Batch";

/**
 * Offered once, never forced.
 *
 * A modal rather than a page: it is an improvement to how the next step
 * behaves, not a step of its own, and putting it on its own screen made it
 * look like something that had to be dealt with before continuing.
 *
 * The claim is a count — four transactions or one — which is what prose is
 * worst at making felt, so the drawing does that part and the words stay out
 * of its way.
 */
export function UpgradeAccount({
  appVersion,
  busy,
  step,
  error,
  onUpgrade,
  onSkip,
}: {
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onSkip}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-6 duration-200 animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-6">
          <figure className="hidden shrink-0 sm:block">
            <Batch className="w-[124px]" />
            <figcaption className="mt-1 text-center text-[9px] uppercase tracking-[0.16em] text-neutral-700">
              four into one
            </figcaption>
          </figure>

          <div className="min-w-0">
            <h2 className="text-lg font-medium tracking-tight text-neutral-50">
              Upgrade to 7702
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              Setting up a machine takes four transactions today, because an
              ordinary account can only do one thing at a time. With this it is
              one, and you approve it once instead of four times.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-neutral-600">
              Your Ledger signs a one-off authorisation and we pay the gas. The
              contract is{" "}
              <span className="font-mono text-neutral-500">Simple7702Account</span>, the
              ERC-4337 team&apos;s reference account and the only one your device
              accepts. You can undo it later.
            </p>
            <p className="mt-2 break-all font-mono text-[10px] text-neutral-700">{DELEGATE}</p>
          </div>
        </div>

        {tooOld && (
          <p className="mt-4 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3.5 py-2 text-xs text-amber-300/90">
            Your Ethereum app is {appVersion}. This needs {MIN_APP_VERSION} or newer, so the
            device would refuse. Update it in Ledger Live, or carry on without it.
          </p>
        )}

        {error && (
          <p
            className="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 px-3.5 py-2 text-xs text-red-400/90"
            role="alert"
          >
            {error}
          </p>
        )}

        {busy && step && (
          <p
            className="mt-4 flex items-center gap-2 text-sm text-neutral-400"
            role="status"
            aria-live="polite"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
            {step}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onSkip}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm text-neutral-500 transition hover:text-neutral-200 disabled:opacity-40"
          >
            Not now
          </button>
          <button
            onClick={onUpgrade}
            disabled={busy || tooOld}
            className="rounded-full bg-neutral-50 px-5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "On the device…" : "Upgrade"}
          </button>
        </div>
      </div>
    </div>
  );
}
