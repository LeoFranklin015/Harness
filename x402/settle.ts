// Settling a payment through the Agent's own registry.
//
// This is where the ceiling actually bites. The Agent signs a batch; anyone may
// relay it; the registry checks the Agent is live, the call is permitted, and
// the spend fits inside the window — and reverts if not. An Agent that has run
// out of headroom cannot pay, and no amount of retrying changes that.

import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  BATCH_TYPES,
  GRANT_TYPES,
  REGISTRY_ABI,
  publicClient,
  wallet,
  type Call,
  type Grant,
} from "./harness.ts";

/**
 * The whole tree shares one EIP-712 domain, scoped to the registry at its root.
 * Binding to each instance would make a Grant hash differently in the registry
 * that issued it and the registry of the child that must verify it.
 */
export function domain(rootOfTree: Address) {
  return {
    name: "AgentRegistry",
    version: "1",
    chainId: 11155111,
    verifyingContract: rootOfTree,
  } as const;
}

/** A USDC transfer, shaped exactly as if the Agent called the token itself. */
export function transferCall(token: Address, to: Address, amount: bigint): Call {
  return {
    to: token,
    value: 0n,
    data: encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "transfer",
          stateMutability: "nonpayable",
          inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ type: "bool" }],
        },
      ],
      functionName: "transfer",
      args: [to, amount],
    }),
  };
}

/**
 * Signs a batch as the Agent and relays it.
 *
 * The Agent never sends a transaction of its own. An Agent runs constantly and
 * must never need gas: funding every Agent key would strand each of them behind
 * a balance to top up, and would put ether in reach of a key whose whole point
 * is that it can only do what its Grant allows.
 */
export async function settle(opts: {
  registry: Address;
  rootOfTree: Address;
  grant: Grant;
  agentPk: Hex;
  relayerPk: Hex;
  calls: Call[];
}): Promise<Hex> {
  const id = hashTypedData({
    domain: domain(opts.rootOfTree),
    types: GRANT_TYPES,
    primaryType: "Grant",
    message: opts.grant,
  });

  const nonce = (await publicClient.readContract({
    address: opts.registry,
    abi: REGISTRY_ABI,
    functionName: "nonces",
    args: [id],
  })) as bigint;

  // The calls are committed to as a hash of hashes, so a relayer carries a
  // signature it cannot alter and cannot point somewhere else.
  const callsHash = keccak256(
    ("0x" +
      opts.calls
        .map((c) =>
          keccak256(
            encodeAbiParameters(parseAbiParameters("address, uint256, bytes32"), [
              c.to,
              c.value,
              keccak256(c.data),
            ]),
          ).slice(2),
        )
        .join("")) as Hex,
  );

  const agent = privateKeyToAccount(opts.agentPk);
  const agentSig = await agent.signTypedData({
    domain: domain(opts.rootOfTree),
    types: BATCH_TYPES,
    primaryType: "Batch",
    message: { agentId: id, nonce, calls: callsHash },
  });

  const relayer = wallet(opts.relayerPk);
  const hash = await relayer.writeContract({
    address: opts.registry,
    abi: REGISTRY_ABI,
    functionName: "execute",
    args: [opts.grant, opts.calls, nonce, agentSig],
    chain: relayer.chain,
    account: relayer.account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`settlement reverted: ${hash}`);
  return hash;
}
