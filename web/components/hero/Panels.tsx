"use client";

import { useEffect, useState } from "react";
import { Flex } from "./Flex";

/**
 * The product as three things and the wires between them: a device that signs,
 * a sandbox that runs, and a shell that shows what came of it.
 *
 * The two ends are terminals and are drawn as windows; the device is an object
 * and is drawn without one. The drawing above the band already establishes the
 * hierarchy, so this is the same story in the second register: what you would
 * actually see on a screen.
 *
 * Motion here is *stepped*, never eased. A terminal does not tween — it redraws
 * — so every animated element is a flipbook of whole frames, which is what
 * makes the band read as a machine rather than as a slideshow.
 */

const AMBER = "text-[#e0a769]";

/** Advances through `count` frames, or holds on the first if motion is off. */
export function useFrames(count: number, ms: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % count), ms);
    return () => clearInterval(id);
  }, [count, ms]);
  return i;
}

/* ── window chrome ─────────────────────────────────────────────────────── */

function Rule() {
  return (
    <span
      aria-hidden
      className="h-[7px] flex-1 opacity-30"
      style={{
        background: "repeating-linear-gradient(to bottom, currentColor 0 1px, transparent 1px 3px)",
      }}
    />
  );
}

function Panel({
  title,
  children,
  className = "",
  footer,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <figure className={`min-w-0 ${className}`}>
      <div className="border border-white/35 bg-[#07080a]">
        <figcaption className="flex items-center gap-2 px-2.5 py-2 text-neutral-400">
          <span aria-hidden className="select-none text-[13px] leading-none tracking-tighter">
            ≡×
          </span>
          <Rule />
          <span className="whitespace-nowrap font-mono text-[13px] uppercase tracking-[0.14em] text-neutral-100">
            {title}
          </span>
          <Rule />
        </figcaption>
        <div className="border-t border-white/15">{children}</div>
      </div>
      {footer && (
        <div className="mt-3 text-center font-mono text-[12px] uppercase tracking-[0.12em] text-neutral-500">
          {footer}
        </div>
      )}
    </figure>
  );
}

/* ── the wires ─────────────────────────────────────────────────────────── */

const TRACK = 9;

/**
 * Six frames, three tracks, a mark two dots further along in each.
 *
 * Redrawn whole rather than moved, which is why it reads as a signal being
 * clocked rather than a dot sliding. Rows are offset so the three tracks look
 * busy without ever being in step.
 */
const WIRE: (number | null)[][] = [
  [null, null, null],
  [0, null, 1],
  [2, 0, 3],
  [4, 2, 6],
  [6, 4, null],
  [null, 6, null],
];

function Wire({ offset = 0 }: { offset?: number }) {
  const f = useFrames(WIRE.length, 200);
  const frame = WIRE[(f + offset) % WIRE.length]!;

  return (
    <div aria-hidden className="hidden shrink-0 flex-col justify-center gap-1 px-2 lg:flex">
      {frame.map((star, row) => (
        <div key={row} className="whitespace-pre font-mono text-[15px] leading-none text-neutral-600">
          {"]"}
          {Array.from({ length: TRACK }, (_, i) =>
            i === star ? (
              <span key={i} className={AMBER}>
                *
              </span>
            ) : (
              "·"
            ),
          )}
          {"["}
        </div>
      ))}
    </div>
  );
}

/* ── the sandbox ───────────────────────────────────────────────────────── */

const ISO = { s: 20, ox: 152, oy: 112 };
const at = (x: number, y: number, z: number) =>
  `${(ISO.ox + (x - y) * 0.866 * ISO.s).toFixed(1)} ${(ISO.oy + ((x + y) * 0.5 - z) * ISO.s).toFixed(1)}`;

const R = 2.9;
const LID = 2.5;

const CELLS = [-1.5, 0, 1.5].flatMap((x) => [-1.5, 0, 1.5].map((y) => ({ x, y })));

