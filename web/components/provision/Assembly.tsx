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
 * Where the bolts are. Placed on the seams they would actually hold, so the
 * pattern reads as fastenings rather than as decoration scattered on a
 * drawing.
 */
const SCREWS: { x: number; y: number; on: keyof typeof PART_AT }[] = [
  { x: 52, y: 150, on: "tracks" },
  { x: 52, y: 206, on: "tracks" },
  { x: 248, y: 150, on: "tracks" },
  { x: 248, y: 206, on: "tracks" },
  { x: 70, y: 202, on: "body" },
  { x: 230, y: 202, on: "body" },
  { x: 150, y: 205, on: "body" },
  { x: 92, y: 128, on: "shoulders" },
  { x: 208, y: 128, on: "shoulders" },
  { x: 64, y: 150, on: "arms" },
  { x: 236, y: 150, on: "arms" },
  { x: 150, y: 96, on: "neck" },
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
      {/* A ghost of the whole machine, so the empty space reads as something
          unfinished rather than as nothing. */}
      <g opacity={0.07} stroke="#E8EDF5" strokeWidth={2} fill="none">
        <rect x={59} y={132} width={182} height={80} rx={4} />
        <rect x={68} y={104} width={48} height={30} rx={2} />
        <rect x={184} y={104} width={48} height={30} rx={2} />
        <rect x={140} y={48} width={20} height={62} rx={2} />
        <circle cx={112} cy={54} r={32} />
        <circle cx={188} cy={54} r={32} />
      </g>

      {/* Tracks. They shuffle once they are bolted down. */}
      <g {...part("tracks")}>
        <g className={alive("tracks", "rig-shuffle")}>
          {([
            [52, 178, 13],
            [248, 178, -13],
          ] as const).map(([x, y, tilt], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${tilt})`}>
              <rect x={-20} y={-52} width={40} height={104} rx={19} fill={DARK} />
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
        <circle cx={80} cy={150} r={6} fill="none" stroke={RIM} strokeWidth={2.5} opacity={0.7} />
        <circle cx={220} cy={150} r={6} fill="none" stroke={RIM} strokeWidth={2.5} opacity={0.7} />
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
                  <circle cx={0} cy={5} r={21} fill={RIM} />
                  <g className={alive("eyes", "rig-look")}>
                    <circle cx={0} cy={5} r={12.5} fill="#23272C" />
                    <circle cx={-4.5} cy={0} r={5.5} fill="#F4F7FA" />
                  </g>
                </g>
              </g>
            ))}
          </g>
        </g>
      </g>

      {/* Screws. Every part that is on has them, and they never stop
          turning — the machine is being worked on continuously, not only at
          the moments a step happens to complete. This is the whole of the
          life in the picture between one stage and the next. */}
      {SCREWS.filter((sc) => stage >= PART_AT[sc.on]).map((sc, i) => (
        <g
          key={i}
          transform={`translate(${sc.x} ${sc.y})`}
          className={working ? "screw screw-fast" : "screw"}
          style={{ animationDelay: `${(i % 5) * -0.9}s`, animationDuration: `${5 + (i % 3) * 1.6}s` }}
        >
          <circle r={4.2} fill="#3A424C" stroke="#6B7681" strokeWidth={1.2} />
          <line x1={-2.4} y1={0} x2={2.4} y2={0} stroke="#C9D2DC" strokeWidth={1.3} strokeLinecap="round" />
        </g>
      ))}

    </svg>
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
