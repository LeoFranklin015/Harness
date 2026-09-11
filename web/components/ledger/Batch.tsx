"use client";

/**
 * Four signatures becoming one, drawn.
 *
 * The claim on this screen is a count, and a count is the one thing prose is
 * bad at making felt. So the page shows it: four plates drift apart, converge
 * into a single stack, and one ring goes out from the top. Then it comes
 * apart again, because the offer is still open.
 *
 * Same isometric projection as the cubes on the landing page — computed from
 * the same two constants rather than drawn by eye, so the two pages agree
 * about which way the world leans.
 */

const S = 34;
/** Footprint, in cube units. Wider than tall: these are plates, not blocks. */
const W = 2;
/** How thick a plate is, and how far apart they sit when stacked. */
const T = 0.26;
const GAP = 0.34;

const px = (x: number, y: number, z: number) => ({
  x: (x - y) * 0.866 * S,
  y: ((x + y) * 0.5 - z) * S,
});
const at = (x: number, y: number, z: number) => {
  const p = px(x, y, z);
  return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
};

/** The three faces of a plate you can see from here. */
function plate(z: number) {
  const hi = z + T;
  return {
    top: `M ${at(0, 0, hi)} L ${at(W, 0, hi)} L ${at(W, W, hi)} L ${at(0, W, hi)} Z`,
    right: `M ${at(W, 0, hi)} L ${at(W, W, hi)} L ${at(W, W, z)} L ${at(W, 0, z)} Z`,
    left: `M ${at(0, W, hi)} L ${at(W, W, hi)} L ${at(W, W, z)} L ${at(0, W, z)} Z`,
  };
}

/** What the four calls are, bottom of the stack upward. */
const CALLS = ["executor", "host record", "allowance", "ceiling"];

export function Batch({ className = "" }: { className?: string }) {
  const top = px(W / 2, W / 2, 3 * GAP + T);

  return (
    <svg
      className={className}
      viewBox="-72 -150 144 230"
      aria-label="Four transactions collapsing into one"
      role="img"
    >
      {/* The ring that goes out when the stack is whole: the single tap. */}
      <circle
        className="batch-tap"
        cx={top.x}
        cy={top.y}
        r="10"
        fill="none"
        stroke="#e8edf5"
        strokeWidth="1"
      />

      {CALLS.map((call, i) => {
        const f = plate(i * GAP);
        return (
          <g key={call} className="batch-plate" style={{ ["--i" as string]: i }}>
            <g stroke="#e8edf5" strokeOpacity={0.16} strokeWidth={1} strokeLinejoin="round">
              <path d={f.left} fill="#0a0c0f" />
              <path d={f.right} fill="#0e1115" />
              <path d={f.top} fill="#171b21" strokeOpacity={0.3} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
