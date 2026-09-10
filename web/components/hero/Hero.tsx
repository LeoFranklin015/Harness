"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bento } from "./Bento";
import { Blob } from "./Blob";
import { Wordmark } from "./Wordmark";

/**
 * The page, as a sequence.
 *
 * The name fills the screen. When it has finished arriving, the page scrolls
 * itself down to three cards and a single way in. Someone who came here to plug
 * in a Ledger can scroll past the name at any moment — the scroll is offered,
 * never enforced, and once they have touched the wheel the page stops steering.
 */
export function Hero({
  onConnect,
  connecting,
  status,
  supported,
}: {
  onConnect: () => void;
  connecting: boolean;
  status: React.ReactNode;
  supported: boolean;
}) {
  const bento = useRef<HTMLElement | null>(null);
  const [arrived, setArrived] = useState(false);
  const touched = useRef(false);

  // The moment a person scrolls on their own, the page stops doing it for them.
  useEffect(() => {
    const mark = () => {
      touched.current = true;
    };
    window.addEventListener("wheel", mark, { passive: true, once: true });
    window.addEventListener("touchstart", mark, { passive: true, once: true });
    window.addEventListener("keydown", mark, { once: true });
    return () => {
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchstart", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);

  const onWordmarkDone = useCallback(() => {
    if (!touched.current) {
      bento.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Cards animate in when their section is actually on screen, whichever way
  // the reader got there.
  useEffect(() => {
    const el = bento.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e?.isIntersecting && setArrived(true),
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative">
      <Blob />

      <Wordmark onDone={onWordmarkDone} />

      <section
        ref={bento}
        className="relative mx-auto flex min-h-dvh max-w-[1320px] flex-col justify-center gap-10 px-6 py-20 lg:px-10"
      >
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">Harness</p>
            <h2 className="mt-3 text-balance text-3xl font-medium leading-[1.1] tracking-tight text-neutral-50 sm:text-4xl">
              One tap sets the ceiling.
            </h2>
            <p className="mt-4 text-pretty text-[15px] leading-relaxed text-neutral-400">
              Your agents run unattended inside a limit only your device can raise.
              Cross it and everything stops — spending, name resolution and shell
              access — until the same device says otherwise.
            </p>
          </div>
        </header>

        <Bento visible={arrived} />

        <footer className="flex flex-col items-center gap-3 pt-6">
          <button
            onClick={onConnect}
            disabled={connecting || !supported}
            className="group relative overflow-hidden rounded-full border border-white/15 bg-neutral-100 px-8 py-3.5 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="relative z-10">
              {connecting ? "Connecting…" : "Connect Ledger to continue"}
            </span>
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/70 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </button>
          <div className="min-h-5 text-center">{status}</div>
        </footer>
      </section>
    </div>
  );
}
