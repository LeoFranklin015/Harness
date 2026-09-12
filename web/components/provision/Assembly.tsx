"use client";

/**
 * The machine being built, while it is being built.
 *
 * Two things are true at once here and both have to show. Progress is real —
 * a part is on because a step completed, and nothing arrives early. But the
 * picture between one step and the next cannot be still, or the minute spent
 * waiting on a Ledger looks like a stall rather than like work.
 *
 * So the fastenings never stop. Every bolt on every fitted part turns
 * continuously, at its own rate and out of phase with the rest, and bites
 * faster while a step is genuinely running. Nothing is driving them and
 * nothing needs to be: it is a machine being worked on, and that is the
 * ambient state.
 *
 * The better half is what happens once a part is on. It starts being used.
 * Tracks twitch once they are bolted down, the arm waves the moment it has a
 * hand to wave with, the neck tests its travel, and the eyes blink and look
 * around as soon as they can see. By the last step it is not an illustration
 * of a robot, it is a robot waiting for you to finish.
 */

const YELLOW = "#C89A34";
const YELLOW_LIT = "#DCB255";
const TEAL = "#255A62";
const DARK = "#15181C";
const RIM = "#0C0E11";


/** Which stage each part arrives at. Bottom up, heaviest first. */
const PART_AT = { tracks: 1, body: 2, shoulders: 3, arms: 4, neck: 5, eyes: 6 } as const;
export const STAGES = 6;

/**
 * Where the bolts are. Three, and every one of them somewhere a bolt would
 * be and can be seen. The arm pivots were in the list and sat behind the
 * body, so they read as fasteners floating in the middle of a panel.
 */
const SCREWS: { x: number; y: number; on: keyof typeof PART_AT }[] = [
  // The hull's own two access ports, which is where a bolt belongs and
  // where one can actually be seen — the arm pivots sit behind the body.
  { x: 80, y: 150, on: "body" },
  { x: 220, y: 150, on: "body" },
  // The collar, holding the neck to the shoulder block.
  { x: 150, y: 95, on: "neck" },
];

