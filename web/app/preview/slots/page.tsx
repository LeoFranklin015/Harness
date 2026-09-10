"use client";

import { useState } from "react";
import { TenantSlot, type Tenant } from "@/components/tenants/TenantSlot";

/**
 * The slot in every state it has, with no Ledger and no machine.
 *
 * The states worth looking at are the ones that are hardest to reach: a
 * revoked machine needs a real revocation to see, and by then the thing you
 * wanted to judge has already played. Here they replay on a click.
 */

const base: Tenant = {
  label: "acme",
  registry: "0xE6A80F0E07490644b80790E28aCBa25EE4730340",
  meshAddress: "100.111.178.98",
  agent: "runner",
  cap: "$10/day",
  status: "live",
  agentId: "0x7a24b5c025b00537d60ac0d02cfee9099b779692c8b3eee077dcc3a9d077a5e4",
};

const STATES: { name: string; tenant: Tenant | null }[] = [
  { name: "empty", tenant: null },
  { name: "provisioning", tenant: { ...base, status: "provisioning", step: "Registering acme.harness.eth" } },
  { name: "awaiting", tenant: { ...base, status: "provisioning", step: "Open Ethereum on your device", awaiting: true } },
  { name: "live", tenant: base },
  { name: "revoked", tenant: { ...base, status: "revoked" } },
  // A real machine, so the meter shows spend read from the chain rather than
  // the allowance it falls back to when there is nothing to ask about.
  { name: "live · real spend", tenant: { ...base, label: "bjbvjw" } },
];

export default function SlotPreview() {
  const [shown, setShown] = useState(STATES.map((s) => s.tenant));

  return (
    <div className="min-h-dvh px-8 py-14 lg:px-20">
      <h1 className="mb-2 text-2xl font-medium tracking-tight text-neutral-50">Slots</h1>
      <p className="mb-8 text-sm text-neutral-600">
        Every state the card has. Click a heading to replay its entrance.
      </p>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {STATES.map((s, i) => (
          <div key={s.name}>
            <button
              onClick={() =>
                // Empty and back again: the component keys off the label, so
                // this is what makes it play the entrance a second time.
                setShown((prev) => {
                  const next = [...prev];
                  next[i] = null;
                  setTimeout(() => setShown((p) => p.map((t, j) => (j === i ? s.tenant : t))), 380);
                  return next;
                })
              }
              className="mb-2 font-mono text-[10px] uppercase tracking-wider text-neutral-600 hover:text-neutral-400"
            >
              {s.name} ↻
            </button>
            <TenantSlot
              tenant={shown[i]}
              onAdd={() => {}}
              onContinue={() => {}}
              onRevoke={() => {}}
              onAuthorise={async () => {}}
              onRaise={async () => {}}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
