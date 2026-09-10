"use client";

import { useState } from "react";
import { ConnectLedger } from "@/components/ledger/ConnectLedger";
import { ProvisionDialog, type ProvisionRequest } from "@/components/tenants/ProvisionDialog";
import { TenantSlot, type Tenant } from "@/components/tenants/TenantSlot";
import type { Device } from "@/lib/ledger";

/**
 * Two pages, one gate.
 *
 * Nothing is shown until a device is connected, because there is nothing to
 * show: a Tenant is rooted in a device, and without one there is no authority
 * to display or to spend.
 */
export default function Home() {
  const [device, setDevice] = useState<Device | null>(null);

  if (!device) return <ConnectLedger onConnected={setDevice} />;
  return <Machines device={device} />;
}

/** Two slots, because you have two devices. Add more when you have more. */
const SLOTS = 2;

function Machines({ device }: { device: Device }) {
  const [tenants, setTenants] = useState<(Tenant | null)[]>(Array(SLOTS).fill(null));
  const [adding, setAdding] = useState<number | null>(null);

  const taken = tenants.filter(Boolean).map((t) => t!.label);

  function setSlot(i: number, next: Tenant | null) {
    setTenants((prev) => prev.map((t, j) => (j === i ? next : t)));
  }

  async function provision(slot: number, req: ProvisionRequest) {
    setAdding(null);
    setSlot(slot, {
      label: req.label,
      registry: "0x" as `0x${string}`,
      meshAddress: null,
      agent: req.agent,
      cap: `$${req.capUsd}/day`,
      status: "provisioning",
      step: "Starting the machine",
    });

    // The server does the work and reports each step as it finishes, so the
    // slot says what is happening rather than spinning for a minute.
    const res = await fetch("/api/provision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...req, device: device.address }),
    });

    if (!res.ok || !res.body) {
      setSlot(slot, null);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // NDJSON: one event per line, so a partial line is held over.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        setTenants((prev) =>
          prev.map((t, j) => (j === slot && t ? { ...t, ...event } : t)),
        );
      }
    }
  }

  async function revoke(tenant: Tenant) {
    const i = tenants.findIndex((t) => t?.label === tenant.label);
    setSlot(i, { ...tenant, status: "provisioning", step: "Waiting for the device" });

    await fetch("/api/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: tenant.label }),
    });

    setSlot(i, { ...tenant, status: "revoked" });
  }

  return (
    <div className="min-h-dvh px-8 py-14 lg:px-20">
      <header className="mb-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
            <span className="h-px w-8 bg-neutral-700" />
            Harness
          </div>
          <h1 className="text-2xl font-medium tracking-tight text-neutral-50">Your machines</h1>
        </div>

        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-neutral-600">Authority</p>
          <p className="font-mono text-sm text-neutral-300">
            {device.address.slice(0, 10)}…{device.address.slice(-8)}
          </p>
          <p className="text-xs text-neutral-600">
            {device.model} · {device.path}
          </p>
        </div>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        {tenants.map((tenant, i) => (
          <TenantSlot key={i} tenant={tenant} onAdd={() => setAdding(i)} onRevoke={revoke} />
        ))}
      </div>

      <ProvisionDialog
        open={adding !== null}
        taken={taken}
        onClose={() => setAdding(null)}
        onSubmit={(req) => provision(adding!, req)}
      />
    </div>
  );
}
