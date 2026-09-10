"use client";

/**
 * The machine being built, while it is being built.
 *
 * Provisioning is a minute of waiting with two taps in it, and a spinner
 * spends that minute saying nothing. This spends it assembling the thing you
 * are about to own: tracks first, then the body, the shoulders, the neck, and
 * the eyes last — which is the order that reads as a machine coming together
 * rather than a picture fading in.
 *
 * The parts are driven by real progress, not a timer. `done` is how many of
 * the flow's stages have actually completed, so a step that stalls on a
 * device leaves the robot half-built and visibly waiting, and nothing ever
 * claims to have finished something it has not.
 *
 * Deliberately the same drawing as the card. The thing assembling here is the
 * thing that will be sitting in the slot afterwards, and using a different
 * illustration for the two would waste the one moment where that lands.
 */

const YELLOW = "#C89A34";
const YELLOW_LIT = "#DCB255";
const TEAL = "#255A62";
const DARK = "#15181C";
const RIM = "#0C0E11";

/** Which stage each part arrives at. Bottom up, heaviest first. */
const PART_AT = { tracks: 1, body: 2, shoulders: 3, neck: 4, eyes: 5 } as const;

export type AssemblyStage = 0 | 1 | 2 | 3 | 4 | 5;

export function Assembly({ stage, className = "" }: { stage: AssemblyStage; className?: string }) {
  const has = (part: keyof typeof PART_AT) => stage >= PART_AT[part];
  // The piece currently arriving, so it can land rather than appear.
  const landing = (part: keyof typeof PART_AT) => stage === PART_AT[part];

  const part = (p: keyof typeof PART_AT) => ({
    className: has(p) ? (landing(p) ? "part part-landing" : "part part-set") : "part part-waiting",
  });

  return (
    <svg className={className} viewBox="8 4 284 244" aria-hidden>
      {/* A ghost of the whole machine, so the empty space reads as something
          unfinished rather than as nothing. */}
      <g opacity={0.07} stroke="#E8EDF5" strokeWidth={2} fill="none">
        <rect x={59} y={132} width={182} height={80} rx={4} />
        <rect x={68} y={104} width={48} height={30} rx={2} />
        <rect x={184} y={104} width={48} height={30} rx={2} />
        <rect x={112} y={100} width={76} height={34} rx={2} />
        <rect x={140} y={48} width={20} height={62} rx={2} />
        <circle cx={112} cy={54} r={32} />
        <circle cx={188} cy={54} r={32} />
      </g>

      {/* Tracks */}
      <g {...part("tracks")}>
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

      {/* Body */}
      <g {...part("body")}>
        <rect x={59} y={132} width={182} height={80} rx={4} fill={YELLOW} stroke={RIM} strokeWidth={3} />
        {[112, 146, 180].map((x) => (
          <rect key={x} x={x} y={144} width={4} height={56} rx={2} fill={YELLOW_LIT} opacity={0.6} />
        ))}
        <circle cx={80} cy={150} r={6} fill="none" stroke={RIM} strokeWidth={2.5} opacity={0.7} />
        <circle cx={220} cy={150} r={6} fill="none" stroke={RIM} strokeWidth={2.5} opacity={0.7} />
      </g>

      {/* Shoulders */}
      <g {...part("shoulders")}>
        <rect x={68} y={104} width={48} height={30} rx={2} fill={YELLOW} stroke={RIM} strokeWidth={3} />
        <rect x={184} y={104} width={48} height={30} rx={2} fill={YELLOW} stroke={RIM} strokeWidth={3} />
        <rect x={112} y={100} width={76} height={34} rx={2} fill={TEAL} stroke={RIM} strokeWidth={3} />
      </g>

      {/* Neck */}
      <g {...part("neck")}>
        <rect x={140} y={48} width={20} height={62} rx={2} fill={YELLOW} stroke={RIM} strokeWidth={3} />
        <rect x={133} y={86} width={34} height={18} rx={2} fill={TEAL} stroke={RIM} strokeWidth={3} />
      </g>

      {/* Eyes last: the moment it stops being parts. */}
      <g {...part("eyes")}>
        {([
          [112, -12],
          [188, 12],
        ] as const).map(([cx, tilt]) => (
          <g key={cx} transform={`translate(${cx} 54) rotate(${tilt})`}>
            <path d={shell(32)} fill={YELLOW} stroke={RIM} strokeWidth={3.5} />
            <circle cx={0} cy={5} r={21} fill={RIM} />
            <circle cx={0} cy={5} r={12.5} fill="#23272C" />
            <circle cx={-4.5} cy={0} r={5.5} fill="#F4F7FA" />
          </g>
        ))}
      </g>
    </svg>
  );
}

function shell(r: number): string {
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  };
  return `M ${at(200)} A ${r} ${r} 0 1 0 ${at(340)} Z`;
}
