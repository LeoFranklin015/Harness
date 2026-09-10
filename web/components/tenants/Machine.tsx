"use client";

import { useId } from "react";

/**
 * A gear train, turning.
 *
 * The point of gears as an image is that they are *coupled* — one cannot turn
 * without the others, and a machine that has stopped is obvious at a glance.
 * Rings spinning independently do not say that, so these actually mesh: pitch
 * circles tangent, teeth interlocking, and the speeds set by the tooth counts
 * rather than picked to look busy.
 *
 * Meshing is a single constraint, ω·N equal and opposite across each pair. In
 * CSS that falls out of making each period proportional to its tooth count and
 * alternating direction — half a second per tooth here, so the 22 takes eleven
 * seconds and the 11 takes five and a half. Every pair then satisfies the
 * constraint exactly, and the train stays in phase for as long as the page is
 * open.
 *
 * The initial offsets are the other half. Along the line between two centres
 * one gear needs a tooth where the other needs a gap, which is half a pitch of
 * rotation on the driven gear. Without it the teeth pass through each other
 * and the whole thing reads as a cartoon.
 */

type State = "provisioning" | "live" | "revoked";

/** Distance between centres is (N₁+N₂)·m/2, so one module fixes the layout. */
const MODULE = 3.1;
/** Seconds per tooth. The only speed control there is. */
const PACE = 0.5;

const pitchRadius = (teeth: number) => (MODULE * teeth) / 2;

/**
 * The train: tooth count, and the bearing from the previous gear's centre.
 * The first is the origin; each subsequent one is placed on its own tangent,
 * so the geometry is computed rather than nudged into place by eye.
 */
const TRAIN: { teeth: number; bearing: number }[] = [
  { teeth: 22, bearing: 0 },
  { teeth: 14, bearing: -34 },
  { teeth: 11, bearing: 46 },
];

type Placed = { teeth: number; cx: number; cy: number; phase: number; cw: boolean };

function layout(): Placed[] {
  const out: Placed[] = [];
  let cx = 0;
  let cy = 0;

  TRAIN.forEach((g, i) => {
    if (i === 0) {
      out.push({ teeth: g.teeth, cx, cy, phase: 0, cw: true });
      return;
    }
    const prev = out[i - 1]!;
    const rad = (g.bearing * Math.PI) / 180;
    const centres = pitchRadius(prev.teeth) + pitchRadius(g.teeth);
    cx = prev.cx + Math.cos(rad) * centres;
    cy = prev.cy + Math.sin(rad) * centres;

    // A gap facing the driver, where the driver presents a tooth: the bearing
    // back along the line of centres, plus half this gear's pitch.
    const back = g.bearing + 180;
    out.push({
      teeth: g.teeth,
      cx,
      cy,
      phase: back + 180 / g.teeth,
      cw: !prev.cw,
    });
  });

  return out;
}

const PLACED = layout();

/** A gear outline: tips and roots joined by flanks, root arcs between teeth. */
function gearPath(teeth: number): string {
  const r = pitchRadius(teeth);
  const tip = r + MODULE * 0.85;
  const root = r - MODULE * 0.95;
  const pitch = (Math.PI * 2) / teeth;
  // A tooth occupies half the pitch and the gap the other half — that is the
  // whole condition for two gears of the same module to mesh, and at 0.31 the
  // teeth were wider than the gaps waiting to receive them, so they collided
  // instead of interleaving. Narrower at the tip than at the root, which is
  // what stops the silhouette reading as a cog stamped out of a biscuit.
  const halfRoot = pitch * 0.25;
  const halfTip = pitch * 0.14;

  const at = (radius: number, angle: number) =>
    `${(Math.cos(angle) * radius).toFixed(2)} ${(Math.sin(angle) * radius).toFixed(2)}`;

  let d = `M ${at(root, -halfRoot)}`;
  for (let i = 0; i < teeth; i++) {
    const a = i * pitch;
    d += ` L ${at(tip, a - halfTip)} L ${at(tip, a + halfTip)} L ${at(root, a + halfRoot)}`;
    d += ` A ${root} ${root} 0 0 1 ${at(root, (i + 1) * pitch - halfRoot)}`;
  }
  return `${d} Z`;
}

