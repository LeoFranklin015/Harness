"use client";

import { useEffect, useState } from "react";

/**
 * The last slide, and the only claim that matters.
 *
 * Everything before this says the system asks rather than caches. This shows
 * it: one field flips on chain, and four things that were reading it stop, one
 * after another, without being told.
 *
 * The stagger is the argument. Instant would read as four things being
 * switched off together by something orchestrating them, which is exactly the
 * design we do not have. Slow enough to read as consequence.
 */

const SURFACES = [
  { name: "Spending", dead: "the executor refuses", who: "AllowanceExecutor" },
  { name: "The name", dead: "nothing to resolve", who: "AgentResolver" },
  { name: "The shell", dead: "closes within 15s", who: "terminal server" },
  { name: "Credentials", dead: "not handed back", who: "the broker" },
] as const;

export function Cascade() {
  const [flipped, setFlipped] = useState(false);
  const [dead, setDead] = useState(0);

  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = [];
    // Long enough that the green "false" registers before it flips. A
    // before-and-after with no before is just an after.
    t.push(setTimeout(() => setFlipped(true), 1600));
    SURFACES.forEach((_, i) => t.push(setTimeout(() => setDead(i + 1), 2300 + i * 380)));
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <div>
      {/* The one field. */}
      <div
        className={`rounded-2xl border px-7 py-6 transition-colors duration-500 ${
          flipped ? "border-red-900/70 bg-red-950/25" : "border-emerald-900/60 bg-emerald-950/15"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-mono text-[13px] text-neutral-400">
            grant · runner.acme.harness.eth
          </p>
          <p className="font-mono text-[15px]">
            <span className="text-neutral-600">revoked = </span>
            <span
              className={`transition-colors duration-500 ${
                flipped ? "text-red-400" : "text-emerald-400"
              }`}
            >
              {flipped ? "true" : "false"}
            </span>
          </p>
        </div>
      </div>

      <p className="py-5 text-center text-[13px] text-neutral-600">
        every one of these was reading that field, the whole time
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SURFACES.map((s, i) => {
          const gone = dead > i;
          return (
            <div
              key={s.name}
              className={`rounded-xl border px-4 py-4 text-center transition-all duration-500 ${
                gone
                  ? "border-neutral-900 bg-neutral-950/40 opacity-45"
                  : "border-emerald-900/50 bg-emerald-950/10"
              }`}
            >
              <p
                className={`text-[15px] font-medium transition-colors duration-500 ${
                  gone ? "text-neutral-600 line-through decoration-neutral-700" : "text-neutral-100"
                }`}
              >
                {s.name}
              </p>
              <p
                className={`mt-1 text-[11px] leading-snug transition-colors duration-500 ${
                  gone ? "text-neutral-700" : "text-emerald-400/70"
                }`}
              >
                {gone ? s.dead : "live"}
              </p>
              <p className="mt-2 font-mono text-[9px] tracking-wide text-neutral-800">{s.who}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