/** Which cells are working, per frame. Six frames, stepped, never eased. */
const WORK: number[][] = [
  [4],
  [1, 4, 7],
  [0, 4, 8],
  [2, 3, 5, 6],
  [1, 3, 5, 7],
  [0, 2, 4, 6, 8],
];

/** E2B's loading bar, which is the clearest fifteen characters in the genre. */
const BAR = 15;

function Corner({ at: where }: { at: "tl" | "tr" | "bl" | "br" }) {
  const pos = {
    tl: "left-0 top-0 border-l-2 border-t-2",
    tr: "right-0 top-0 border-r-2 border-t-2",
    bl: "left-0 bottom-0 border-b-2 border-l-2",
    br: "right-0 bottom-0 border-b-2 border-r-2",
  }[where];
  return <span aria-hidden className={`absolute h-5 w-5 border-white/45 ${pos}`} />;
}

export function SandboxPanel() {
  const f = useFrames(WORK.length, 340);
  const lit = new Set(WORK[f]!);
  const filled = Math.round(((f + 1) / WORK.length) * BAR);
  const dots = ".".repeat((f % 3) + 1);

  return (
    <Panel
      title="Harness sandbox"
      footer="mem 384 mb · cpu 0.5 · net isolated"
      className="lg:flex-[1.05]"
    >
      <div className="px-4 pb-5 pt-4">
        <p className="text-center font-mono text-[13px] uppercase tracking-[0.16em] text-neutral-300">
          running agent<span className="inline-block w-4 text-left">{dots}</span>
        </p>

        <div className="relative mt-4 border border-white/10 px-3 py-3">
          <Corner at="tl" />
          <Corner at="tr" />
          <Corner at="bl" />
          <Corner at="br" />

          <svg viewBox="0 0 304 190" className="w-full" aria-hidden>
            {/* Floor, so the box stands on something. */}
            <g stroke="#c8d2e0" strokeOpacity={0.16} strokeWidth={0.7} strokeDasharray="1 5" fill="none">
              {[-2, -1, 0, 1, 2].map((i) => (
                <g key={i}>
                  <path d={`M ${at(i, -R, 0)} L ${at(i, R, 0)}`} />
                  <path d={`M ${at(-R, i, 0)} L ${at(R, i, 0)}`} />
                </g>
              ))}
            </g>

            <path
              d={`M ${at(-R, -R, 0)} L ${at(R, -R, 0)} L ${at(R, R, 0)} L ${at(-R, R, 0)} Z`}
              fill="#070809"
              stroke="#c8d2e0"
              strokeOpacity={0.3}
              strokeWidth={0.9}
            />
            {([[-R, -R], [R, -R], [R, R], [-R, R]] as [number, number][]).map(([x, y], i) => (
              <path key={i} d={`M ${at(x, y, 0)} L ${at(x, y, LID)}`} stroke="#c8d2e0" strokeOpacity={0.28} strokeWidth={0.9} />
            ))}

            {/* The agent at work. Whole frames, so it flickers like a machine. */}
            {CELLS.map((c, i) => (
              <path
                key={i}
                d={`M ${at(c.x, c.y - 0.44, 0.06)} L ${at(c.x + 0.44, c.y, 0.06)} L ${at(c.x, c.y + 0.44, 0.06)} L ${at(c.x - 0.44, c.y, 0.06)} Z`}
                fill="#e0a769"
                fillOpacity={lit.has(i) ? 0.95 : 0.13}
              />
            ))}

            {/* The ceiling: the one thing the agent cannot reach past. */}
            <path
              d={`M ${at(-R, -R, LID)} L ${at(R, -R, LID)} L ${at(R, R, LID)} L ${at(-R, R, LID)} Z`}
              fill="#0b0d10"
              fillOpacity={0.72}
              stroke="#c8d2e0"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
            <path
              d={`M ${at(-R + 0.5, -R + 0.5, LID)} L ${at(R - 0.5, -R + 0.5, LID)} L ${at(R - 0.5, R - 0.5, LID)} L ${at(-R + 0.5, R - 0.5, LID)} Z`}
              fill="none"
              stroke="#c8d2e0"
              strokeOpacity={0.16}
              strokeWidth={0.7}
              strokeDasharray="3 4"
            />

            {/* Authority arriving from the device, one dot per frame. */}
            {[0, 1, 2, 3].map((i) => (
              <path
                key={i}
                d={`M ${at(0, 0, 4.5 - i * 0.5)} L ${at(0, 0, 4.3 - i * 0.5)}`}
                stroke="#e0a769"
                strokeOpacity={(f + i) % WORK.length < 3 ? 0.85 : 0.2}
                strokeWidth={1.2}
              />
            ))}
          </svg>

          <p className="mt-1 text-center font-mono text-[16px] tracking-[0.1em] text-neutral-400">
            [<span className={AMBER}>{"%".repeat(filled)}</span>
            {"_".repeat(BAR - filled)}]
          </p>
          <p className="mt-2.5 text-center font-mono text-[12px] text-neutral-500">
            no key · no crypto library · no neighbour
          </p>
        </div>
      </div>
    </Panel>
  );
}

