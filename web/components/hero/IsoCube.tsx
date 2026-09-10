"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * The sandbox an Agent runs in.
 *
 * Isometric and wireframe on purpose: a solid box says "a thing", an open frame
 * says "a space with rules". The plinth underneath is the machine — bolted,
 * dashed, deliberately plain — and the cube is the boundary the Agent cannot
 * reach past. The relationship between the two is the product.
 *
 * CSS transforms rather than WebGL: it cannot lose a graphics context halfway
 * through a demo, it costs no dependency, and it can be screenshotted and
 * reviewed rather than guessed at.
 */

export type SandboxState = "idle" | "live" | "revoked";

const CUBE = 200;
const BASE_W = 268;
const BASE_H = 56;

type Skin = { edge: string; glow: string; ink: string; accent: string };

const SKIN: Record<SandboxState, Skin> = {
  idle: {
    edge: "rgba(255,255,255,0.62)",
    glow: "0 0 20px rgba(255,255,255,0.14)",
    ink: "rgba(236,242,250,0.82)",
    accent: "rgba(255,255,255,0.5)",
  },
  live: {
    edge: "rgba(198,228,255,0.92)",
    glow: "0 0 22px rgba(130,196,255,0.30)",
    ink: "rgba(240,247,255,0.94)",
    accent: "rgb(126,199,255)",
  },
  revoked: {
    edge: "rgba(255,255,255,0.13)",
    glow: "none",
    ink: "rgba(255,255,255,0.22)",
    accent: "rgba(255,255,255,0.18)",
  },
};

/**
 * One box in the isometric scene.
 *
 * Every face is placed from the box's own centre, so a box is positioned by
 * where its middle sits and nothing has to be nudged by hand. That is the whole
 * reason the first attempt had a plinth floating beside the cube rather than
 * under it.
 */
function Box({
  w,
  h,
  d,
  y,
  edge,
  glow,
  dashed,
  faces = {},
  fill = "rgba(6,7,9,0.82)",
}: {
  w: number;
  h: number;
  d: number;
  y: number;
  edge: string;
  glow?: string;
  dashed?: boolean;
  fill?: string;
  faces?: Partial<Record<"front" | "right" | "top", ReactNode>>;
}) {
  const border = `1px ${dashed ? "dashed" : "solid"} ${edge}`;
  const common: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    border,
    background: fill,
    boxShadow: glow,
    transition: "border-color 700ms ease, box-shadow 700ms ease, background 700ms ease",
  };

  const plane = (
    key: string,
    width: number,
    height: number,
    transform: string,
    child?: ReactNode,
  ) => (
    <div
      key={key}
      style={{
        ...common,
        width,
        height,
        marginLeft: -width / 2,
        marginTop: -height / 2,
        transform: `translateY(${y}px) ${transform}`,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 7,
          border: `1px solid ${edge}`,
          opacity: 0.32,
          pointerEvents: "none",
        }}
      />
      {child}
    </div>
  );

  return (
    <>
      {plane("front", w, h, `translateZ(${d / 2}px)`, faces.front)}
      {plane("back", w, h, `rotateY(180deg) translateZ(${d / 2}px)`)}
      {plane("right", d, h, `rotateY(90deg) translateZ(${w / 2}px)`, faces.right)}
      {plane("left", d, h, `rotateY(-90deg) translateZ(${w / 2}px)`)}
      {plane("top", w, d, `rotateX(90deg) translateZ(${h / 2}px)`, faces.top)}
      {plane("bottom", w, d, `rotateX(-90deg) translateZ(${h / 2}px)`)}
    </>
  );
}

export function IsoCube({
  tone = "live",
  label,
  agents,
  cap,
}: {
  tone?: SandboxState;
  label: string;
  agents: string[];
  cap?: string;
}) {
  const s = SKIN[tone];
  const state = tone;

  return (
    <div style={{ transformStyle: "preserve-3d", width: CUBE, height: CUBE }}>

          {/* The boundary. */}
          <Box
            w={CUBE}
            h={CUBE}
            d={CUBE}
            y={0}
            edge={s.edge}
            glow={s.glow}
            fill="linear-gradient(165deg, rgba(14,17,22,0.92), rgba(6,7,9,0.86))"
            faces={{
              front: <NameFace label={label} state={state} skin={s} />,
              right: <AgentFace agents={agents} cap={cap} skin={s} />,
              top: <CeilingFace state={state} />,
            }}
          />
    </div>
  );
}

/** The name the machine answers to, and whether it still does. */
function NameFace({ label, state, skin }: { label: string; state: SandboxState; skin: Skin }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <p className="font-mono text-[13px] tracking-tight" style={{ color: skin.ink }}>
        {label}
      </p>
      <span
        className="rounded-full border px-2.5 py-[3px] text-[9px] uppercase tracking-[0.2em]"
        style={{ borderColor: skin.accent, color: skin.accent }}
      >
        {state === "revoked" ? "revoked" : "authorised"}
      </span>
    </div>
  );
}

/** What is running inside the boundary, and what bounds it. */
function AgentFace({ agents, cap, skin }: { agents: string[]; cap?: string; skin: Skin }) {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5 px-6">
      {agents.map((a) => (
        <div key={a} className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: skin.accent }} />
          <span className="font-mono text-[11px]" style={{ color: skin.ink }}>
            {a}
          </span>
        </div>
      ))}
      {cap && (
        <p
          className="mt-2 border-t pt-2 font-mono text-[10px]"
          style={{ borderColor: skin.edge, color: skin.accent }}
        >
          {cap}
        </p>
      )}
    </div>
  );
}

/** The ceiling, drawn as one: a lid, not an opening. */
function CeilingFace({ state }: { state: SandboxState }) {
  return (
    <div
      className="h-full w-full transition-opacity duration-700"
      style={{
        opacity: state === "revoked" ? 0.1 : 0.42,
        background:
          "repeating-linear-gradient(45deg, rgba(190,225,255,0.16) 0 1px, transparent 1px 10px)",
      }}
    />
  );
}

function Bolts({ edge }: { edge: string }) {
  return (
    <div className="flex h-full items-center justify-between px-4">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-[7px] w-[7px] rounded-full border"
          style={{ borderColor: edge }}
        />
      ))}
    </div>
  );
}

/** The floor it all sits on. */
function Grid({ dim }: { dim: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 transition-opacity duration-700"
      style={{
        opacity: dim ? 0.3 : 1,
        background:
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 48px)," +
          "repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 48px)",
        maskImage: "radial-gradient(ellipse 58% 52% at 50% 52%, black, transparent 80%)",
        WebkitMaskImage: "radial-gradient(ellipse 58% 52% at 50% 52%, black, transparent 80%)",
      }}
    />
  );
}
