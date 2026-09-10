/**
 * Ordered dithering, as a CSS mask.
 *
 * An 8×8 Bayer matrix tiled a few pixels wide. Used as a mask it multiplies
 * alpha per pixel in a fixed pattern, so anything behind it breaks into a
 * regular grain rather than a smooth fade — the texture of a screen that has
 * fewer colours than it needs, which is what the device this product is rooted
 * in actually has.
 *
 * Composited with a sweeping gradient, the grain becomes a wipe: cells drop out
 * in the matrix's order, so an element leaves in pieces instead of dimming.
 */

const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

/** The matrix as an SVG data URI, one rect per cell. */
export function bayerUrl(gamma = 1): string {
  const cells = BAYER_8.flatMap((row, y) =>
    row.map((v, x) => {
      const a = Math.pow((v + 0.5) / 64, gamma).toFixed(3);
      return `<rect x="${x}" y="${y}" width="1" height="1" fill="#fff" fill-opacity="${a}"/>`;
    }),
  ).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" shape-rendering="crispEdges">${cells}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * Mask styles for something arriving or leaving.
 *
 * @param p 0 gone, 1 fully present
 * @param px how coarse the grain is
 */
export function ditherMask(p: number, px = 3): React.CSSProperties {
  const clamped = Math.max(0, Math.min(1, p));

  // The sweep runs a little past both ends so the first and last cells get a
  // turn; a gradient that stops exactly at the edges leaves a hard line.
  const edge = clamped * 140 - 20;

  return {
    maskImage: `${bayerUrl()}, linear-gradient(105deg, #000 ${edge - 34}%, #fff ${edge + 12}%)`,
    WebkitMaskImage: `${bayerUrl()}, linear-gradient(105deg, #000 ${edge - 34}%, #fff ${edge + 12}%)`,
    maskSize: `${px}px ${px}px, 100% 100%`,
    WebkitMaskSize: `${px}px ${px}px, 100% 100%`,
    maskRepeat: "repeat, no-repeat",
    WebkitMaskRepeat: "repeat, no-repeat",
    // Intersect: a pixel survives only where the grain allows it *and* the
    // sweep has reached it.
    maskComposite: "intersect",
    WebkitMaskComposite: "source-in",
    opacity: clamped <= 0 ? 0 : 1,
  } as React.CSSProperties;
}

/** A still grain, for surfaces that should read as rendered rather than drawn. */
export function ditherTexture(strength = 0.5, px = 3): React.CSSProperties {
  return {
    backgroundImage: bayerUrl(),
    backgroundSize: `${px}px ${px}px`,
    opacity: strength,
    mixBlendMode: "overlay",
  } as React.CSSProperties;
}
