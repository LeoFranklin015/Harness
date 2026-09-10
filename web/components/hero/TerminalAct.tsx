"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The machine, working.
 *
 * Real output, not invented: these are lines the system actually prints, with
 * the transaction hashes it actually produced. A hero showing made-up output is
 * a hero saying the product does not work yet.
 *
 * The order is the argument. The ring comes first because everything after it
 * is sealed by it — the Agent Key that signs the payment and the host key that
 * answers the connection both live under a secret only this Ledger can
 * recover. Then the Agent spends, then someone reaches it, then one
 * transaction ends all three.
 */

type Line = { text: string; tone?: Tone; pause?: number };
type Tone = "dim" | "ok" | "warn" | "cmd" | "head";

export const SCRIPT: Line[] = [
  { text: "wallet-cli ring init --name leo-runner", tone: "cmd" },
  { text: "  confirm on your Ledger …", tone: "dim", pause: 620 },
  { text: "  ring created · 1 member", tone: "ok" },
  { text: "  agent root sealed — recoverable from the seed, nowhere else", tone: "dim", pause: 560 },
  { text: "", pause: 180 },

  { text: "harness grant research.leo.harness.eth --cap 10 USDC/day", tone: "cmd" },
  { text: "  approved on device · minted research.leo.harness.eth", tone: "ok", pause: 620 },
  { text: "", pause: 180 },

  { text: "agent research.leo.harness.eth", tone: "cmd" },
  { text: "  402 Payment Required — $0.25 to 0x…dEaD", tone: "dim" },
  { text: "  x402 exact/eip155:11155111", tone: "dim", pause: 320 },
  { text: "  funded under the Grant   0xefb45c20…", tone: "ok" },
  { text: "  settled by facilitator   0x946ea61d…", tone: "ok", pause: 560 },
  { text: "  served: \"42\"", tone: "ok", pause: 620 },
  { text: "", pause: 180 },

  { text: "ssh research.leo.harness.eth", tone: "cmd" },
  { text: "  host key from ENS · authorised by ENS", tone: "dim", pause: 300 },
  { text: "  runner@research.leo.harness.eth", tone: "ok", pause: 700 },
  { text: "", pause: 200 },

  { text: "harness revoke research.leo.harness.eth", tone: "cmd", pause: 700 },
  { text: "  one transaction", tone: "warn", pause: 460 },
  { text: "", pause: 160 },

  { text: "agent research.leo.harness.eth", tone: "cmd" },
  { text: "  refused: no authority to spend", tone: "warn", pause: 260 },
  { text: "ssh research.leo.harness.eth", tone: "cmd" },
  { text: "  publishes no host key — revoked", tone: "warn" },
  { text: "  Host key verification failed.", tone: "warn" },
];

const TONE: Record<Tone, string> = {
  cmd: "text-neutral-100",
  head: "text-sky-300/90",
  dim: "text-neutral-500",
  ok: "text-emerald-400/85",
  warn: "text-amber-400/85",
};

export function TerminalAct({ running, height = 300 }: { running: boolean; height?: number }) {
  const [shown, setShown] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!running) return;
    let i = 0;

    function next() {
      if (i >= SCRIPT.length) return;
      const line = SCRIPT[i]!;
      i += 1;
      setShown(i);
      // A pause after a line is the beat where something happened off screen: a
      // transaction confirming, a device being tapped.
      timer.current = setTimeout(next, line.pause ?? 175);
    }

    timer.current = setTimeout(next, 200);
    return () => clearTimeout(timer.current);
  }, [running]);

  // The last lines matter most, so the view sticks to the bottom.
  const visible = SCRIPT.slice(0, shown).slice(-14);

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-white/10 bg-[#060709] px-4 py-3 font-mono text-[10px] leading-[1.55]"
      style={{ height }}
    >

      <div className="flex h-full flex-col justify-end">
        {visible.map((l, i) => (
          <p key={i} className={`${TONE[l.tone ?? "dim"]} truncate`}>
            {l.text || " "}
          </p>
        ))}
        {shown < SCRIPT.length && shown > 0 && (
          <span className="mt-0.5 inline-block h-3 w-[6px] animate-pulse bg-neutral-400" />
        )}
      </div>
    </div>
  );
}
