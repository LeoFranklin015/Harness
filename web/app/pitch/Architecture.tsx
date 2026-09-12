"use client";

/**
 * How it is built, at the size of a slide.
 *
 * There is a detailed drawing of this in docs/ with both handshakes and the
 * whole registry tree. It is a two-minute read, which is the wrong thing to
 * put on a screen for thirty seconds. This keeps only what answers the
 * question the demo just raised: where does the machine live, where does the
 * authority live, and what talks to what.
 */

function Zone({
  label,
  note,
  tone,
  children,
}: {
  label: string;
  note?: string;
  tone: "mesh" | "chain";
  children: React.ReactNode;
}) {
  const skin =
    tone === "mesh"
      ? "border-teal-900/60"
      : "border-sky-900/60";
  const ink = tone === "mesh" ? "text-teal-400/80" : "text-sky-400/80";
  return (
    <div className={`rounded-2xl border border-dashed ${skin} p-5`}>
      <p className={`text-[10px] font-semibold tracking-[0.16em] ${ink}`}>{label}</p>
      {note && <p className="mt-1 text-[11px] text-neutral-600">{note}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Box({ name, sub, tone = "grey" }: { name: string; sub: string; tone?: "grey" | "violet" | "sky" }) {
  const skin =
    tone === "violet"
      ? "border-violet-900/60 bg-violet-950/20"
      : tone === "sky"
        ? "border-sky-900/50 bg-sky-950/20"
        : "border-neutral-800 bg-neutral-950/60";
  return (
    <div className={`rounded-lg border ${skin} px-3.5 py-2.5`}>
      <p className="text-[13px] font-medium text-neutral-100">{name}</p>
      <p className="mt-0.5 font-mono text-[10px] leading-snug text-neutral-600">{sub}</p>
    </div>
  );
}

export function Architecture() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-7">
      {/* Where it runs. */}
      <Zone label="TAILSCALE MESH" note="no public address · invite is single-use" tone="mesh">
        <div className="rounded-xl border border-dashed border-violet-900/50 p-3.5">
          <p className="font-mono text-[11px] text-violet-300/70">acme.harness.eth</p>
          <p className="mt-0.5 text-[10px] text-neutral-700">its own container, its own network</p>
          <div className="mt-3 space-y-2">
            <Box name="runner" sub="a key that can only ask the grant" tone="violet" />
            <Box name="sshd" sub="AuthorizedKeysCommand" tone="violet" />
            <Box name="its secrets" sub="sealed under the Key Ring" tone="violet" />
          </div>
        </div>
      </Zone>

      {/* What crosses. */}
      <div className="flex shrink-0 flex-col items-center gap-2 py-2 lg:w-[132px]">
        <Cross label="asks, every time" />
        <p className="text-center text-[10px] leading-snug text-neutral-700">
          nothing here
          <br />
          caches the answer
        </p>
      </div>

      {/* Where the authority lives. */}
      <Zone label="ON CHAIN · ENSv2" note="read at request time, never copied" tone="chain">
        <div className="space-y-2">
          <Box name="harness.eth" sub="PlatformRegistry" tone="sky" />
          <div className="ml-4 space-y-2">
            <Box name="acme.harness.eth" sub="the machine's own registry" tone="sky" />
            <div className="ml-4">
              <Box name="runner.acme.harness.eth" sub="agentKey · ceiling · window · revoked" tone="sky" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Box name="AgentResolver" sub="ENSIP-10, computed" />
            <Box name="AllowanceExecutor" sub="runs the call" />
          </div>
        </div>
      </Zone>
    </div>
  );
}

/** Two arrows, both pointing the same way: outward, at the chain. */
function Cross({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="120" height="34" viewBox="0 0 120 34" aria-hidden>
        <path d="M2 10 H110" stroke="#9b8cf5" strokeOpacity="0.6" strokeWidth="1.5" />
        <path d="M104 5 L111 10 L104 15" fill="none" stroke="#9b8cf5" strokeOpacity="0.8" strokeWidth="1.5" />
        <path d="M2 26 H110" stroke="#9b8cf5" strokeOpacity="0.6" strokeWidth="1.5" />
        <path d="M104 21 L111 26 L104 31" fill="none" stroke="#9b8cf5" strokeOpacity="0.8" strokeWidth="1.5" />
      </svg>
      <p className="text-[10px] text-violet-300/60">{label}</p>
    </div>
  );
}
