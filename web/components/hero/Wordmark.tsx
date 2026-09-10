"use client";

import { useEffect, useState } from "react";
import { Dithered } from "./Dithered";

/**
 * The name, at full width, once.
 *
 * It fills the screen because it is the first and only time the product gets
 * to be just its name. Everything after this is an argument; this is the
 * signature at the top of the page. Letters arrive one at a time and the
 * dither resolves out of them — the word is drawn, not shown.
 */
export function Wordmark({ onDone }: { onDone?: () => void }) {
  const [t, setT] = useState(0);

  useEffect(() => {
    const at = new URLSearchParams(window.location.search).get("t");
    if (at !== null && Number.isFinite(Number(at))) {
      setT(Math.max(0, Math.min(1, Number(at))));
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setT(1);
      onDone?.();
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const x = Math.min(1, (now - start) / 2600);
      setT(x);
      if (x < 1) raf = requestAnimationFrame(tick);
      else onDone?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  const letters = "HARNESS".split("");

  return (
    <section className="relative flex h-dvh items-center justify-center overflow-hidden px-6">
      <h1
        className="flex select-none items-baseline font-medium leading-none tracking-[-0.045em] text-neutral-100"
        style={{ fontSize: "clamp(72px, 17.5vw, 300px)" }}
        aria-label="Harness"
      >
        {letters.map((ch, i) => {
          // Each letter has its own window, so the word arrives as seven
          // events rather than one — the eye follows it being written.
          const local = Math.max(0, Math.min(1, (t * 1.75 - i * 0.11) / 0.6));
          const ease = local * local * (3 - 2 * local);
          return (
            <span
              key={i}
              aria-hidden
              className="relative inline-block"
              style={{
                opacity: ease,
                transform: `translateY(${(1 - ease) * 0.22}em)`,
              }}
            >
              <Dithered strength={1 - ease * 0.55} pitch={3}>
                <span className="inline-block px-[0.005em]">{ch}</span>
              </Dithered>
            </span>
          );
        })}
      </h1>

      <p
        className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-neutral-600 transition-opacity duration-700"
        style={{ opacity: t > 0.85 ? 1 : 0 }}
      >
        agent authority, rooted in hardware
      </p>
    </section>
  );
}