export type AssemblyStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function Assembly({
  stage,
  working = false,
  className = "",
}: {
  stage: AssemblyStage;
  /** A step is running right now, so the bolts bite rather than idle. */
  working?: boolean;
  className?: string;
}) {
  const has = (p: keyof typeof PART_AT) => stage >= PART_AT[p];
  const landing = (p: keyof typeof PART_AT) => stage === PART_AT[p];
  const part = (p: keyof typeof PART_AT) => ({
    className: has(p) ? (landing(p) ? "part part-landing" : "part part-set") : "part part-waiting",
  });
  /** A part that is on starts behaving. Nothing behaves before it exists. */
  const alive = (p: keyof typeof PART_AT, cls: string) => (has(p) ? cls : undefined);

  return (
    <svg className={className} viewBox="8 4 284 250" aria-hidden>
      <defs>
        {(["l", "r"] as const).map((side) => (
          <clipPath key={`eye-${side}`} id={`asm-eye-${side}`}>
            <path d={shell(32)} />
          </clipPath>
        ))}
        {(["l", "r"] as const).map((side) => (
          <clipPath key={side} id={`asm-track-${side}`}>
            <rect x={-20} y={-52} width={40} height={104} rx={19} />
          </clipPath>
        ))}
      </defs>
      {/* A ghost of what is not there yet. Each outline disappears the
          moment its part arrives — left up, it draws a full circle around a
          fitted eye and the pod stops reading as a pod. */}
      <g opacity={0.07} stroke="#E8EDF5" strokeWidth={2} fill="none">
        {!has("body") && <rect x={59} y={132} width={182} height={80} rx={4} />}
        {!has("shoulders") && (
          <>
            <rect x={68} y={104} width={48} height={30} rx={2} />
            <rect x={184} y={104} width={48} height={30} rx={2} />
          </>
        )}
        {!has("neck") && <rect x={140} y={48} width={20} height={62} rx={2} />}
        {!has("eyes") && (
          <>
            <path d={shell(32)} transform="translate(112 54) rotate(-12)" />
            <path d={shell(32)} transform="translate(188 54) rotate(12)" />
          </>
        )}
      </g>

      {/* Tracks, and they run. This is what is moving before anything else
          has been fitted — an empty chassis with its tracks turning is a
          machine waiting for parts, where a still one is a diagram. */}
      <g {...part("tracks")}>
        <g className={alive("tracks", "rig-shuffle")}>
          {([
            ["l", 52, 178, 13],
            ["r", 248, 178, -13],
          ] as const).map(([side, x, y, tilt]) => (
            <g key={side} transform={`translate(${x} ${y}) rotate(${tilt})`}>
              <rect x={-20} y={-52} width={40} height={104} rx={19} fill={DARK} />
              <g clipPath={`url(#asm-track-${side})`}>
                <g className="rig-roll">
                  {Array.from({ length: 26 }, (_, k) => (
                    <rect key={k} x={-20} y={-72 + k * 9} width={40} height={4.5} fill="#3A4048" />
                  ))}
                </g>
              </g>
              <rect x={-20} y={-52} width={40} height={104} rx={19} fill="none" stroke={RIM} strokeWidth={3} />
            </g>
          ))}
        </g>
      </g>

      {/* Arms, behind the body so the shoulders read as holding them. Only
          the right one waves — one hand is funnier than two, and a machine
          testing a single new limb is what this moment actually is. */}
      <g {...part("arms")}>
        <Arm side="l" waving={false} />
        <Arm side="r" waving={has("arms")} />
      </g>

      <g {...part("body")}>
        <rect x={59} y={132} width={182} height={80} rx={4} fill={YELLOW} stroke={RIM} strokeWidth={3} />
        {[112, 146, 180].map((x) => (
          <rect key={x} x={x} y={144} width={4} height={56} rx={2} fill={YELLOW_LIT} opacity={0.6} />
        ))}
        <circle cx={80} cy={150} r={7.5} fill="none" stroke={RIM} strokeWidth={2.5} opacity={0.7} />
        <circle cx={220} cy={150} r={7.5} fill="none" stroke={RIM} strokeWidth={2.5} opacity={0.7} />
      </g>

      <g {...part("shoulders")}>
        <rect x={68} y={104} width={48} height={30} rx={2} fill={YELLOW} stroke={RIM} strokeWidth={3} />
        <rect x={184} y={104} width={48} height={30} rx={2} fill={YELLOW} stroke={RIM} strokeWidth={3} />
        <rect x={112} y={100} width={76} height={34} rx={2} fill={TEAL} stroke={RIM} strokeWidth={3} />
      </g>

      {/* Neck. It tests its travel once it can. */}
      <g {...part("neck")}>
        <g className={alive("neck", "rig-crane")}>
          <rect x={140} y={48} width={20} height={62} rx={2} fill={YELLOW} stroke={RIM} strokeWidth={3} />
          <rect x={133} y={86} width={34} height={18} rx={2} fill={TEAL} stroke={RIM} strokeWidth={3} />

          {/* Eyes last: the moment it stops being parts. */}
          <g {...part("eyes")}>
            {([
              [112, -12, "l"],
              [188, 12, "r"],
            ] as const).map(([cx, tilt, side]) => (
              <g key={side} transform={`translate(${cx} 54)`}>
                <g style={{ rotate: `${tilt}deg` }} className="walle-origin">
                  <path d={shell(32)} fill={YELLOW} stroke={RIM} strokeWidth={3.5} />
                  {/* Clipped to the shell. Unclipped, the iris bulges past
                      the flat top and the whole pod reads as a circle —
                      which is not the shape on the card. */}
                  <g clipPath={`url(#asm-eye-${side})`}>
                    <circle cx={0} cy={5} r={21} fill={RIM} />
                    <g className={alive("eyes", "rig-look")}>
                      <circle cx={0} cy={5} r={12.5} fill="#23272C" />
                      <circle cx={-4.5} cy={0} r={5.5} fill="#F4F7FA" />
                      <circle cx={4.5} cy={9} r={2.4} fill="#F4F7FA" opacity={0.8} />
                    </g>
                  </g>
                  <path d={shell(32)} fill="none" stroke={RIM} strokeWidth={3.5} />
                </g>
              </g>
            ))}
          </g>
        </g>
      </g>

      {/* Screws, and somebody working one of them.
          Each sits in a fixed socket: the position is on the outer group and
          the animation on the inner one, so nothing the animation does can
          move a screw off the hole it belongs in. They turn; they do not
          travel. The hammer taps the collar bolt, which is the one you can
          actually see being reached. */}
      {SCREWS.filter((sc) => stage >= PART_AT[sc.on]).map((sc, i) => (
        <g key={i} transform={`translate(${sc.x} ${sc.y})`}>
          <g
            className={working ? "screw screw-fast" : "screw"}
            style={{ animationDelay: `${(i % 3) * -0.7}s`, animationDuration: `${3.2 + (i % 3) * 0.9}s` }}
          >
            <circle r={4.2} fill="#3A424C" stroke="#6B7681" strokeWidth={1.2} />
            <line x1={-2.4} y1={0} x2={2.4} y2={0} stroke="#C9D2DC" strokeWidth={1.3} strokeLinecap="round" />
          </g>
        </g>
      ))}

      {stage >= PART_AT.neck && <Hammer x={150} y={95} working={working} />}

    </svg>
  );
}

