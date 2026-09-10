"use client";

import { useId } from "react";

/**
 * The agent, as a machine that has clearly been left running for a while.
 *
 * The shape is the obvious reference and the reason it works here: a small
 * robot given a job, doing it alone, for a long time. That is exactly what a
 * Harness agent is, and the silhouette says it faster than any label on the
 * card could.
 *
 * All the life is in the eyes and the tracks, which is true of the film too.
 * The pods tilt independently and out of phase — the head-cock is the whole
 * performance, and two eyes tilting together read as a mechanism while two
 * tilting apart read as something looking. The tracks roll underneath, the
 * body rocks a degree either side because tracks do, and the pupils dart and
 * hold rather than sweeping.
 *
 * Nothing here eases through a long cycle. Servos snap and then wait, so the
 * eye timings are stepped and the holds are most of the duration.
 */

type State = "provisioning" | "live" | "revoked";

/*
 * Sun-bleached, not showroom. The film's robot is dust over ochre after
 * seven hundred years outdoors, and a saturated plastic yellow reads as clip
 * art next to the rest of this page. Pulled down in saturation and up in
 * warmth so it still carries "occupied" without shouting it.
 */
const YELLOW = "#C89A34";
const YELLOW_LIT = "#DCB255";
const TEAL = "#255A62";
const DARK = "#15181C";
const RIM = "#0C0E11";

/** Rung spacing on the tracks. The scroll distance must match it exactly. */
const RUNG = 9;

/**
 * What it has just done, one word at a time.
 *
 * Only things this product actually does — an agent here buys resources over
 * x402, pays out USDC, escalates past its ceiling and gets a signature back.
 * "swapped" and "sold" would be nice words and neither is true yet.
 */
const DOING = ["purchased", "paid", "asked", "signed"];
/** Seconds each word holds. The cycle is this times the number of words. */
const WORD = 2;

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
  const hurry = state === "provisioning" && !awaiting ? 0.55 : 1;

  const run = (name: string, secs: number, delay = 0, ease = "ease-in-out") =>
    stopped
      ? undefined
      : { animation: `${name} ${(secs * hurry).toFixed(2)}s ${ease} ${delay}s infinite` };

  return (
    <svg className={className} viewBox="8 12 284 236" aria-hidden style={{ opacity: stopped ? 0.3 : 1 }}>
      <defs>
        {/* One clip per eye, so the lid drops inside the shell rather than
            across the top of it. */}
        {(["l", "r"] as const).map((side) => (
          <clipPath key={side} id={`${uid}-eye-${side}`}>
            <path d={eyeShell(32)} />
          </clipPath>
        ))}
        {(["l", "r"] as const).map((side) => (
          <clipPath key={side} id={`${uid}-track-${side}`}>
            <rect x={-20} y={-52} width={40} height={104} rx={19} />
          </clipPath>
        ))}
      </defs>

      {/* Tracks rock the whole machine a degree either side. */}
      <g className="walle-origin" style={run("walle-rock", 2.4)}>
        {([
          ["l", 52, 178, 13],
          ["r", 248, 178, -13],
        ] as const).map(([side, x, y, tilt]) => (
          <g key={side} transform={`translate(${x} ${y}) rotate(${tilt})`}>
            <rect x={-20} y={-52} width={40} height={104} rx={19} fill={DARK} />
            <g clipPath={`url(#${uid}-track-${side})`}>
              <g
                style={
                  stopped
                    ? undefined
                    : { animation: `walle-track ${(0.5 * hurry).toFixed(2)}s linear infinite` }
                }
              >
                {/* Drawn past both ends: the group slides exactly one rung and
                    restarts, so there has to be a rung waiting to arrive. */}
                {Array.from({ length: 26 }, (_, i) => (
                  <rect key={i} x={-20} y={-72 + i * RUNG} width={40} height={RUNG * 0.5} fill="#3A4048" />
                ))}
              </g>
            </g>
            <rect x={-20} y={-52} width={40} height={104} rx={19} fill="none" stroke={RIM} strokeWidth={3} />
          </g>
        ))}

        {/* Payments leaving. Drawn before the shell and starting inside it,
            so a coin comes out from behind the machine rather than appearing
            in the air beside it. It spends from a ceiling somebody set, and
            none of it comes back, so nothing ever arrives. */}
        {state === "live" &&
          [0, 0.7, 1.4].map((delay) => (
            <g key={delay} style={{ animation: `walle-spend 2.1s linear ${delay}s infinite` }}>
              <circle cx={226} cy={152} r={9.5} fill={YELLOW_LIT} stroke={RIM} strokeWidth={2.5} />
              <text
                x={226}
                y={152}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fontWeight={700}
                fill={RIM}
              >
                $
              </text>
            </g>
          ))}

        {/* Body */}
        <rect x={59} y={132} width={182} height={80} rx={4} fill={YELLOW} stroke={RIM} strokeWidth={3} />
        {[112, 146, 180].map((x) => (
          <rect key={x} x={x} y={144} width={4} height={56} rx={2} fill={YELLOW_LIT} opacity={0.6} />
        ))}
        <circle cx={80} cy={150} r={6} fill="none" stroke={RIM} strokeWidth={2.5} opacity={0.7} />
        <circle cx={220} cy={150} r={6} fill="none" stroke={RIM} strokeWidth={2.5} opacity={0.7} />

        {/* Shoulders */}
        <rect x={68} y={104} width={48} height={30} rx={2} fill={YELLOW} stroke={RIM} strokeWidth={3} />
        <rect x={184} y={104} width={48} height={30} rx={2} fill={YELLOW} stroke={RIM} strokeWidth={3} />
        <rect x={112} y={100} width={76} height={34} rx={2} fill={TEAL} stroke={RIM} strokeWidth={3} />

        {/* Neck and head. The neck lifts and settles; in the film the body
            barely acts at all and this plus the eyes is the whole of it. */}
        <g className="walle-origin" style={run("walle-crane", 3.6)}>
          <rect x={140} y={48} width={20} height={62} rx={2} fill={YELLOW} stroke={RIM} strokeWidth={3} />
          <rect x={133} y={86} width={34} height={18} rx={2} fill={TEAL} stroke={RIM} strokeWidth={3} />

          {/* One word at a time, above the head. Not decoration: it is the
              only thing on the card that says what the machine is doing
              rather than that it is doing something. */}
          {state === "live" && (
            <g style={{ animation: "walle-bubble 3.5s ease-in-out infinite" }}>
              {/* A visible outline: the fill is nearly the card's own colour,
                  so without one the bubble is a floating word. Pulled left and
                  down until the tail actually lands on the pod it comes
                  from. */}
              <path
                d="M 200 12 H 268 A 7 7 0 0 1 275 19 V 37 A 7 7 0 0 1 268 44 H 218 L 205 56 L 208 44 H 200 A 7 7 0 0 1 193 37 V 19 A 7 7 0 0 1 200 12 Z"
                fill="#171B21"
                stroke="#5A626C"
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
              {DOING.map((word, i) => (
                <text
                  key={word}
                  x={234}
                  y={28}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fontFamily="var(--font-mono), monospace"
                  letterSpacing={0.6}
                  fill={YELLOW_LIT}
                  // Negative delays put each word in its own slice of one
                  // shared cycle, so they can never overlap or drift apart.
                  style={{
                    animation: `walle-word ${DOING.length * WORD}s ease-out ${-i * WORD}s infinite`,
                    opacity: 0,
                  }}
                >
                  {word}
                </text>
              ))}
            </g>
          )}

          <Eye uid={uid} side="l" cx={112} cy={54} base={-12} style={run("walle-tilt-l", 4.2)} />
          <Eye uid={uid} side="r" cx={188} cy={54} base={12} style={run("walle-tilt-r", 4.2, 0.6)} />
        </g>
      </g>

    </svg>
  );
}

