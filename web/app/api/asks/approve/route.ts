import { NextResponse } from "next/server";
import { createPublicClient, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { agentKeyFor } from "@/lib/agent-root";
import { batchCalldata, DELEGATE, delegateFrom } from "@/lib/delegation";
import { asksFor } from "@/lib/pending";
import { sepoliaTransport } from "@/lib/rpc";
import { allowanceFor, calldata, firstGrant, REGISTRY_ABI, USDC } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The transaction that would approve an ask, unsigned.
 *
 * The dashboard signs this over WebHID. wallet-cli on a machine with the
 * device attached signs the same bytes over USB or Bluetooth. Neither is
 * privileged over the other, because the bytes are the whole point — they say
 * which registry, which agent, and what ceiling, and the device shows that
 * before anyone approves it.
 *
 * Handing out calldata grants nothing. Anyone can ask what a transaction would
 * look like; only the account it is from can make it real.
 */

const label = /^[a-z0-9][a-z0-9-]*$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenant = url.searchParams.get("tenant") ?? "";
  const id = url.searchParams.get("id") ?? "";
  const registry = url.searchParams.get("registry") as Address | null;
  const days = Number(url.searchParams.get("days") ?? 30);
  const currentCapUsd = Number(url.searchParams.get("cap") ?? 0);

  if (!label.test(tenant)) return NextResponse.json({ error: "which machine?" }, { status: 400 });
  if (!registry || !/^0x[0-9a-fA-F]{40}$/.test(registry)) {
    return NextResponse.json({ error: "which registry?" }, { status: 400 });
  }

  const ask = asksFor(tenant).find((a) => a.id === id);
  if (!ask) return NextResponse.json({ error: "no such ask" }, { status: 404 });

  const newCapUsd = currentCapUsd + ask.usd;

  try {
    const client = createPublicClient({ chain: sepolia, transport: sepoliaTransport() });

    // Named on the registry rather than remembered, so this works for a
    // machine provisioned by a session nobody still has open.
    const spender = (await client.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: "executor",
    })) as Address;

    const rootDevice = (await client.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: "rootDevice",
    })) as Address;

    const grant = firstGrant({
      label: ask.label,
      agentKey: agentKeyFor(tenant, ask.label).address,
      capUsd: newCapUsd,
      days,
    });

    // Two calls: the token allowance has to cover the new ceiling over the
    // Grant's whole life, and then the Grant itself.
    const calls = [
      { to: USDC, data: calldata.approve(spender, allowanceFor(newCapUsd, days)) },
      { to: registry, data: calldata.grant(grant) },
    ];

    // An upgraded account does both in one transaction — a self-call carrying
    // executeBatch, which is what the device already signs for provisioning.
    // A plain EOA has to send them one at a time.
    const code = (await client.getCode({ address: rootDevice })) as Hex | undefined;
    const upgraded = delegateFrom(code)?.toLowerCase() === DELEGATE.toLowerCase();

    return NextResponse.json({
      ask,
      from: rootDevice,
      newCapUsd,
      upgraded,
      // What to sign. One entry if the account is upgraded, two if not.
      transactions: upgraded
        ? [{ to: rootDevice, data: batchCalldata(calls), what: `raise ${tenant} to $${newCapUsd}` }]
        : [
            { to: calls[0]!.to, data: calls[0]!.data, what: "allow the executor to draw" },
            { to: calls[1]!.to, data: calls[1]!.data, what: `raise ${tenant} to $${newCapUsd}` },
          ],
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
