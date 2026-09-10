"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The right-hand column: one place, many panels.
 *
 * The panel is fixed and its contents change, rather than panels appearing in
 * different places. Somewhere on the page has to be the thing the reader is
 * looking at while everything else moves; moving that too costs them their
 * place.
 *
 * Only the newest panel renders its content. Behind it sit empty card backs —
 * edges, no text. An earlier attempt rendered every panel and let the older
 * ones show through at reduced opacity, which produced two sets of words in the
 * same box. A stack should say "there were others", not try to show them.
 */

export type Panel = { id: string; node: ReactNode };

const DEPTH = 2;

export function PanelStack({ panels }: { panels: Panel[] }) {
  const [top, setTop] = useState<Panel | null>(null);
  const [behind, setBehind] = useState(0);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const fresh = panels.filter((p) => !seen.current.has(p.id));
    if (!fresh.length) return;
    fresh.forEach((p) => seen.current.add(p.id));
    setBehind(Math.min(DEPTH, seen.current.size - 1));
    setTop(fresh[fresh.length - 1]!);
  }, [panels]);

  if (!top) return <div className="min-h-[104px] w-full max-w-[420px]" />;

  return (
    <div className="relative w-full max-w-[420px]">
      {Array.from({ length: behind }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          aria-hidden
          className="absolute inset-x-0 top-0 rounded-xl border border-white/[0.07] bg-[#0a0b0d] transition-all duration-700"
          style={{
            height: "100%",
            transform: `translateY(${-n * 9}px) scaleX(${1 - n * 0.035})`,
            zIndex: -n,
          }}
        />
      ))}

      <div key={top.id} className="relative animate-[panelRise_700ms_cubic-bezier(0.16,1,0.3,1)]">
        {top.node}
      </div>
    </div>
  );
}

/** A panel: the frame every card in the stack shares. */
export function PanelCard({
  title,
  tone = "neutral",
  children,
}: {
  title: string;
  tone?: "neutral" | "ok" | "warn";
  children: ReactNode;
}) {
  const accent = {
    neutral: "rgba(255,255,255,0.16)",
    ok: "rgba(52,211,153,0.38)",
    warn: "rgba(251,191,36,0.38)",
  }[tone];

  return (
    <div
      className="rounded-xl border bg-[#08090a] p-4"
      style={{ borderColor: accent }}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{title}</p>
      </div>
      {children}
    </div>
  );
}
