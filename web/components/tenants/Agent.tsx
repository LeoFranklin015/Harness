"use client";

import { useId } from "react";

/**
 * The agent, as a drawing.
 *
 * Line art rather than the rendered metal of the gear train, and deliberately
 * so: this is the thing the card is *about*, and it has to read at a glance
 * from across a room. Uniform stroke, round caps, no fill — the same grammar
 * as an icon set, which is what makes a shape legible when it is the only
 * thing on a dark card.
 *
 * What it is doing matters more than what it looks like. It signals, it
 * thinks about money, and it sends payments out — those three, because they
 * are the three things an Agent in Harness actually does. The coins leave
 * rather than arrive: an Agent spends from a ceiling somebody set, and none
 * of it comes back.
 *
 * Everything stops on revoke. Not dimmed and still ticking — stopped, which
 * is the honest picture of what a revocation does.
 */

type State = "provisioning" | "live" | "revoked";

/** An arc between two bearings, in degrees, y-down like the rest of SVG. */
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const [x0, y0] = at(from);
  const [x1, y1] = at(to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** Three coins on the same path, staggered, so it reads as a stream. */
const COINS = [0, 0.8, 1.6];

export function Agent({
  state,
  awaiting = false,
  className = "",
}: {
  state: State;
  /** Stalled on a human: the card has no words to say so with. */
  awaiting?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const stopped = state === "revoked";
  const busy = state === "provisioning" && !awaiting;

  // One ink. The green was decoration standing in for nothing — status is
  // already carried by whether the thing is moving.
  const ink = "#e8edf5";
  const accent = ink;
  const anim = (name: string, secs: number, delay = 0) =>
    stopped ? undefined : { animation: `${name} ${secs}s ease-in-out ${delay}s infinite` };

  return (
    <svg
      className={className}
      // Wide enough for a coin to leave, and tall enough for the outer
      // signal arc, which reaches above the antenna and was being cut off.
      viewBox="34 -20 194 236"
      aria-hidden
      style={{ opacity: stopped ? 0.32 : 1 }}
    >
      <g
        stroke={ink}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeOpacity={0.9}
      >
        {/* Signalling. Two arcs, the outer one a beat behind, so it reads as
            something leaving rather than two rings blinking together. */}
        <path d={arc(100, 26, 24, 190, 262)} style={anim("agent-wave", busy ? 0.8 : 1.3)} />
        <path
          d={arc(100, 26, 39, 196, 256)}
          style={anim("agent-wave", busy ? 0.8 : 1.3, busy ? 0.16 : 0.26)}
        />

        <g style={anim("agent-bob", 2.8)}>
          {/* Antenna. It pulses hard while the flow is stalled on somebody
              pressing a button, because that is the one state the card
              cannot spell out. */}
          <circle
            cx={100}
            cy={26}
            r={8}
            stroke={accent}
            style={awaiting && !stopped ? { animation: "agent-waiting 1s ease-in-out infinite" } : undefined}
          />
          <path d="M 100 34 V 56" />

          {/* Head, with the dome the reference has */}
          <path d="M 62 128 V 90 Q 62 56 100 56 Q 138 56 138 90 V 128 Q 138 134 132 134 H 68 Q 62 134 62 128 Z" />

          {/* Side brackets */}
          <path d="M 58 98 H 52 A 6 6 0 0 0 46 104 V 116 A 6 6 0 0 0 52 122 H 58" />
          <path d="M 142 98 H 148 A 6 6 0 0 1 154 104 V 116 A 6 6 0 0 1 148 122 H 142" />

          {/* Visor and eyes. The blink is the cheapest signal of life there
              is, and the only reason the face is not a diagram. */}
          <rect x={74} y={84} width={52} height={28} rx={8} />
          <g style={anim("agent-blink", 3.6)} fill={accent} stroke="none">
            <circle cx={90} cy={98} r={3.8} />
            <circle cx={110} cy={98} r={3.8} />
          </g>
          <path d="M 88 124 H 112" />

          {/* Body */}
          <path d="M 74 148 Q 74 142 80 142 H 120 Q 126 142 126 148 V 176 Q 126 198 100 198 Q 74 198 74 176 Z" />
          <path d="M 88 172 Q 100 184 112 172" />

          {/* Arms */}
          <rect x={44} y={148} width={10} height={44} rx={5} />
          <rect x={146} y={148} width={10} height={44} rx={5} />
        </g>

        {/* What it is thinking about: a coin, pulsing. */}
        <g style={anim("agent-think", 1.8)}>
          <path d="M 158 16 H 208 A 8 8 0 0 1 216 24 V 52 A 8 8 0 0 1 208 60 H 178 L 168 72 L 170 60 H 158 A 8 8 0 0 1 150 52 V 24 A 8 8 0 0 1 158 16 Z" />
          <circle cx={183} cy={38} r={11} stroke={accent} />
          <text
            x={183}
            y={38}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={15}
            fontWeight={600}
            fill={accent}
            stroke="none"
          >
            $
          </text>
        </g>
      </g>

      {/* Payments leaving. Not on a machine that is still being built, and
          certainly not on one that has been revoked. */}
      {state === "live" &&
        COINS.map((delay) => (
          <g
            key={delay}
            style={{ animation: `agent-spend 2.4s linear ${delay}s infinite` }}
            stroke={accent}
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
          >
            <circle cx={150} cy={181} r={8} />
            <text
              x={150}
              y={181}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={12}
              fontWeight={600}
              fill={accent}
              stroke="none"
            >
              $
            </text>
          </g>
        ))}

      <defs>
        <filter id={`${uid}-none`} />
      </defs>
    </svg>
  );
}
