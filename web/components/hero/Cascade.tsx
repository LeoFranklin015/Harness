"use client";

import { Flex } from "./Flex";
import { OutputPanel, SandboxPanel, useFrames } from "./Panels";

/**
 * All three on one line, stepping up to the right.
 *
 * The device signs, the sandbox runs, the shell shows what came of it — so they
 * read in that order along a single diagonal. One offset, applied twice: the
 * same distance right and the same distance up between each. A cascade looks
 * designed when the step is uniform and scattered when each card is placed by
 * eye.
 *
 * The device starts clear of the button rather than pinned to the page edge,
 * which is what the space under the copy is for.
 */

/** Furthest first, so the nearer card stacks over it. */
const PLATES = [
  { key: "output", left: 1390, top: 40, w: 500, dim: 0.8 },
  { key: "sandbox", left: 760, top: 300, w: 500, dim: 0.92 },
  { key: "flex", left: 400, top: 560, w: 250, dim: 1 },
] as const;

/**
 * The wires in the gaps.
 *
 * Each runs along the same diagonal the cards climb, and its mark steps rather
 * than slides — a terminal clocks a signal, it does not tween one. They only
 * ever run one way: out of the device, through the sandbox, into the shell.
 */
const WIRES = [
  { from: [653, 664], to: [757, 604] },
  { from: [1265, 402], to: [1387, 342] },
] as const;

const STEPS = 6;

export function Cascade({ className = "" }: { className?: string }) {
  const f = useFrames(STEPS, 210);
  const t = f / (STEPS - 1);

  return (
    <div className={className}>
      <div className="relative h-[975px] w-[1900px]">
        <svg aria-hidden viewBox="0 0 1900 975" className="absolute inset-0 h-full w-full">
          {WIRES.map((w, i) => (
            <g key={i}>
              <path
                d={`M ${w.from[0]} ${w.from[1]} L ${w.to[0]} ${w.to[1]}`}
                stroke="#c8d2e0"
                strokeOpacity={0.4}
                strokeWidth={2}
                strokeDasharray="3 10"
                fill="none"
              />
              {/* Brackets terminate the run, the way the reference does. */}
              {([w.from, w.to] as const).map(([x, y], j) => (
                <path
                  key={j}
                  d={`M ${x + (j ? 8 : -8)} ${y - 10} L ${x} ${y - 10} L ${x} ${y + 10} L ${x + (j ? 8 : -8)} ${y + 10}`}
                  stroke="#c8d2e0"
                  strokeOpacity={0.55}
                  strokeWidth={2}
                  fill="none"
                />
              ))}
              <circle
                cx={w.from[0] + (w.to[0] - w.from[0]) * t}
                cy={w.from[1] + (w.to[1] - w.from[1]) * t}
                r={5}
                fill="#e0a769"
              />
            </g>
          ))}
        </svg>

        {PLATES.map((p, i) => (
          <div
            key={p.key}
            className="cascade-card absolute"
            // Brightness, not opacity: a translucent card lets the one behind it
            // show through, and two terminals of text on top of each other are
            // unreadable.
            style={{
              left: p.left,
              top: p.top,
              width: p.w,
              zIndex: i + 1,
              filter: `brightness(${p.dim})`,
            }}
          >
            {p.key === "flex" && <Flex />}
            {p.key === "sandbox" && <SandboxPanel />}
            {p.key === "output" && <OutputPanel />}
          </div>
        ))}
      </div>
    </div>
  );
}
