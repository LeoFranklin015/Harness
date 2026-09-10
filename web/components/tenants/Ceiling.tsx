"use client";

import { useEffect } from "react";
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
export function Ceiling({ capUsd, spentUsd }: { capUsd: number; spentUsd?: number }) {
  const still = useReducedMotion();
  const known = typeof spentUsd === "number" && capUsd > 0;
  const fraction = known ? Math.min(1, spentUsd! / capUsd) : 1;

  // Springs rather than tweens: a limit filling up should settle, not arrive.
  const progress = useSpring(0, { stiffness: 90, damping: 20, mass: 0.6 });
  const counter = useMotionValue(0);
  const shown = useTransform(counter, (v) => `$${v.toFixed(2)}`);
  const width = useTransform(progress, (v) => `${v * 100}%`);

  useEffect(() => {
    if (still) {
      progress.jump(fraction);
      counter.jump(known ? spentUsd! : capUsd);
      return;
    }
    progress.set(fraction);
    const to = known ? spentUsd! : capUsd;
    // Counting is tied to the same spring so the number and the bar cannot
    // disagree, which is what makes it read as one quantity.
    return progress.on("change", (v) => counter.set(fraction === 0 ? to : (v / fraction) * to));
  }, [fraction, capUsd, spentUsd, known, still, progress, counter]);

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
