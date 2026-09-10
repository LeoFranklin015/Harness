/**
 * The marks on the buttons.
 *
 * Drawn rather than pulled from an icon set, because two of them are not in
 * one: Tailscale's mark is its own, and "a shell on a machine you do not own"
 * has no standard glyph. Uniform 24-unit box and 1.6 stroke so they sit at
 * the same weight as the text beside them.
 */

const box = { viewBox: "0 0 24 24", fill: "none", "aria-hidden": true } as const;
const line = {
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Tailscale: three columns of three, the outer ring dimmed. */
export function TailscaleMark({ className = "" }: { className?: string }) {
  const at = [0, 1, 2];
  return (
    <svg {...box} className={className}>
      {at.map((c) =>
        at.map((r) => {
          const lit = c === 1 || r === 1;
          return (
            <circle
              key={`${c}${r}`}
              cx={5 + c * 7}
              cy={5 + r * 7}
              r={2.4}
              fill="currentColor"
              opacity={lit ? 1 : 0.35}
            />
          );
        }),
      )}
    </svg>
  );
}

/** A prompt in a window. */
export function TerminalMark({ className = "" }: { className?: string }) {
  return (
    <svg {...box} className={className}>
      <rect x={2.5} y={4} width={19} height={16} rx={2.5} {...line} />
      <path d="M6.5 9.5 L9.5 12 L6.5 14.5" {...line} />
      <path d="M12 15.5 H17" {...line} />
    </svg>
  );
}

/** A door opened for somebody else. */
export function InviteMark({ className = "" }: { className?: string }) {
  return (
    <svg {...box} className={className}>
      <path d="M14 3.5 H18.5 A2 2 0 0 1 20.5 5.5 V18.5 A2 2 0 0 1 18.5 20.5 H14" {...line} />
      <path d="M3.5 12 H14" {...line} />
      <path d="M10.5 8.5 L14 12 L10.5 15.5" {...line} />
    </svg>
  );
}

/** Cut. Not a bin — nothing is deleted, authority ends. */
export function RevokeMark({ className = "" }: { className?: string }) {
  return (
    <svg {...box} className={className}>
      <circle cx={12} cy={12} r={8.5} {...line} />
      <path d="M6.5 6.5 L17.5 17.5" {...line} />
    </svg>
  );
}