/**
 * One eye pod: a disc with the top taken off by a chord.
 *
 * The flat edge is what makes the silhouette read, and tilting it is what
 * makes the machine read as alive.
 */
function Eye({
  uid,
  side,
  cx,
  cy,
  base,
  style,
}: {
  uid: string;
  side: "l" | "r";
  cx: number;
  cy: number;
  base: number;
  style?: React.CSSProperties;
}) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {/* The resting tilt is the animation's own start and end, because a
          `rotate` here would otherwise replace it rather than add to it. */}
      <g className="walle-origin" style={{ rotate: `${base}deg`, ...style }}>
        <path d={eyeShell(32)} fill={YELLOW} stroke={RIM} strokeWidth={3.5} />

        <g clipPath={`url(#${uid}-eye-${side})`}>
          <circle cx={0} cy={5} r={21} fill={RIM} />
          <g style={{ animation: `walle-dart 5.4s steps(1, end) ${side === "l" ? 0 : 0.08}s infinite` }}>
            <circle cx={0} cy={5} r={12.5} fill="#23272C" />
            <circle cx={-4.5} cy={0} r={5.5} fill="#F4F7FA" />
            <circle cx={4.5} cy={9} r={2.4} fill="#F4F7FA" opacity={0.8} />
          </g>
          <rect
            x={-36}
            y={-76}
            width={72}
            height={72}
            fill={YELLOW}
            style={{ animation: `walle-blink 4.4s steps(1, end) ${side === "l" ? 0 : 0.05}s infinite` }}
          />
        </g>

        <path d={eyeShell(32)} fill="none" stroke={RIM} strokeWidth={3.5} />
      </g>
    </g>
  );
}

/**
 * A disc with a chord across the top, centred on the origin.
 *
 * The arc runs the long way — from the left end of the chord, down under and
 * back up to the right end — so `Z` closes it along the flat.
 */
function eyeShell(r: number): string {
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  };
  return `M ${at(200)} A ${r} ${r} 0 1 0 ${at(340)} Z`;
}
