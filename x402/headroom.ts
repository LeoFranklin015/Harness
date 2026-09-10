// How much an Agent may still spend in the window it is currently in.
//
// Read from the same counter the registry checks before it lets a payment
// through, so this is the Agent's real headroom rather than a guess at it.

import { hashTypedData, type Address, type Hex } from "viem";
import { GRANT_TYPES, REGISTRY_ABI, publicClient, type Grant } from "./harness.ts";

export function grantId(g: Grant, rootOfTree: Address): Hex {
  return hashTypedData({
    domain: {
      name: "AgentRegistry",
      version: "1",
      chainId: 11155111,
      verifyingContract: rootOfTree,
    },
    types: GRANT_TYPES,
    primaryType: "Grant",
    message: g,
  });
}

export async function headroom(
  registry: Address,
  rootOfTree: Address,
  g: Grant,
  limitIndex = 0,
) {
  const limit = g.spends[limitIndex]!;
  const period = (await publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "spentOf",
    args: [grantId(g, rootOfTree), limit],
  })) as { start: number; end: number; spend: bigint };

  // A window that has already closed has been spent to zero again: the counter
  // is stale rather than carried forward, which is what makes the allowance
  // per-window instead of lifetime.
  const now = Math.floor(Date.now() / 1000);
  const live = period.end > now;
  const spent = live ? period.spend : 0n;

  return {
    cap: limit.allowance,
    spent,
    left: limit.allowance - spent,
    windowEnds: live ? new Date(period.end * 1000) : null,
  };
}
