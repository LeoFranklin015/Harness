"use client";

import { useEffect, useState } from "react";

import { BorderBeam } from "@/components/ui/border-beam";
import { MeshInvite } from "@/components/tenants/MeshInvite";
import { Terminal } from "@/components/tenants/Terminal";
import { Asks, type Ask } from "@/components/tenants/Asks";
import { Agent } from "@/components/tenants/Agent";
import { Activity } from "@/components/tenants/Activity";
import { getJson } from "@/lib/poll";
import { Gauge } from "@/components/tenants/Gauge";
import { RevokeMark, TailscaleMark, TerminalMark } from "@/components/tenants/icons";
import { RevokeCascade } from "@/components/tenants/RevokeCascade";
import type { ProvisionRequest } from "@/components/tenants/ProvisionDialog";

export type Tenant = {
  label: string;
  registry: `0x${string}`;
  meshAddress: string | null;
  agent: string | null;
  cap: string;
  status: "provisioning" | "live" | "revoked";
  step?: string;
  /** Set once the first Grant lands; what `revoke` is addressed to. */
  agentId?: `0x${string}`;
  /** The ring is done; the chain half is waiting on a click to reach the device. */
  awaiting?: boolean;
  /** What was asked for, kept on the slot so a refresh does not lose it. */
  request?: ProvisionRequest;
};

/**
 * One machine's place on the page.
 *
 * The card carries no text at all — it is the agent, drawn, and the state it
 * is in. Everything a person might read is a click away, which is the right
 * trade for a page whose whole claim is that these things run unattended:
 * the resting state should look like a machine working, not like a form.
 *
 * The cost is that "waiting for you to press a button on your Ledger" has no
 * words on the card either, so it is carried by the drawing instead — the
 * accent pulses rather than breathes. See `Agent`.
 */
