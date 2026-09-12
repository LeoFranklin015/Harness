"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A deck, not a document.
 *
 * The pitch used to be a markdown file and four SVGs, which is a thing you
 * read. This is a thing you move through: one idea on screen at a time, at a
 * size that survives the back of a room, and nothing else competing for the
 * eye.
 *
 * Arrow keys, space, or a click. No chrome beyond a counter, because a deck
 * with navigation furniture on every slide is a deck that never lets the
 * slide be the only thing.
 */
export function Deck({ slides }: { slides: React.ReactNode[] }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);

  const go = useCallback(
    (next: number) => {
      const bounded = Math.max(0, Math.min(slides.length - 1, next));
      setDir(bounded >= i ? 1 : -1);
      setI(bounded);
    },
    [i, slides.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(e.key)) {
        e.preventDefault();
        go(i + 1);
      }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(i - 1);
      }
      if (e.key === "Home") go(0);
      if (e.key === "End") go(slides.length - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, i, slides.length]);

  return (
    <main
      className="relative min-h-dvh cursor-pointer select-none overflow-hidden bg-black"
      onClick={(e) => go(e.clientX < window.innerWidth * 0.2 ? i - 1 : i + 1)}
    >
      {/* One band of light, so pure black does not read as an unloaded page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          background:
            "radial-gradient(120% 80% at 50% -20%, rgba(120,140,190,0.10), transparent 60%)",
        }}
      />

      <div
        key={i}
        className={`relative flex min-h-dvh items-center px-8 py-16 lg:px-20 ${
          dir > 0 ? "slide-in" : "slide-in slide-in-back"
        }`}
      >
        <div className="mx-auto w-full max-w-[1120px]">{slides[i]}</div>
      </div>

      {/* Where you are, and nothing more. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-8 pb-7 lg:px-20">
        <div className="flex gap-1.5">
          {slides.map((_, n) => (
            <span
              key={n}
              className={`h-[3px] w-8 rounded-full transition-colors duration-300 ${
                n === i ? "bg-neutral-300" : n < i ? "bg-neutral-700" : "bg-neutral-900"
              }`}
            />
          ))}
        </div>
        <p className="font-mono text-[11px] tracking-widest text-neutral-700">
          {String(i + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
        </p>
      </div>
    </main>
  );
}
