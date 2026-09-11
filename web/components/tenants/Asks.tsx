"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * What an agent stopped and asked for.
 *
 * A ceiling that can be argued with is not a ceiling, so an agent that runs
 * out cannot raise it, retry past it, or route around it. What it can do is
 * say what it wanted and why, and wait — and this is where that arrives.
 *
 * Nothing here has been granted. Reading an ask costs nothing and approving
 * one means signing a new Grant on the device, which is the only thing that
 * has ever moved a ceiling. Declining just forgets it: the record of what was
 * decided is the chain, not a list of settled requests kept alongside it.
 */

export type Ask = {
  id: string;
  tenant: string;
  label: string;
  want: string;
  why: string;
  usd: number;
  asked: number;
  /** "transfer" when approving is simply making the payment. */
  kind?: "transfer" | "note";
  to?: string;
};

export function Asks({
  tenant,
  agent,
  currentCapUsd,
  onApprove,
}: {
  tenant: string;
  /** Scope to one agent's asks; a machine can hold several. */
  agent?: string;
  /** Today's ceiling, so a raise can be expressed as a new total. */
  currentCapUsd: number;
  /** Signs a new Grant at the higher ceiling. Resolves once it has landed. */
  onApprove: (ask: Ask) => Promise<void>;
}) {
  const [asks, setAsks] = useState<Ask[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/asks?tenant=${encodeURIComponent(tenant)}${agent ? `&agent=${encodeURIComponent(agent)}` : ""}`,
      );
      const body = await res.json();
      setAsks(Array.isArray(body.asks) ? body.asks : []);
    } catch {
      // A machine with no asks and a machine we could not reach look the same
      // from here, and neither is worth a red banner on the page.
    }
  }, [tenant, agent]);

  // Polled rather than pushed: an agent asks rarely, a person is not watching
  // closely, and a websocket for this would be machinery without a purpose.
  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  async function settle(ask: Ask) {
    await fetch(`/api/asks?tenant=${encodeURIComponent(ask.tenant)}&id=${encodeURIComponent(ask.id)}`, {
      method: "DELETE",
    });
    setAsks((all) => all.filter((a) => a.id !== ask.id));
  }

  async function approve(ask: Ask) {
    setBusy(ask.id);
    setError(null);
    try {
      // Raise the ceiling by what was asked for, rather than to some round
      // number: the agent said what it needed, and granting more than that
      // without being asked is not generosity, it is inattention.
      await onApprove(ask);
      await settle(ask);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (asks.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-amber-900/40 bg-amber-950/10 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-600/80">
        {asks.length === 1 ? "the agent is asking" : `${asks.length} things the agent is asking for`}
      </p>

      {asks.map((ask) => (
        <div key={ask.id} className="mt-3 border-t border-amber-900/20 pt-3 first:border-0 first:pt-1">
          <p className="text-sm leading-snug text-neutral-200">{ask.want}</p>
          {ask.why && <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{ask.why}</p>}

          <p className="mt-2 font-mono text-[11px] text-neutral-400">
            ${ask.usd.toFixed(2)}
            <span className="text-neutral-600">
              {" "}
              {ask.kind === "transfer"
                ? "· you send it, once, from your own account"
                : `· would raise the ceiling to $${(currentCapUsd + ask.usd).toFixed(2)}`}
            </span>
          </p>

          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => approve(ask)}
              disabled={busy !== null}
              className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900/60 disabled:opacity-40"
            >
              {busy === ask.id
                ? "on the device…"
                : ask.kind === "transfer"
                  ? "Pay it on the Ledger"
                  : "Approve on the Ledger"}
            </button>
            <button
              onClick={() => settle(ask)}
              disabled={busy !== null}
              className="rounded-full px-3 py-1 text-xs text-neutral-500 transition hover:text-neutral-300 disabled:opacity-40"
            >
              Decline
            </button>
          </div>
        </div>
      ))}

      {error && <p className="mt-3 text-[11px] leading-relaxed text-amber-400/90">{error}</p>}

      <p className="mt-3 text-[11px] leading-relaxed text-neutral-600">
        Asking granted nothing. A payment you approve here is made by you, once
        — the agent&apos;s ceiling does not move, so saying yes to an invoice
        does not quietly widen what it may do tomorrow.
      </p>
    </div>
  );
}
