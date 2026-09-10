"use client";

import { useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import type { Session } from "@/lib/session";

/**
 * This tab holds the Ledger for shells that cannot.
 *
 * Approving something from an ssh session needs a signature, and the box has
 * no device — it is a cloud VM whose only USB devices are QEMU's keyboard and
 * mouse. Something on a machine with the Ledger has to sign.
 *
 * That something can be this page. The browser already has WebHID and the
 * device is already connected, so a tab that is open anyway can answer for a
 * shell somewhere else. No install, no port forward, no second terminal —
 * which matters because the person holding the device is often not the person
 * who set this up.
 *
 * It polls rather than listens, so nothing about the page has to be reachable.
 * The device still shows every transaction and still needs the button pressed;
 * this only decides which screen the request appears on.
 *
 * Holding starts on a click, and has to. A page refresh remembers the address
 * and not the open device, and WebHID will not reopen one from a timer — a
 * browser only hands over a device in response to something a person did. The
 * first version tried anyway, failed silently in the background, and answered
 * a real request with a refusal nobody could see the reason for.
 */

type Job = {
  id: string;
  tenant: string;
  expect: string;
  to: Hex;
  data: Hex;
  what: string;
};

export function DeviceHolder({
  session,
  tenants,
  authority,
}: {
  session: Session;
  /** Which machines this tab will answer for. */
  tenants: string[];
  /** The address this device signs as, so a mismatch is refused not signed. */
  authority: string;
}) {
  const [busy, setBusy] = useState<Job | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref rather than state: the polling loop closes over this once and must
  // see the current list, not the list as it was when the loop started.
  const watching = useRef(tenants);
  watching.current = tenants;

  useEffect(() => {
    if (tenants.length === 0 || !holding) return;
    let stopped = false;

    async function answer(job: Job) {
      setBusy(job);
      let body: Record<string, unknown>;
      try {
        // The queue says which account must sign. Refusing here costs
        // nothing; signing the wrong one costs a revert somebody already
        // confirmed and paid for.
        if (job.expect && job.expect.toLowerCase() !== authority.toLowerCase()) {
          throw new Error(`this device is ${authority}, but that machine answers to ${job.expect}`);
        }
        const dev = await session.device(() => {});
        const receipt = await dev.send({ to: job.to, data: job.data }, () => {});
        body = { id: job.id, ok: true, result: { hash: receipt?.transactionHash } };
        setLast(`signed — ${job.what}`);
      } catch (err) {
        // Say why, always. A refusal with no reason is what sent somebody
        // looking at the chain for a payment that had never been attempted.
        const why = (err as Error)?.message || String(err) || "the device did not sign it";
        body = { id: job.id, ok: false, error: why };
        setLast(`refused — ${why}`);
        setError(why);
      } finally {
        setBusy(null);
      }

      await fetch("/api/sign", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    }

    // One long poll per machine, each looping on its own. A handful of
    // held-open requests is cheaper than a timer that wakes to find nothing.
    async function watch(tenant: string) {
      while (!stopped) {
        if (!watching.current.includes(tenant)) return;
        try {
          const res = await fetch(`/api/sign/next?tenant=${encodeURIComponent(tenant)}`);
          const { job } = (await res.json()) as { job?: Job };
          if (job && !stopped) await answer(job);
        } catch {
          // The poll window closing looks the same as a hiccup; either way
          // the answer is to ask again.
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }

    for (const t of tenants) void watch(t);
    return () => {
      stopped = true;
    };
  }, [tenants.join(","), authority, holding]);

  if (tenants.length === 0) return null;

  async function startHolding() {
    setError(null);
    try {
      // The click is the point: this is the gesture that lets the browser
      // hand over the device, and everything afterwards reuses the handle.
      await session.device(() => {});
      setHolding(true);
    } catch (err) {
      setError((err as Error)?.message || "could not open the Ledger");
    }
  }

  if (!holding) {
    return (
      <div className="mt-6">
        <button
          onClick={startHolding}
          className="rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900/60"
        >
          Hold my Ledger for {tenants.length === 1 ? tenants[0] : `${tenants.length} machines`}
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-600">
          Lets an agent put a payment in front of this device when it runs out
          of ceiling. Nothing signs without you.
        </p>
        {error && <p className="mt-2 text-[11px] text-amber-400/90">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-6 flex items-start gap-2.5 text-[11px] leading-relaxed text-neutral-600">
      <span
        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${busy ? "bg-amber-400" : "bg-emerald-600/70"}`}
      />
      <p>
        {busy ? (
          <>
            <span className="text-neutral-300">{busy.what}</span> — confirm on the
            Ledger.
          </>
        ) : (
          <>
            This tab is holding your Ledger for{" "}
            {tenants.length === 1 ? tenants[0] : `${tenants.length} machines`}. A
            shell elsewhere can ask it to sign — you will see the request here
            and on the device.
          </>
        )}
        {last && !busy && (
          <span className={`block ${error ? "text-amber-400/90" : "text-neutral-700"}`}>{last}</span>
        )}
      </p>
    </div>
  );
}
