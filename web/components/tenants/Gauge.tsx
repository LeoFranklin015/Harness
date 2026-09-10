"use client";

import { useEffect } from "react";
import { animate, useMotionValue, useReducedMotion, useTransform, motion } from "framer-motion";

/**
 * Spent against allowed, as an arc.
 *
 * A number states the limit; an arc states that the limit is a thing being
 * consumed, which is the idea the whole product rests on. The arc is not a
 * full circle on purpose — it opens at the bottom, so the gap reads as
 * headroom rather than as a ring that happens to be incomplete.
 *
 * The figure counts on the same spring that draws the arc, so the two cannot
 * disagree. Both are driven from one value for that reason.
 */

/** Degrees of sweep. 270 leaves a quarter open at the bottom. */
const SWEEP = 270;
const START = 135;
const R = 52;

export function Gauge({
  spentUsd,
  capUsd,
  windowEnds,
}: {
  spentUsd: number | null;
  capUsd: number;
  /** Unix seconds the current window closes, if it is open. */
  windowEnds?: number | null;
}) {
  const still = useReducedMotion();
  const known = spentUsd !== null && capUsd > 0;
  const fraction = known ? Math.min(1, spentUsd! / capUsd) : 0;

  const v = useMotionValue(0);
  const dash = useTransform(v, (t) => `${(t * SWEEP * R * Math.PI) / 180} ${2 * Math.PI * R}`);
  const shown = useTransform(v, (t) => `$${(t * (known ? spentUsd! : 0)).toFixed(2)}`);

  useEffect(() => {
    if (still) {
      v.jump(fraction);
      return;
    }
    const run = animate(v, fraction, { type: "spring", stiffness: 70, damping: 18, mass: 0.7 });
    return () => run.stop();
  }, [fraction, still, v]);

  const hot = fraction > 0.85;
  const left = known ? Math.max(0, capUsd - spentUsd!) : capUsd;

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-[132px] w-[132px] shrink-0">
        <svg viewBox="-66 -66 132 132" className="h-full w-full -rotate-90">
          {/* The track. Drawn once, at the full sweep. */}
          <circle
            r={R}
            fill="none"
            stroke="#1B1F25"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={`${(SWEEP * R * Math.PI) / 180} ${2 * Math.PI * R}`}
            transform={`rotate(${START})`}
          />
          <motion.circle
            r={R}
            fill="none"
            stroke={hot ? "#E0A33A" : "#C89A34"}
            strokeWidth={7}
            strokeLinecap="round"
            style={{ strokeDasharray: dash }}
            transform={`rotate(${START})`}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span className="font-mono text-xl text-neutral-100">
            {known ? shown : "—"}
          </motion.span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wider text-neutral-600">spent</span>
        </div>
      </div>

      <dl className="min-w-0 space-y-3 text-sm">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-neutral-600">Ceiling</dt>
          <dd className="font-mono text-neutral-200">${capUsd.toFixed(2)} / day</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-neutral-600">Left</dt>
          <dd className={`font-mono ${hot ? "text-amber-400/90" : "text-neutral-200"}`}>
            ${left.toFixed(2)}
          </dd>
        </div>
        {windowEnds ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-neutral-600">Resets</dt>
            <dd className="text-xs text-neutral-500">{when(windowEnds)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/** Rough is right here: nobody needs the second the window rolls over. */
function when(unix: number): string {
  const mins = Math.round((unix * 1000 - Date.now()) / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `in ${hours} h` : `in ${Math.round(hours / 24)} d`;
}
