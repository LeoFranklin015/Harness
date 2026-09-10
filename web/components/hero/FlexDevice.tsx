"use client";

import type { ReactNode } from "react";

/**
 * A Ledger Flex.
 *
 * The Flex rather than a Nano because the screen is the point: this product's
 * whole claim is that a person sees what they are authorising on hardware they
 * hold, and a two-line Nano display cannot show a spending ceiling and a name
 * at once. The device is drawn in CSS for the same reason the sandbox is — it
 * can be looked at during development instead of guessed at.
 *
 * Proportions follow the real object: 64 × 88mm of body, most of it screen,
 * with a rounded body and a visible bezel.
 */

const W = 268;
const H = 366;

export type FlexScreen = "apps" | "approve" | "approved";

export function FlexDevice({
  screen = "apps",
  tilt = true,
  scale = 1,
  grant,
}: {
  screen?: FlexScreen;
  tilt?: boolean;
  scale?: number;
  grant?: { agent: string; cap: string };
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div style={{ perspective: 1800 }}>
        <div
          className="relative transition-transform duration-1000 ease-out"
          style={{
            width: W,
            height: H,
            transformStyle: "preserve-3d",
            transform: `scale(${scale}) ${
              tilt ? "rotateX(6deg) rotateY(-18deg) rotateZ(1deg)" : ""
            }`,
          }}
        >
          {/* Body. Brushed aluminium reads as a gradient across the long edge
              plus a bright rim, not as a texture. */}
          <div
            className="absolute inset-0"
            style={{
              borderRadius: 30,
              background:
                "linear-gradient(118deg, #4a4e55 0%, #2a2d33 24%, #1b1d21 55%, #34383f 88%, #55595f 100%)",
              boxShadow:
                "0 40px 90px -30px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.6)",
            }}
          />

          {/* Screen. */}
          <div
            className="absolute overflow-hidden"
            style={{
              inset: 11,
              borderRadius: 22,
              background: screen === "apps" ? "#f4f5f7" : "#0a0c10",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.55)",
              transition: "background 600ms ease",
            }}
          >
            {screen === "apps" ? <Apps /> : <Approve screen={screen} grant={grant} />}
          </div>

          {/* Side button, on the right edge. */}
          <div
            className="absolute"
            style={{
              right: -3,
              top: 84,
              width: 3,
              height: 44,
              borderRadius: 2,
              background: "linear-gradient(180deg,#6b7079,#3a3e45)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** The device at rest: what a Flex actually shows. */
function Apps() {
  const apps: [string, ReactNode][] = [
    ["Bitcoin", <Glyph key="b" d="M8 3v18M6 7h5a3 3 0 010 6H6h6a3 3 0 010 6H6" />],
    ["Ethereum", <Glyph key="e" d="M12 2l7 10-7 4-7-4 7-10zM5 13.5l7 8.5 7-8.5" />],
    ["Solana", <Glyph key="s" d="M5 7h12l-3 3H2zM5 12h12l-3 3H2zM5 17h12l-3 3H2" />],
    ["XRP", <Glyph key="x" d="M4 5l8 7 8-7M4 19l8-7 8 7" />],
    ["Security Key", <Glyph key="k" d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />],
    ["Add app", <Glyph key="a" d="M12 5v14M5 12h14" />],
  ];

  return (
    <div className="flex h-full flex-col px-4 pb-3 pt-5">
      <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1 content-start">
        {apps.map(([name, icon]) => (
          <div key={name} className="flex flex-col items-center gap-1.5 rounded-xl py-3">
            <span className="text-neutral-800">{icon}</span>
            <span className="text-[10px] font-medium text-neutral-700">{name}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-neutral-300/70 px-2 pt-2.5 text-neutral-500">
        <Glyph d="M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 01-.1 1.2l2 1.5-2 3.4-2.3-1a7 7 0 01-2 1.2l-.3 2.5h-4l-.3-2.5a7 7 0 01-2-1.2l-2.3 1-2-3.4 2-1.5A7 7 0 015 12" small />
        <Glyph d="M4 6h16M4 12h16M4 18h10" small />
        <Glyph d="M6 10V7a6 6 0 1112 0v3M5 10h14v11H5z" small />
      </div>
    </div>
  );
}

/**
 * The device with something to approve.
 *
 * The numbers are the point. A ceiling nobody can read on the device is a
 * ceiling nobody agreed to, which is why the Flex is here and a two-line
 * display is not.
 */
function Approve({ screen, grant }: { screen: FlexScreen; grant?: { agent: string; cap: string } }) {
  const done = screen === "approved";

  return (
    <div className="flex h-full flex-col justify-between px-5 py-6 text-neutral-100">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
          {done ? "Approved" : "Review and approve"}
        </p>
        <p className="mt-3 text-[15px] font-medium leading-snug">
          {done ? "Ceiling set" : "Set a spending ceiling"}
        </p>
      </div>

      <dl className="space-y-3 text-[11px]">
        <Row k="Agent" v={grant?.agent ?? "research.leo.harness.eth"} />
        <Row k="Ceiling" v={grant?.cap ?? "$10.00 / day"} accent />
        <Row k="Token" v="USDC" />
        <Row k="Expires" v="in 30 days" />
      </dl>

      <div
        className="flex items-center justify-center gap-2 rounded-full py-2.5 text-[11px] font-medium transition-colors duration-500"
        style={{
          background: done ? "rgba(52,211,153,0.14)" : "rgba(255,255,255,0.06)",
          color: done ? "rgb(110,231,183)" : "rgba(255,255,255,0.7)",
          border: `1px solid ${done ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.14)"}`,
        }}
      >
        {done ? "✓ Signed on device" : "Press both buttons to approve"}
      </div>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-neutral-500">{k}</dt>
      <dd
        className={`truncate font-mono ${accent ? "text-sky-300" : "text-neutral-200"}`}
        style={{ fontSize: 10.5 }}
      >
        {v}
      </dd>
    </div>
  );
}

function Glyph({ d, small }: { d: string; small?: boolean }) {
  const n = small ? 14 : 22;
  return (
    <svg width={n} height={n} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
