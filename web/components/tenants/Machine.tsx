"use client";

/**
 * The machine, running.
 *
 * A card that says "live" states it; a mechanism turning shows it. This sits
 * in the corner of an occupied slot as scenery — the same job the cubes do on
 * the landing, and drawn in the same isometric projection so the two do not
 * look like they came from different products.
 *
 * Three rings of teeth, at different radii, tooth counts and speeds, turning
 * in alternating directions. A plain rotating circle shows nothing at all, so
 * the motion has to live in the teeth. The counts are coprime-ish on purpose:
 * the pattern takes a long time to repeat, which is what stops it reading as
 * a loop.
 *
 * The trick that keeps it honest: a ring in this projection is an ellipse, and
 * rotating an ellipse in the plane tumbles it, which is wrong — the ring is
 * lying flat. So the teeth are laid out on a true circle, spun there, and the
 * whole group is squashed by the projection's own ratio afterwards. The
 * rotation happens in circle space and arrives as something turning on a
 * horizontal plane.
 */

/** The projection the cubes use: 0.866 across, 0.5 down. */
const SQUASH = 0.5 / 0.866;

type State = "provisioning" | "live" | "revoked";

/** Radius, teeth, seconds per turn, direction. Wider rings turn slower. */
const RINGS: [number, number, number, 1 | -1][] = [
  [30, 9, 13, 1],
  [48, 14, 21, -1],
  [66, 22, 34, 1],
];

export function Machine({ state, className = "" }: { state: State; className?: string }) {
  const stopped = state === "revoked";
  // Assembling reads as effort, running reads as ease. Same mechanism, and
  // only the rate says which is happening.
  const haste = state === "provisioning" ? 0.35 : 1;
  const tint = state === "live" ? "#34d399" : "#e8edf5";

  return (
    <svg
      className={className}
      viewBox="-100 -78 200 168"
      aria-hidden
      style={{ opacity: stopped ? 0.22 : state === "provisioning" ? 0.9 : 0.8 }}
    >
      {/* The ground it stands on. A hairline, not a filled disc: anything
          opaque here reads as a smudge on the card rather than a plane. */}
      <ellipse cx={0} cy={30} rx={84} ry={84 * SQUASH} fill="none" stroke="#e8edf5" strokeOpacity={0.06} />

      <g transform={`scale(1, ${SQUASH})`}>
        {RINGS.map(([r, teeth, secs, dir], i) => (
          <g
            key={r}
            className={stopped ? undefined : "machine-spin"}
            style={{
              animationDuration: `${secs * haste}s`,
              animationDirection: dir === 1 ? "normal" : "reverse",
            }}
          >
            <circle
              r={r}
              fill="none"
              stroke={i === 0 ? tint : "#e8edf5"}
              strokeOpacity={i === 0 ? 0.45 : 0.24}
              strokeWidth={1}
            />
            {Array.from({ length: teeth }, (_, k) => {
              const a = (k / teeth) * Math.PI * 2;
              const cos = Math.cos(a);
              const sin = Math.sin(a);
              // Teeth point outward along the radius, so they stay teeth
              // rather than becoming a dotted line.
              return (
                <line
                  key={k}
                  x1={cos * r}
                  y1={sin * r}
                  x2={cos * (r + 7)}
                  y2={sin * (r + 7)}
                  stroke={i === 0 ? tint : "#e8edf5"}
                  strokeOpacity={i === 0 ? 0.6 : 0.34}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
        ))}
      </g>

      {/* The core. Breathing while it runs, flat once it does not. */}
      <circle
        r={7}
        fill={tint}
        fillOpacity={stopped ? 0.12 : 0.5}
        className={stopped ? undefined : "machine-core"}
      />
      <circle r={13} fill="none" stroke={tint} strokeOpacity={stopped ? 0.1 : 0.25} strokeWidth={1} />
    </svg>
  );
}
