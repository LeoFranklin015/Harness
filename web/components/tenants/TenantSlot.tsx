"use client";

import { useState } from "react";

import { BorderBeam } from "@/components/ui/border-beam";
import { MeshInvite } from "@/components/tenants/MeshInvite";
import { Terminal } from "@/components/tenants/Terminal";
import { Asks, type Ask } from "@/components/tenants/Asks";
import { Agent } from "@/components/tenants/Agent";
import { Ceiling } from "@/components/tenants/Ceiling";
import { Machine } from "@/components/tenants/Machine";
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
  onRaise: (t: Tenant, ask: Ask, newCapUsd: number) => Promise<void>;
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
      className="group relative flex min-h-[280px] w-full items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/60 transition hover:border-neutral-700"
    >
      {tenant.status === "provisioning" && <BorderBeam size={220} duration={7} />}

      <Agent
        state={tenant.status}
        awaiting={tenant.awaiting}
        className="h-[74%] transition-transform duration-500 group-hover:scale-[1.03]"
      />

      {/* The gear train, small, in the corner. Two registers of the same
          idea: the drawing is what the machine is, this is that it runs. */}
      <Machine
        state={tenant.status}
        className="pointer-events-none absolute bottom-4 right-4 h-16 w-16 opacity-70"
      />
    </button>
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
  onRaise: (t: Tenant, ask: Ask, newCapUsd: number) => Promise<void>;
}) {
  const [shell, setShell] = useState(false);
  const provisioning = tenant.status === "provisioning";
  const revoked = tenant.status === "revoked";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-6 duration-200 animate-in fade-in-0 zoom-in-95"
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
            {/* Not on a revoked machine: a full bar beside "spending stopped"
                reads as a contradiction, and the cascade already says what
                the ceiling is now worth. */}
            {!revoked && (
              <Ceiling capUsd={capUsd(tenant)} tenant={tenant.label} agent={tenant.agent} />
            )}
          </>
        )}

        {tenant.status === "live" && (
          <>
            {shell && tenant.agent && (
              <Terminal tenant={tenant.label} agent={tenant.agent} onClose={() => setShell(false)} />
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              {tenant.agent && (
                <button
                  onClick={() => setShell(true)}
                  className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-900/60"
                >
                  Open a terminal
                </button>
              )}
              <button
                onClick={() => onRevoke(tenant)}
                className="rounded-full border border-red-900/60 px-4 py-1.5 text-xs text-red-400/90 transition hover:border-red-800 hover:bg-red-950/40"
              >
                Revoke
              </button>
            </div>
            {/* The machine has no public address, so reaching it is a separate,
                deliberate act — and one that expires on its own. */}
            <Asks
              tenant={tenant.label}
              currentCapUsd={capUsd(tenant)}
              onApprove={(ask, newCap) => onRaise(tenant, ask, newCap)}
            />
            <MeshInvite
              machine={tenant.label}
              agent={tenant.agent}
              meshAddress={tenant.meshAddress}
              ensName={tenant.agent ? `${tenant.agent}.${tenant.label}.harness.eth` : null}
              onAuthorise={(operator) => onAuthorise(tenant, operator)}
            />
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
