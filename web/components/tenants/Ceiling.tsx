"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

/**
 * The ceiling, and how much of it is gone.
 *
 * A number in a row states the limit. A bar filling states that the limit is
 * a thing being consumed — which is the idea the rest of the product depends
 * on, and the reason an Agent asks a person for a signature rather than
 * simply failing.
 *
 * `spentUsd` is optional on purpose: the dashboard knows what the device
 * signed, and only the broker knows what has been drawn against it. When it
 * is not known the track fills to full to show the allowance that was set,
 * rather than inventing a consumed portion.
 */
export function Ceiling({
  capUsd,
  spentUsd,
  tenant,
  agent,
}: {
  capUsd: number;
  spentUsd?: number;
  /** Given both, the meter asks the chain itself and keeps asking. */
  tenant?: string;
  agent?: string | null;
}) {
  const still = useReducedMotion();
  const polled = useSpend(tenant, agent);
  const spent = spentUsd ?? polled;
  const known = typeof spent === "number" && capUsd > 0;
  const fraction = known ? Math.min(1, spent! / capUsd) : 1;

  // Springs rather than tweens: a limit filling up should settle, not arrive.
  const progress = useSpring(0, { stiffness: 90, damping: 20, mass: 0.6 });
  const counter = useMotionValue(0);
  const shown = useTransform(counter, (v) => `$${v.toFixed(2)}`);
  const width = useTransform(progress, (v) => `${v * 100}%`);

  useEffect(() => {
    if (still) {
      progress.jump(fraction);
      counter.jump(known ? spent! : capUsd);
      return;
    }
    progress.set(fraction);
    const to = known ? spent! : capUsd;
    // Counting is tied to the same spring so the number and the bar cannot
    // disagree, which is what makes it read as one quantity.
    return progress.on("change", (v) => counter.set(fraction === 0 ? to : (v / fraction) * to));
  }, [fraction, capUsd, spent, known, still, progress, counter]);

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-neutral-600">{known ? "Spent" : "Ceiling"}</span>
        <span className="font-mono text-xs text-neutral-300">
          <motion.span>{shown}</motion.span>
          {known && <span className="text-neutral-600"> / ${capUsd.toFixed(2)}</span>}
        </span>
      </div>

      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-900">
        <motion.div
          style={{ width }}
          className={`h-full rounded-full ${
            known && fraction > 0.85 ? "bg-amber-500/80" : "bg-emerald-500/70"
          }`}
        />
      </div>
    </div>
  );
}

/**
 * What the chain says has been spent, refreshed.
 *
 * Polled rather than pushed: a spend is a transaction somebody else's Agent
 * made, there is no socket between here and it, and the interesting case —
 * watching a payment land while looking at the page — is worth a request
 * every few seconds. Undefined until the first answer, so the bar shows the
 * allowance rather than briefly claiming nothing has been spent.
 */
function useSpend(tenant?: string, agent?: string | null): number | undefined {
  const [spent, setSpent] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!tenant || !agent) return;
    let stop = false;

    const ask = async () => {
      try {
        const r = await fetch(`/api/spend?tenant=${tenant}&label=${agent}`, { cache: "no-store" });
        if (!r.ok) return;
        const { spentUsd } = (await r.json()) as { spentUsd?: number };
        if (!stop && typeof spentUsd === "number") setSpent(spentUsd);
      } catch {
        // An RPC having a bad minute is not news. Keep the last good answer.
      }
    };

    ask();
    const every = setInterval(ask, 8_000);
    return () => {
      stop = true;
      clearInterval(every);
    };
  }, [tenant, agent]);

  return spent;
}
