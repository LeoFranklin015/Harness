"use client";

import { bayerUrl } from "./dither";

/**
 * A small dither grain, moving slightly.
 *
 * The subject underneath stays fully legible. This is a texture over it, not a
 * way of drawing it: a sparse field of dots at low opacity that shifts a pixel
 * or two on a stepped clock, so the surface reads as a display that is alive
 * rather than a still. Stepped, not eased — dither does not glide, it ticks.
 */
export function Grain({ opacity = 0.22, px = 2 }: { opacity?: number; px?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        opacity,
        backgroundImage: bayerUrl(1.6),
        backgroundSize: `${px * 4}px ${px * 4}px`,
        mixBlendMode: "screen",
        animation: "grainTick 0.9s steps(6) infinite",
      }}
    />
  );
}