/* ── what came out ─────────────────────────────────────────────────────── */

type Out = { text: string; tone: "cmd" | "ok" | "dim" | "tap" | "no" };

const LOG: Out[] = [
  { text: "$ ssh runner.leo.harness.eth", tone: "cmd" },
  { text: "host key from ENS · ok", tone: "dim" },
  { text: "$ agent pay", tone: "cmd" },
  { text: "402 → $0.25 settled", tone: "ok" },
  { text: "$9.75 left in today's ceiling", tone: "dim" },
  { text: "◆ revoke — one tap on the Ledger", tone: "tap" },
  { text: "$ ssh runner.leo.harness.eth", tone: "cmd" },
  { text: "permission denied", tone: "no" },
  { text: "$ agent pay", tone: "cmd" },
  { text: "refused — name revoked", tone: "no" },
];

const TONE: Record<Out["tone"], string> = {
  cmd: "text-neutral-200",
  ok: "text-neutral-300",
  dim: "text-neutral-600",
  tap: `${AMBER} my-1.5`,
  no: "text-[#b06a5c]",
};

export function OutputPanel() {
  const [n, setN] = useState(LOG.length);

  useEffect(() => {
    const pinned = new URLSearchParams(window.location.search).get("t");
    if (pinned !== null) return setN(Math.min(LOG.length, Number(pinned) || 0));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // The first half is always on screen; only the revoke sequence replays.
    // Typing the whole log from nothing left the panel empty for most of a
    // cycle, which reads as a broken box rather than a running shell.
    const KEEP = LOG.findIndex((l) => l.tone === "tap");
    let i = LOG.length;
    const id = setInterval(() => {
      i = i >= LOG.length ? KEEP : i + 1;
      setN(i);
    }, 900);
    return () => clearInterval(id);
  }, []);

  const revoked = n > LOG.findIndex((l) => l.tone === "tap");

  return (
    <Panel
      title="Output"
      footer={revoked ? "name revoked · all three refuse" : "name live · agent paying"}
      className="lg:flex-[1.35]"
    >
      <div className="px-5 py-5 font-mono text-[17px] leading-[1.8]">
        <div className="min-h-[20rem]">
          {LOG.slice(0, n).map((l, i) => (
            <div key={i} className={`${TONE[l.tone]} ${l.tone === "cmd" ? "" : "pl-3"}`}>
              {l.text}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/* ── the band ──────────────────────────────────────────────────────────── */

export function Panels({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center justify-center gap-4 max-lg:flex-col lg:gap-1">
        <Flex className="lg:flex-[0.9]" />
        <Wire />
        <SandboxPanel />
        <Wire offset={3} />
        <OutputPanel />
      </div>
    </div>
  );
}
