import { NextResponse } from "next/server";
import type { Address, Hex } from "viem";
import {
  MAX_SLOTS,
  markRevoked,
  saveTenant,
  slotAvailable,
  slotsOf,
} from "@/lib/store";

export const runtime = "nodejs";

/**
 * The machines a device holds.
 *
 * These used to live in the browser, which meant the two-slot rule was a
 * constant the page was trusted to respect — clearing site data reset it, two
 * tabs did not see each other, and nothing stopped a third machine being
 * provisioned by hand. A cap that cannot be enforced is a label, not a limit.
 *
 * There is no authentication here and that is deliberate rather than
 * overlooked: this is a record of what exists, and holding it grants nothing.
 * Every action that matters — provisioning, spending, revoking — is authorised
 * by the device against the chain, and none of them consult this. The worst a
 * forged `authority` does is show somebody a list, or take a slot the real
 * device would then have to free.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SAFE = /^[a-z0-9][a-z0-9-]*$/;

/** GET /api/tenants?authority=0x… — the slots, in order, empty ones as null. */
export async function GET(request: Request) {
  const authority = new URL(request.url).searchParams.get("authority") ?? "";
  if (!ADDRESS.test(authority)) {
    return NextResponse.json({ error: "which device?" }, { status: 400 });
  }
  try {
    const held = await slotsOf(authority);
    const slots: (unknown | null)[] = Array(MAX_SLOTS).fill(null);
    for (const t of held) {
      // A machine recorded against a slot that no longer exists is still a
      // machine; show it rather than dropping it silently.
      const at = t.slot >= 0 && t.slot < MAX_SLOTS ? t.slot : slots.findIndex((s) => s === null);
      if (at >= 0) slots[at] = shape(t);
    }
    return NextResponse.json({ slots, max: MAX_SLOTS });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}

/** PUT /api/tenants — record a machine, if there is a slot for it. */
export async function PUT(request: Request) {
  const body = (await request.json()) as {
    authority: string;
    slot: number;
    label: string;
    registry: Address;
    meshAddress: string | null;
    agent: string | null;
    cap: string;
    status: "provisioning" | "live" | "revoked";
    agentId?: Hex;
    request?: unknown;
  };

  if (!ADDRESS.test(body.authority ?? "")) {
    return NextResponse.json({ error: "which device?" }, { status: 400 });
  }
  if (!SAFE.test(body.label ?? "")) {
    return NextResponse.json({ error: "bad label" }, { status: 400 });
  }

  try {
    if (body.status === "revoked") {
      await markRevoked(body.label);
      return NextResponse.json({ ok: true });
    }

    const room = await slotAvailable(body.authority, body.slot, body.label);
    if (!room.ok) return NextResponse.json({ error: room.why }, { status: 409 });

    await saveTenant({
      _id: body.label,
      authority: body.authority,
      slot: body.slot,
      label: body.label,
      registry: body.registry,
      meshAddress: body.meshAddress ?? null,
      agent: body.agent ?? null,
      cap: body.cap,
      status: body.status,
      agentId: body.agentId,
      request: body.request,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}

/** What the page needs, without the bookkeeping it does not. */
function shape(t: Awaited<ReturnType<typeof slotsOf>>[number]) {
  return {
    label: t.label,
    registry: t.registry,
    meshAddress: t.meshAddress,
    agent: t.agent,
    cap: t.cap,
    status: t.status,
    agentId: t.agentId,
    request: t.request,
  };
}
