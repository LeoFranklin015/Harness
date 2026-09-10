"use client";

import type { CSSProperties, ReactNode } from "react";
import { bayerUrl } from "./dither";

/**
 * Render something as vertical-line dither.
 *
 * Not a transition — a way of drawing. Content shows through thin vertical
 * strips whose density follows an ordered-dither matrix stretched tall, so tone
 * becomes the length and frequency of hairlines: the look of an image printed
 * with one colour and a lot of patience.
 *
 * Two masks, intersected: hairlines give the strips, the tall Bayer tile gives
 * each strip a broken, varying length. Either alone is a screen door; together
 * they are the reference.
 */
export function Dithered({
  children,
  pitch = 3,
  strength = 1,
  invert = false,
  className,
  style,
}: {
  children: ReactNode;
  /** Distance between hairlines, px. Smaller is finer. */
  pitch?: number;
  /** 1 fully dithered, 0 untouched. */
  strength?: number;
  /**
   * Draw dark surfaces as light strips. The reference renders a dark subject
   * in light lines on black; a dark object left as-is becomes black strips on
   * black and vanishes. Off for things that are already light — a white
   * wordmark inverted is no wordmark.
   */
  invert?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const line = Math.max(1, Math.round(pitch * 0.42));
  const masks = [
    `repeating-linear-gradient(90deg, #000 0 ${line}px, transparent ${line}px ${pitch}px)`,
    bayerUrl(0.85),
  ].join(", ");

  return (
    <div className={`relative ${className ?? ""}`} style={style}>
      {/* The clean render underneath, in normal flow so it sizes the box, at
          reduced presence so the dither reads as drawn over a faint ground.
          With both copies absolute the wrapper is zero-width, and every letter
          of the wordmark stacks on the same point. */}
      <div className="relative" style={{ opacity: 1 - strength * 0.9 }}>
        {children}
      </div>

      <div
        className="absolute inset-0"
        style={{
          opacity: strength,
          maskImage: masks,
          WebkitMaskImage: masks,
          maskSize: `${pitch}px 100%, ${pitch * 2}px ${pitch * 9}px`,
          WebkitMaskSize: `${pitch}px 100%, ${pitch * 2}px ${pitch * 9}px`,
          maskRepeat: "repeat",
          WebkitMaskRepeat: "repeat",
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in",
          // Two-tone: whatever survives the mask is pushed to one light value,
          // so the strips read as ink rather than as a dimmer copy underneath.
          filter: invert
            ? "grayscale(1) invert(1) contrast(1.9) brightness(1.35)"
            : "grayscale(1) contrast(2.0) brightness(1.8)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
