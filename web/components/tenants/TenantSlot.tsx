"use client";

import { BorderBeam } from "@/components/ui/border-beam";
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
 * Empty and filled are the same slot rather than two components, because the
 * thing that changes is what a Tenant *is* — a space you could put a machine
 * in, or the machine.
 */
export function TenantSlot({
  tenant,
  onAdd,
  onContinue,
  onRevoke,
}: {
  tenant: Tenant | null;
  onAdd: () => void;
  onContinue: (t: Tenant) => void;
  onRevoke: (t: Tenant) => void;
}) {
  if (!tenant) return <EmptySlot onAdd={onAdd} />;
  return <FilledSlot tenant={tenant} onContinue={onContinue} onRevoke={onRevoke} />;
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

function FilledSlot({
  tenant,
  onContinue,
  onRevoke,
}: {
  tenant: Tenant;
  onContinue: (t: Tenant) => void;
  onRevoke: (t: Tenant) => void;
}) {
  const provisioning = tenant.status === "provisioning";
  const revoked = tenant.status === "revoked";

  return (
    <div className="relative min-h-[280px] w-full overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6">
      {provisioning && <BorderBeam size={220} duration={7} />}

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-neutral-300">
            {tenant.label}.harness.eth
          </p>
          <p className="mt-1 text-xs text-neutral-600">{tenant.registry}</p>
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
        <dl className="mt-6 space-y-2.5 text-sm">
          <Row label="Agent" value={tenant.agent ? `${tenant.agent}.${tenant.label}.harness.eth` : "—"} mono />
          <Row label="Mesh" value={tenant.meshAddress ?? "—"} mono />
          <Row label="Ceiling" value={tenant.cap} />
        </dl>
      )}

      {tenant.status === "live" && (
        <button
          onClick={() => onRevoke(tenant)}
          className="mt-6 rounded-full border border-red-900/60 px-4 py-1.5 text-xs text-red-400/90 transition hover:border-red-800 hover:bg-red-950/40"
        >
          Revoke
        </button>
      )}

      {revoked && (
        <p className="mt-6 text-xs leading-relaxed text-neutral-600">
          Spending, name resolution and shell access all stopped. Nothing was
          restarted — each of them is computed from the same fact.
        </p>
      )}
    </div>
  );
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
