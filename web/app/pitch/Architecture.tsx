"use client";

/**
 * How it is built, arranged as a loop.
 *
 * Four quadrants inside one frame, and a return path underneath. Read it
 * clockwise: you grant, the chain records, the machine runs, you reach it —
 * and the only way back into the top-left is a person.
 *
 * Deliberately short on words. The detailed drawing lives in docs/; this one
 * has to land in the time it takes to say one sentence over it.
 */

function Zone({
  n,
  label,
  tone,
  children,
  className = "",
}: {
  /** Reading order. Without it the four quadrants are a list, not a loop. */
  n: number;
  label: string;
  tone: "amber" | "sky" | "violet" | "teal";
  children: React.ReactNode;
  className?: string;
}) {
  const edge = {
    amber: "border-amber-900/50",
    sky: "border-sky-900/50",
    violet: "border-violet-900/50",
    teal: "border-teal-900/50",
  }[tone];
  const ink = {
    amber: "text-amber-400/70",
    sky: "text-sky-400/70",
    violet: "text-violet-400/70",
    teal: "text-teal-400/70",
  }[tone];
  return (
    <div className={`rounded-xl border ${edge} bg-neutral-950/50 p-4 ${className}`}>
      <div className="flex items-center gap-2">
        <span
          className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[10px] ${edge} ${ink}`}
        >
          {n}
        </span>
        <p className={`text-[9.5px] font-semibold tracking-[0.16em] ${ink}`}>{label}</p>
      </div>
      <div className="mt-3.5">{children}</div>
    </div>
  );
}

/** A named thing. One line, no explanation. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-neutral-800 bg-neutral-900/60 px-2.5 py-1.5 text-[12px] text-neutral-300">
      {children}
    </span>
  );
}

function Logo({ src, alt, h = 18 }: { src: string; alt: string; h?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ height: h }} className="w-auto" />;
}

function Caret() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden className="shrink-0">
      <path d="M1 5 H11 M8 2 L12 5 L8 8" fill="none" stroke="#6b7280" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Architecture() {
  return (
    <div className="rounded-2xl border border-neutral-900 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* 1 — where authority comes from */}
        <Zone n={1} label="YOU" tone="amber">
          <div className="flex flex-wrap items-center gap-2">
            <Logo src="/logos/ledger.svg" alt="Ledger" h={15} />
            <Caret />
            <Chip>browser</Chip>
            <Caret />
            <Chip>broker</Chip>
          </div>
          <p className="mt-3 text-[11px] text-neutral-600">one tap writes the grant</p>
        </Zone>

        {/* 2 — where it is recorded */}
        <Zone n={2} label="ON CHAIN" tone="sky">
          <div className="flex flex-wrap gap-2">
            <Chip>AgentResolver</Chip>
            <Chip>AllowanceExecutor</Chip>
          </div>
          <div className="mt-3 rounded-lg border border-sky-900/40 bg-sky-950/20 px-3 py-2 font-mono text-[11px] leading-relaxed text-sky-200/70">
            harness.eth
            <br />
            <span className="pl-3">└ acme.harness.eth</span>
            <br />
            <span className="pl-7">└ runner</span>
          </div>
        </Zone>

        {/* 3 — where it runs */}
        <Zone n={3} label="THE MACHINE" tone="violet">
          <div className="flex flex-wrap items-center gap-2">
            <Chip>agent</Chip>
            <span className="flex items-center gap-2.5 rounded-md border border-neutral-800 bg-neutral-900/60 px-2.5 py-1.5">
              <Logo src="/logos/claude.svg" alt="Claude" h={15} />
              <Logo src="/logos/openai.svg" alt="OpenAI" h={15} />
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip>sshd</Chip>
            <Chip>sealed secrets</Chip>
          </div>
          <p className="mt-3 text-[11px] text-neutral-600">
            its own container · no public address
          </p>
        </Zone>

        {/* 4 — how you reach it */}
        <Zone n={4} label="TERMINAL" tone="teal">
          <p className="font-mono text-[12px] text-neutral-300">ssh runner@acme.harness.eth</p>
          <div className="mt-3.5 flex items-center gap-4 text-neutral-600">
            <Laptop />
            <Phone />
            <Watch />
            <span className="text-[11px]">laptop · phone · watch</span>
          </div>
        </Zone>
      </div>

      {/* The way back in. The only one. */}
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-amber-900/40 bg-amber-950/10 px-4 py-2.5">
        <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden className="shrink-0">
          <path d="M29 5 H2 M6 1 L1.5 5 L6 9" fill="none" stroke="#e8a33d" strokeOpacity="0.7" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <p className="text-[12px] text-amber-400/70">
          human in the loop — over the ceiling, the agent stops and sends the
          payment back to the device
        </p>
      </div>
    </div>
  );
}

const dev = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinejoin: "round" as const,
};

function Laptop() {
  return (
    <svg width="26" height="20" viewBox="0 0 34 26" aria-hidden {...dev}>
      <rect x="5" y="3" width="24" height="15" rx="2" />
      <path d="M1 22 H33" strokeLinecap="round" />
    </svg>
  );
}
function Phone() {
  return (
    <svg width="14" height="20" viewBox="0 0 18 26" aria-hidden {...dev}>
      <rect x="3" y="2" width="12" height="21" rx="2.5" />
    </svg>
  );
}
function Watch() {
  return (
    <svg width="14" height="20" viewBox="0 0 18 26"  aria-hidden {...dev}>
      <rect x="4" y="7" width="10" height="11" rx="2.5" />
      <path d="M7 7 V3.5 M11 7 V3.5 M7 18 V21.5 M11 18 V21.5" strokeLinecap="round" />
    </svg>
  );
}
