"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/lib/poll";

/**
 * What the machine has actually done.
 *
 * A ceiling with no history is a claim; a list of payments under it is the
 * evidence. Every row carries its hash, because the row is a convenience and
 * the chain is the record — anyone doubting one can go and check it, which is
 * the only reason showing it here is defensible at all.
 */

type Spend = {
  kind: "sent" | "escalated";
  usd: number;
  to: string;
  hash: string;
  why?: string;
  at: string;
};

export function Activity({ tenant, agent }: { tenant: string; agent: string }) {
  const [spends, setSpends] = useState<Spend[] | null>(null);

  useEffect(() => {
    let stop = false;
    const ask = () =>
      getJson<{ spends: Spend[] }>(`/api/activity?tenant=${tenant}&label=${agent}`).then(
        (d) => !stop && d && setSpends(d.spends ?? []),
      );
    ask();
    const every = setInterval(ask, 20_000);
    return () => {
      stop = true;
      clearInterval(every);
    };
  }, [tenant, agent]);

  return (
    <div>
      <p className="mb-3 text-[10px] uppercase tracking-wider text-neutral-600">Payments</p>

      {spends === null && <p className="text-xs text-neutral-700">Reading…</p>}

      {spends?.length === 0 && (
        <p className="text-xs leading-relaxed text-neutral-700">
          Nothing yet. Payments appear here the moment the agent makes one.
        </p>
      )}

      {spends && spends.length > 0 && (
        <ul className="divide-y divide-neutral-900/80">
          {spends.map((s) => (
            <li key={s.hash} className="flex items-center gap-3 py-2.5">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  s.kind === "escalated" ? "bg-amber-400/80" : "bg-[#C89A34]"
                }`}
                title={s.kind === "escalated" ? "signed by the owner" : "inside the ceiling"}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-xs text-neutral-200">
                  ${s.usd.toFixed(2)}
                  <span className="text-neutral-600"> → {s.to.slice(0, 10)}…</span>
                </span>
                {s.why && <span className="block truncate text-[11px] text-neutral-600">{s.why}</span>}
              </span>
              <a
                href={`https://sepolia.etherscan.io/tx/${s.hash}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 font-mono text-[10px] text-neutral-700 transition hover:text-neutral-400"
                onClick={(e) => e.stopPropagation()}
              >
                {s.hash.slice(0, 8)}↗
              </a>
              <span className="shrink-0 text-[10px] text-neutral-700">{ago(s.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ago(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}
