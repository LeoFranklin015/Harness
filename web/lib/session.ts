"use client";

import type { Address } from "viem";
import { connect, RejectedOnDevice, type Device, type Step } from "./ledger";
import type { Tenant } from "@/components/tenants/TenantSlot";

/**
 * What survives a refresh, and what does not.
 *
 * The HID handle dies with the tab; the *authority* does not — an address, a
 * path, a model — and neither do the machines rooted in it. So both are kept in
 * the browser, and the device is reached again only when a signature is needed,
 * from the click that asked for it. Nothing here can sign: the Ledger is still
 * the only signer, it is just not asked to introduce itself twice.
 */

export type Authority = { address: Address; path: string; model: string };

const AUTHORITY = "harness:authority";
const tenantsKey = (a: Address) => `harness:tenants:${a.toLowerCase()}`;

export function remembered(): Authority | null {
  try {
    const raw = localStorage.getItem(AUTHORITY);
    return raw ? (JSON.parse(raw) as Authority) : null;
  } catch {
    return null;
  }
}

export function remember(a: Authority | null) {
  try {
    if (a) localStorage.setItem(AUTHORITY, JSON.stringify(a));
    else localStorage.removeItem(AUTHORITY);
  } catch {}
}

/**
 * The machines this device holds, as last seen.
 *
 * A slot caught mid-chain by a refresh comes back waiting on a click, which is
 * the only honest state for it: the ring is done and cannot be undone, and the
 * rest can be retried.
 */
export function loadTenants(address: Address, slots: number): (Tenant | null)[] {
  const empty = Array<Tenant | null>(slots).fill(null);
  try {
    const raw = localStorage.getItem(tenantsKey(address));
    if (!raw) return empty;
    const saved = JSON.parse(raw) as (Tenant | null)[];
    return empty.map((_, i) => {
      const t = saved[i];
      if (!t) return null;
      if (t.status !== "provisioning") return t;
      if (!t.request) return null;
      return { ...t, awaiting: true, step: "Interrupted. Open Ethereum on your device, then continue." };
    });
  } catch {
    return empty;
  }
}

export function saveTenants(address: Address, tenants: (Tenant | null)[]) {
  try {
    localStorage.setItem(tenantsKey(address), JSON.stringify(tenants));
  } catch {}
}

/**
 * The live device, reopened on demand.
 *
 * `device()` hands back the open session if there is one and otherwise connects
 * — which needs `navigator.hid.requestDevice`, so callers reach it from a click.
 * A different Ledger than the remembered one is refused rather than adopted: the
 * page is showing machines that answer to a specific address, and a signature
 * from any other would fail on chain anyway, after the person had approved it.
 */
export class Session {
  /** The connection as DMK gave it. */
  private raw: Device | null;
  /** The same connection, with `send` failures dropping the handle. */
  private wrapped: Device | null = null;

  constructor(
    readonly authority: Authority,
    live: Device | null = null,
  ) {
    this.raw = live;
  }

  async device(onStep: Step): Promise<Device> {
    if (this.raw && this.wrapped) return this.wrapped;
    if (!this.raw) {
      const dev = await connect(onStep);
      if (dev.address.toLowerCase() !== this.authority.address.toLowerCase()) {
        await dev.disconnect();
        throw new Error(
          `This Ledger holds ${short(dev.address)}, not ${short(this.authority.address)}. Plug in the other device, or switch device.`,
        );
      }
      this.raw = dev;
    }
    const raw = this.raw;
    this.wrapped = {
      ...raw,
      // A failed send that was not a refusal usually means the handle is stale
      // (unplugged, app closed); drop it so the next click reconnects instead
      // of failing the same way twice.
      send: async (tx, step) => {
        try {
          return await raw.send(tx, step);
        } catch (err) {
          if (!(err instanceof RejectedOnDevice)) await this.release();
          throw err;
        }
      },
      disconnect: () => this.release(),
    };
    return this.wrapped;
  }

  /** Let the HID handle go — the ring's transport needs it. */
  async release() {
    const d = this.raw;
    this.raw = null;
    this.wrapped = null;
    await d?.disconnect().catch(() => {});
  }
}

export function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