/**
 * A hammer, tapping a bolt home.
 *
 * The screws turning say the machine is being worked on; a hammer says
 * somebody is working on it. It swings from the head of the handle, strikes,
 * and lifts — and the bolt takes a small knock at the same moment, because a
 * hit that moves nothing reads as a hit that missed.
 */
function Hammer({ x, y, working }: { x: number; y: number; working: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} className={working ? "hammer hammer-fast" : "hammer"}>
      {/* The pivot sits directly above the bolt, so that at rest angle zero
          the head is on it. Anywhere else and the hammer swings past. */}
      <g transform="translate(0 -34)">
        <rect x={-2.5} y={0} width={5} height={30} rx={2.5} fill="#7A5A33" stroke={RIM} strokeWidth={1.6} />
        <g transform="translate(0 32)">
          <rect x={-11} y={-5.5} width={22} height={11} rx={3} fill="#4A535E" stroke={RIM} strokeWidth={1.8} />
          <rect x={-11} y={-5.5} width={6} height={11} rx={2.5} fill="#68737F" stroke={RIM} strokeWidth={1.5} />
        </g>
      </g>
    </g>
  );
}

/** A two-segment arm with a claw. The forearm is what waves. */
function Arm({ side, waving }: { side: "l" | "r"; waving: boolean }) {
  const flip = side === "l" ? -1 : 1;
  const shoulder = side === "l" ? 62 : 238;
  return (
    <g transform={`translate(${shoulder} 150) scale(${flip} 1)`}>
      <rect x={0} y={-5} width={26} height={10} rx={5} fill={YELLOW} stroke={RIM} strokeWidth={2.5} />
      <circle cx={26} cy={0} r={5} fill={TEAL} stroke={RIM} strokeWidth={2} />
      {/* Everything past the elbow swings. */}
      <g
        className={waving ? "rig-wave" : undefined}
        style={{ transformBox: "view-box", transformOrigin: "unset" }}
        transform="translate(26 0)"
      >
        <g className={waving ? "rig-wave-inner" : undefined}>
          <rect x={-5} y={-30} width={10} height={30} rx={5} fill={YELLOW} stroke={RIM} strokeWidth={2.5} />
          <path
            d="M -6 -30 L -6 -38 M 0 -31 L 0 -40 M 6 -30 L 6 -38"
            stroke={RIM}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </g>
    </g>
  );
}

function shell(r: number): string {
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  };
  return `M ${at(200)} A ${r} ${r} 0 1 0 ${at(340)} Z`;
}
