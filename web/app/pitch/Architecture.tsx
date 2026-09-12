"use client";

/**
 * The architecture, laid out as drawn.
 *
 * One outer frame. Four regions inside it: the authority path top-left, the
 * chain top-right with the resolver and the name tree nested, the host
 * bottom-left holding the agent and what it runs on, the terminal
 * bottom-right. And a loop that leaves the terminal, goes round the outside,
 * and comes back down into the authority path — because a person is the only
 * way back in.
 */

function Region({
  label,
  tone = "grey",
  className = "",
  children,
}: {
  label?: string;
  tone?: "grey" | "amber" | "sky" | "violet" | "teal";
  className?: string;
  children: React.ReactNode;
}) {
  const edge = {
    grey: "border-neutral-800",
    amber: "border-amber-900/60",
    sky: "border-sky-900/60",
    violet: "border-violet-900/60",
    teal: "border-teal-900/60",
  }[tone];
  const ink = {
    grey: "text-neutral-600",
    amber: "text-amber-400/70",
    sky: "text-sky-400/70",
    violet: "text-violet-400/70",
    teal: "text-teal-400/70",
  }[tone];
  return (
    <div className={`rounded-2xl border ${edge} bg-neutral-950/40 p-4 ${className}`}>
      {label && (
        <p className={`mb-3 text-[9.5px] font-semibold tracking-[0.16em] ${ink}`}>{label}</p>
      )}
      {children}
    </div>
  );
}

function Cell({
  children,
  tone = "grey",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "grey" | "sky" | "violet";
  className?: string;
}) {
  const edge = { grey: "border-neutral-800", sky: "border-sky-900/50", violet: "border-violet-900/50" }[tone];
  return (
    <div className={`flex items-center justify-center rounded-xl border ${edge} bg-neutral-900/40 px-3 py-3 text-center ${className}`}>
      {children}
    </div>
  );
}

function Logo({ src, alt, h = 20 }: { src: string; alt: string; h?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ height: h }} className="w-auto" />;
}

export function Architecture() {
  return (
    // Room above and to the right for the loop to travel in.
    <div className="relative pr-16 pt-12 sm:pr-24 sm:pt-14">
      {/* The loop, round the outside. Drawn stretched, with the stroke held
          at a constant width so it does not thin out on a wide screen. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path
          d="M 90.5 76 H 97 V 3 H 15 V 16"
          fill="none"
          stroke="#e8a33d"
          strokeOpacity="0.55"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* The head, unstretched, where the loop lands. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute"
        style={{ left: "15%", top: "calc(16% - 1px)" }}
        width="13"
        height="10"
        viewBox="0 0 13 10"
      >
        <path d="M1.5 1 L6.5 8 L11.5 1" fill="none" stroke="#e8a33d" strokeOpacity="0.75" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="pointer-events-none absolute right-0 top-1/2 origin-center -translate-y-1/2 translate-x-1/2 rotate-90 text-[11px] tracking-wide text-amber-400/70">
        human in the loop
      </p>

      {/* The frame. */}
      <div className="rounded-[22px] border border-neutral-800 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          {/* top left — where authority comes from */}
          <Region tone="amber" className="flex items-center justify-center">
            <div className="flex flex-wrap items-center justify-center gap-3 py-6">
              <Logo src="/logos/ledger.svg" alt="Ledger" h={17} />
              <span className="text-neutral-700">·</span>
              <span className="text-[15px] text-neutral-300">browser</span>
              <span className="text-neutral-700">·</span>
              <span className="text-[15px] text-neutral-300">broker</span>
            </div>
          </Region>

          {/* top right — the chain */}
          <Region tone="sky" label="ON CHAIN">
            <div className="grid grid-cols-[1fr_1fr] gap-2.5">
              <div className="space-y-2.5">
                <Cell tone="sky">
                  <span className="text-[12px] text-neutral-200">AgentResolver</span>
                </Cell>
                <Cell tone="sky">
                  <span className="text-[12px] text-neutral-200">AllowanceExecutor</span>
                </Cell>
              </div>
              <div className="rounded-xl border border-sky-900/50 bg-sky-950/25 p-2.5">
                <Logo src="/logos/ens.svg" alt="ENS" h={22} />
                <p className="mt-2 font-mono text-[10px] leading-relaxed text-sky-200/70">
                  harness.eth
                  <br />
                  <span className="pl-2">└ acme</span>
                  <br />
                  <span className="pl-4">└ runner</span>
                </p>
              </div>
            </div>
          </Region>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_0.75fr]">
          {/* bottom left — the host */}
          <Region tone="violet" label="THE HOST">
            <div className="grid grid-cols-2 gap-2.5">
              <Cell tone="violet">
                <span className="text-[12px] text-neutral-300">sshd</span>
              </Cell>
              <Cell tone="violet">
                <span className="text-[12px] text-neutral-300">sealed secrets</span>
              </Cell>
              <Cell tone="violet" className="gap-3">
                <Logo src="/logos/claude.svg" alt="Claude" h={19} />
                <Logo src="/logos/openai.svg" alt="OpenAI" h={19} />
              </Cell>
              <Cell tone="violet" className="gap-2.5">
                <Logo src="/logos/tailscale.svg" alt="Tailscale" h={16} />
                <span className="text-[11px] text-neutral-500">its own network</span>
              </Cell>
            </div>
          </Region>

          {/* bottom right — how you reach it */}
          <div>
            <Region tone="teal" className="flex h-[calc(100%-26px)] items-center justify-center">
              <div className="py-4 text-center">
                <p className="text-[13px] text-neutral-200">Terminal</p>
                <p className="mt-1.5 font-mono text-[10px] text-neutral-600">
                  runner@acme.harness.eth
                </p>
              </div>
            </Region>
            <div className="mt-2 flex items-center justify-center gap-3 text-neutral-700">
              <Laptop />
              <Phone />
              <Watch />
              <span className="text-[10px]">mobile · watch · laptop</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const dev = { fill: "none" as const, stroke: "currentColor", strokeWidth: 1.4 };

function Laptop() {
  return (
    <svg width="22" height="17" viewBox="0 0 34 26" aria-hidden {...dev}>
      <rect x="5" y="3" width="24" height="15" rx="2" />
      <path d="M1 22 H33" strokeLinecap="round" />
    </svg>
  );
}
function Phone() {
  return (
    <svg width="12" height="17" viewBox="0 0 18 26" aria-hidden {...dev}>
      <rect x="3" y="2" width="12" height="21" rx="2.5" />
    </svg>
  );
}
function Watch() {
  return (
    <svg width="12" height="17" viewBox="0 0 18 26" aria-hidden {...dev}>
      <rect x="4" y="7" width="10" height="11" rx="2.5" />
      <path d="M7 7 V3.5 M11 7 V3.5 M7 18 V21.5 M11 18 V21.5" strokeLinecap="round" />
    </svg>
  );
}