export function TenantSlot({
  tenant,
  onAdd,
  onContinue,
  onRevoke,
  onAuthorise,
  onRaise,
}: {
  tenant: Tenant | null;
  onAdd: () => void;
  onContinue: (t: Tenant) => void;
  onRevoke: (t: Tenant) => void;
  /** Puts a visitor's fingerprint on chain. One signature on the device. */
  onAuthorise: (t: Tenant, operator: `0x${string}`) => Promise<void>;
  /** Signs a new Grant at a higher ceiling, after an agent asked for one. */
  onRaise: (t: Tenant, ask: Ask) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  if (!tenant) return <EmptySlot onAdd={onAdd} />;

  return (
    <>
      <AgentCard tenant={tenant} onOpen={() => setOpen(true)} />
      {open && (
        <Details
          tenant={tenant}
          onClose={() => setOpen(false)}
          onContinue={onContinue}
          onRevoke={onRevoke}
          onAuthorise={onAuthorise}
          onRaise={onRaise}
        />
      )}
    </>
  );
}

function EmptySlot({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="group relative flex min-h-[280px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/40 transition hover:border-neutral-700 hover:bg-neutral-900/40"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-800 text-2xl font-light text-neutral-500 transition group-hover:border-neutral-600 group-hover:text-neutral-300">
        +
      </span>
      <span className="text-sm text-neutral-500 transition group-hover:text-neutral-400">
        Add a machine
      </span>
    </button>
  );
}

/** The whole card is the button, because the whole card is the machine. */
function AgentCard({ tenant, onOpen }: { tenant: Tenant; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      aria-label={`${tenant.label}.harness.eth — ${tenant.status}`}
      className="group relative flex min-h-[280px] w-full items-end justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/60 pb-2 transition hover:border-neutral-700"
    >
      {tenant.status === "provisioning" && <BorderBeam size={220} duration={7} />}

      {/* One word, so a wordless card still has somewhere to start. It names
          the state rather than the machine — which one it is belongs in the
          modal, and putting it here would put the data back. */}
      <Badge status={tenant.status} />

      {/* No gear train beside it. The tracks already say the machine is
          running, and they said it better — two mechanisms in one corner
          only competed. */}
      <Agent
        state={tenant.status}
        awaiting={tenant.awaiting}
        className="h-[88%] transition-transform duration-500 group-hover:scale-[1.03]"
      />
    </button>
  );
}

function Badge({ status }: { status: Tenant["status"] }) {
  const { word, dot } = {
    provisioning: { word: "building", dot: "bg-sky-400 animate-pulse" },
    live: { word: "occupied", dot: "bg-[#C89A34]" },
    revoked: { word: "revoked", dot: "bg-neutral-700" },
  }[status];

  return (
    <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/80 px-2.5 py-1 text-[10px] uppercase tracking-wider text-neutral-500 backdrop-blur-sm">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {word}
    </span>
  );
}

/** Everything the card no longer says. */
function Details({
  tenant,
  onClose,
  onContinue,
  onRevoke,
  onAuthorise,
  onRaise,
}: {
  tenant: Tenant;
  onClose: () => void;
  onContinue: (t: Tenant) => void;
  onRevoke: (t: Tenant) => void;
  onAuthorise: (t: Tenant, operator: `0x${string}`) => Promise<void>;
  onRaise: (t: Tenant, ask: Ask) => Promise<void>;
}) {
  const [shell, setShell] = useState(false);
  const [ssh, setSsh] = useState(false);
  const [sshPhase, setSshPhase] = useState<"idle" | "minting" | "signing" | "open">("idle");
  const provisioning = tenant.status === "provisioning";
  const revoked = tenant.status === "revoked";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-6 duration-200 animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm text-neutral-300">
              {tenant.label}.harness.eth
            </p>
            <p className="truncate text-xs text-neutral-600">{tenant.registry}</p>
          </div>
          <StatusPill status={tenant.status} />
        </div>

        {provisioning ? (
          <>
            <p
              className="mt-8 flex items-center gap-2 text-sm text-neutral-400"
              role="status"
              aria-live="polite"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${tenant.awaiting ? "bg-emerald-400" : "animate-pulse bg-sky-400"}`}
              />
              {tenant.step ?? "Starting"}
            </p>

            {/* The ring is done; reaching the device again needs a click, and
                this is it. Not a spinner that will resolve on its own. */}
            {tenant.awaiting && (
              <button
                onClick={() => onContinue(tenant)}
                className="relative mt-4 rounded-full bg-neutral-50 px-4 py-1.5 text-xs font-medium text-neutral-950 transition hover:bg-white"
              >
                Continue in Ethereum →
              </button>
            )}
          </>
        ) : (
          <>
            <dl className="mt-6 space-y-2.5 text-sm">
              <Row label="Agent" value={tenant.agent ? `${tenant.agent}.${tenant.label}.harness.eth` : "—"} mono />
              <Row label="Mesh" value={tenant.meshAddress ?? "—"} mono />
            </dl>
            {/* Not on a revoked machine: a spend gauge beside "spending
                stopped" reads as a contradiction, and the cascade already
                says what the ceiling is now worth. */}
            {!revoked && tenant.agent && (
              <div className="mt-6 rounded-xl border border-neutral-900 bg-neutral-900/30 p-5">
                <Spend tenant={tenant.label} agent={tenant.agent} fallbackCap={capUsd(tenant)} />
              </div>
            )}
          </>
        )}

        {tenant.status === "live" && (
          <>
            {shell && tenant.agent && (
              <Terminal tenant={tenant.label} agent={tenant.agent} onClose={() => setShell(false)} />
            )}
            {/* Two things, not three. Joining the mesh is not a separate
                feature from reaching the machine over SSH — it is how you
                get there, and having both as buttons implied a choice
                nobody has. */}
            <div className="mt-6 grid grid-cols-2 gap-2">
              {tenant.agent && (
                <Action icon={<TerminalMark className="h-5 w-5" />} onClick={() => setShell(true)}>
                  Terminal
                  <span className="mt-0.5 block text-[11px] text-neutral-600">In the browser</span>
                </Action>
              )}
              {/* Pressing it does the work. There is no second button to
                  find: the key is minted and put on chain from here, and
                  the button carries the progress while that happens. */}
              <Action
                icon={
                  ssh && sshPhase !== "open" ? (
                    <Spinner className="h-5 w-5" />
                  ) : (
                    <TailscaleMark className="h-5 w-5" />
                  )
                }
                onClick={() => setSsh((v) => !v)}
                on={ssh}
              >
                Use over SSH
                <span className="mt-0.5 block text-[11px] text-neutral-600">
                  {!ssh
                    ? "From your own shell"
                    : sshPhase === "minting"
                      ? "Minting a key…"
                      : sshPhase === "signing"
                        ? "Confirm on your Ledger"
                        : sshPhase === "open"
                          ? "Ready — paste below"
                          : "Starting…"}
                </span>
              </Action>
            </div>
            {/* The machine has no public address, so reaching it is a separate,
                deliberate act — and one that expires on its own. */}
            {/* The invite and the command are one flow: the mesh is how a
                shell on somebody else's laptop reaches a machine with no
                public address, and the name only resolves once they are on
                it. Shown together, in that order. */}
            {ssh && (
              <MeshInvite
                autoStart
                onPhase={setSshPhase}
                machine={tenant.label}
                agent={tenant.agent}
                meshAddress={tenant.meshAddress}
                ensName={tenant.agent ? `${tenant.agent}.${tenant.label}.harness.eth` : null}
                onAuthorise={(operator) => onAuthorise(tenant, operator)}
              />
            )}

            <Asks
              agent={tenant.agent ?? undefined}
              tenant={tenant.label}
              currentCapUsd={capUsd(tenant)}
              onApprove={(ask) => onRaise(tenant, ask)}
            />

            {tenant.agent && (
              <div className="mt-6 border-t border-neutral-900 pt-5">
                <Activity tenant={tenant.label} agent={tenant.agent} />
              </div>
            )}

            {/* Apart from the rest, and last. It is not one of three things
                you might do, it is the end of the machine. */}
            <div className="mt-6 border-t border-neutral-900 pt-5">
              <button
                onClick={() => onRevoke(tenant)}
                className="group flex w-full items-center gap-3 rounded-lg border border-red-950/70 bg-red-950/10 px-4 py-3 text-left transition hover:border-red-900 hover:bg-red-950/25"
              >
                <RevokeMark className="h-5 w-5 shrink-0 text-red-400/80" />
                <span>
                  <span className="block text-sm text-red-300/90">Revoke</span>
                  <span className="block text-[11px] text-neutral-600">
                    Spending, the name, SSH and any open shell, in one transaction.
                  </span>
                </span>
              </button>
            </div>
          </>
        )}

        {revoked && (
          <RevokeCascade
            name={tenant.agent ? `${tenant.agent}.${tenant.label}.harness.eth` : `${tenant.label}.harness.eth`}
          />
        )}
      </div>
    </div>
  );
}

/** The gauge and its numbers, read from the chain and kept fresh. */
function Spend({
  tenant,
  agent,
  fallbackCap,
}: {
  tenant: string;
  agent: string;
  fallbackCap: number;
}) {
  const [d, setD] = useState<{ capUsd: number; spentUsd: number; windowEnds: number | null } | null>(
    null,
  );

  useEffect(() => {
    let stop = false;
    const ask = () =>
      getJson<{ capUsd: number; spentUsd: number; windowEnds: number | null }>(
        `/api/spend?tenant=${tenant}&label=${agent}`,
      ).then((v) => !stop && v && setD(v));
    ask();
    const every = setInterval(ask, 20_000);
    return () => {
      stop = true;
      clearInterval(every);
    };
  }, [tenant, agent]);

  return (
    <Gauge
      spentUsd={d ? d.spentUsd : null}
      capUsd={d ? d.capUsd : fallbackCap}
      windowEnds={d?.windowEnds ?? null}
    />
  );
}

/** Turning, while the button it sits in is busy. */
function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} animate-spin`} aria-hidden>
      <circle cx={12} cy={12} r={9} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.4} />
      <path
        d="M21 12 A9 9 0 0 0 12 3"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** One of the things you can do to a live machine. */
function Action({
  icon,
  onClick,
  children,
  on,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  on?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition ${
        on
          ? "border-neutral-600 bg-neutral-900"
          : "border-neutral-900 bg-neutral-900/30 hover:border-neutral-700 hover:bg-neutral-900/60"
      }`}
    >
      <span className={on ? "text-neutral-100" : "text-neutral-500"}>{icon}</span>
      <span className={`text-xs ${on ? "text-neutral-100" : "text-neutral-300"}`}>{children}</span>
    </button>
  );
}

/** The ceiling in dollars. Recorded as a request, displayed as "$10/day". */
function capUsd(t: Tenant): number {
  return Number(t.request?.capUsd ?? t.cap.replace(/[^0-9.]/g, "")) || 0;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-neutral-600">{label}</dt>
      <dd className={`truncate text-neutral-300 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: Tenant["status"] }) {
  const styles = {
    provisioning: "border-sky-900/60 text-sky-400/90",
    live: "border-emerald-900/60 text-emerald-400/90",
    revoked: "border-neutral-800 text-neutral-500",
  }[status];

  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider ${styles}`}>
      {status}
    </span>
  );
}