export function Machine({ state, className = "" }: { state: State; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const stopped = state === "revoked";
  // Assembling works harder than running. Same train, one number.
  const pace = state === "provisioning" ? PACE * 0.4 : PACE;

  // The train grows off to one side of the first gear, so a box centred on
  // the origin would sit it in a corner with most of the frame empty. Measure
  // what is actually drawn.
  const outer = (g: Placed) => pitchRadius(g.teeth) + MODULE * 0.85;
  const pad = 2;
  const minX = Math.min(...PLACED.map((g) => g.cx - outer(g))) - pad;
  const maxX = Math.max(...PLACED.map((g) => g.cx + outer(g))) + pad;
  const minY = Math.min(...PLACED.map((g) => g.cy - outer(g))) - pad;
  const maxY = Math.max(...PLACED.map((g) => g.cy + outer(g))) + pad;

  return (
    <svg
      className={className}
      viewBox={`${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`}
      aria-hidden
      style={{ opacity: stopped ? 0.4 : 1 }}
    >
      <defs>
        {/* Silver: a bright edge where the light is, falling to near-black
            away from it. One light source for the whole train, so the gears
            look like parts of one object rather than three stickers. */}
        <linearGradient
          id={`${uid}-face`}
          gradientUnits="userSpaceOnUse"
          x1={minX}
          y1={minY}
          x2={maxX}
          y2={maxY}
        >
          <stop offset="0%" stopColor="#eef2f8" />
          <stop offset="28%" stopColor="#aab4c2" />
          <stop offset="55%" stopColor="#5c6673" />
          <stop offset="78%" stopColor="#333b46" />
          <stop offset="100%" stopColor="#1a1f26" />
        </linearGradient>
        <linearGradient
          id={`${uid}-hub`}
          gradientUnits="userSpaceOnUse"
          x1={minX}
          y1={maxY}
          x2={maxX}
          y2={minY}
        >
          <stop offset="0%" stopColor="#7e8896" />
          <stop offset="60%" stopColor="#2b323b" />
          <stop offset="100%" stopColor="#141920" />
        </linearGradient>
        <filter id={`${uid}-grey`}>
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      <g filter={stopped ? `url(#${uid}-grey)` : undefined}>
        {PLACED.map((g, i) => {
          const r = pitchRadius(g.teeth);
          return (
            <g key={i} transform={`translate(${g.cx.toFixed(2)} ${g.cy.toFixed(2)})`}>
              <g
                className={stopped ? undefined : "gear-turn"}
                style={{
                  animationDuration: `${(g.teeth * pace).toFixed(2)}s`,
                  animationDirection: g.cw ? "normal" : "reverse",
                }}
              >
                <g transform={`rotate(${g.phase.toFixed(2)})`}>
                  <path
                    d={gearPath(g.teeth)}
                    fill={`url(#${uid}-face)`}
                    stroke="#f2f6fb"
                    strokeOpacity={0.22}
                    strokeWidth={0.5}
                    strokeLinejoin="round"
                  />
                  {/* Lightening holes. Only on gears with room for them, and
                      they are what makes the rotation legible up close. */}
                  {g.teeth >= 14 &&
                    Array.from({ length: 5 }, (_, k) => {
                      const a = (k / 5) * Math.PI * 2;
                      return (
                        <circle
                          key={k}
                          cx={Math.cos(a) * r * 0.56}
                          cy={Math.sin(a) * r * 0.56}
                          r={r * 0.14}
                          fill="#0b0e12"
                          stroke="#f2f6fb"
                          strokeOpacity={0.12}
                          strokeWidth={0.4}
                        />
                      );
                    })}
                </g>
              </g>

              {/* Hub and bore do not turn with the teeth — a shaft does not. */}
              <circle r={r * 0.3} fill={`url(#${uid}-hub)`} stroke="#f2f6fb" strokeOpacity={0.16} strokeWidth={0.5} />
              <circle r={r * 0.12} fill="#07090c" stroke="#f2f6fb" strokeOpacity={0.1} strokeWidth={0.4} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
