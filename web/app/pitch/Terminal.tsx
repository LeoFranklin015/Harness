"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The demo, running, on the slide.
 *
 * Slide three used to say "then the shell closes by itself". A sentence about
 * a thing closing is not the thing closing. This types the command, opens the
 * shell, and then kills it — which is the whole product in eight seconds and
 * the one moment worth putting on a screen.
 *
 * It restarts when the slide is re-entered, because a deck gets walked
 * backwards and a demo that only works once is a demo you cannot re-run in
 * front of the person who asked.
 */

type Line = { text: string; tone?: "dim" | "ok" | "warn"; delay: number };

const SCRIPT: Line[] = [
  { text: "$ ssh runner.acme.harness.eth", delay: 0 },
  { text: "resolving over DNS · 100.71.4.19", tone: "dim", delay: 1500 },
  { text: "host key from the chain · ok", tone: "dim", delay: 2100 },
  { text: "fingerprint admitted · ok", tone: "dim", delay: 2600 },
  { text: "", delay: 3000 },
  { text: "runner@acme:~$ agent status", delay: 3300 },
  { text: "working · $4.25 of $10.00 spent today", tone: "ok", delay: 4200 },
  { text: "", delay: 4600 },
  { text: "◆ revoke — one tap on the Ledger", tone: "warn", delay: 5600 },
  { text: "", delay: 6100 },
  { text: "Connection to runner.acme.harness.eth closed.", tone: "warn", delay: 6900 },
];

const TYPED = 0; // which line types character by character

export function LiveTerminal() {
  const [shown, setShown] = useState(0);
  const [typed, setTyped] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const at = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

    // The first line is typed; the rest arrive as the machine answers.
    const cmd = SCRIPT[TYPED]!.text;
    for (let n = 0; n <= cmd.length; n++) at(() => setTyped(n), 260 + n * 42);
    SCRIPT.forEach((l, n) => at(() => setShown(n + 1), l.delay + 900));

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  const colour = (t?: Line["tone"]) =>
    t === "dim"
      ? "text-neutral-600"
      : t === "ok"
        ? "text-emerald-400/90"
        : t === "warn"
          ? "text-amber-400/90"
          : "text-neutral-200";

  const dead = shown >= SCRIPT.length;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-black/60 backdrop-blur transition-colors duration-500 ${
        dead ? "border-amber-900/40" : "border-neutral-800"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-neutral-900 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-neutral-800" />
        <span className="h-2 w-2 rounded-full bg-neutral-800" />
        <span className="h-2 w-2 rounded-full bg-neutral-800" />
        <p className="ml-2 font-mono text-[11px] tracking-wider text-neutral-700">
          {dead ? "closed" : "runner.acme.harness.eth"}
        </p>
      </div>

      <div className="min-h-[280px] px-5 py-4 font-mono text-[14px] leading-[1.85] sm:text-[15px]">
        {SCRIPT.slice(0, shown).map((l, n) => (
          <p key={n} className={colour(l.tone)}>
            {n === TYPED ? l.text.slice(0, typed) : l.text}
            {n === TYPED && typed < l.text.length && (
              <span className="ml-0.5 inline-block h-[1.1em] w-[8px] translate-y-[2px] bg-neutral-300" />
            )}
            {l.text === "" ? " " : ""}
          </p>
        ))}
      </div>
    </div>
  );
}
