"use client";

/**
 * A cluster of stacked cubes, bottom right, barely there.
 *
 * Scenery, not information: it gives the empty corner of a very dark page
 * something to be, and it rhymes with the sandbox drawing without competing
 * with it. Columns of different heights, so the silhouette is uneven the way a
 * rack of machines is.
 *
 * Same projection as everything else on the page — computed, never drawn by
 * eye, so its three vanishing directions agree with the sandbox's.
 */

const S = 46;

const px = (x: number, y: number, z: number) => ({
  x: (x - y) * 0.866 * S,
  y: ((x + y) * 0.5 - z) * S,
});
const at = (x: number, y: number, z: number) => {
  const p = px(x, y, z);
  return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
};

/** The three faces of a unit cube you can see from this angle. */
const faces = (x: number, y: number, z: number) => ({
  top:
    `M ${at(x, y, z + 1)} L ${at(x + 1, y, z + 1)} ` +
    `L ${at(x + 1, y + 1, z + 1)} L ${at(x, y + 1, z + 1)} Z`,
  right:
    `M ${at(x + 1, y, z + 1)} L ${at(x + 1, y + 1, z + 1)} ` +
    `L ${at(x + 1, y + 1, z)} L ${at(x + 1, y, z)} Z`,
  left:
    `M ${at(x, y + 1, z + 1)} L ${at(x + 1, y + 1, z + 1)} ` +
    `L ${at(x + 1, y + 1, z)} L ${at(x, y + 1, z)} Z`,
});

/** Columns, as a footprint and a height. Uneven on purpose. */
const COLUMNS: [number, number, number][] = [
  [0, 2, 2],
  [1, 1, 3],
  [2, 0, 3],
  [1, 2, 2],
  [2, 1, 2],
  [3, 0, 2],
  [2, 2, 3],
  [3, 1, 1],
];

export function Cubes({ className = "" }: { className?: string }) {
  // Back to front: a smaller x+y is further away, so it is drawn first and the
  // nearer cube paints over it.
  const cubes = COLUMNS.flatMap(([x, y, h]) =>
    Array.from({ length: h }, (_, z) => ({ x, y, z })),
  ).sort((a, b) => a.x + a.y - (b.x + b.y) || a.z - b.z);

  return (
    <svg className={className} viewBox="-260 -190 560 500" aria-hidden>
      {cubes.map(({ x, y, z }, i) => {
        const f = faces(x, y, z);
        return (
          <g key={i} stroke="#e8edf5" strokeOpacity={0.16} strokeWidth={1} strokeLinejoin="round">
            {/* The top catches what little light there is; the sides fall away. */}
            <path d={f.left} fill="#0a0c0f" />
            <path d={f.right} fill="#0e1115" />
            <path d={f.top} fill="#171b21" strokeOpacity={0.26} />
          </g>
        );
      })}
    </svg>
  );
}
