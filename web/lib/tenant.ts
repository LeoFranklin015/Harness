import { encodeFunctionData, parseEventLogs, type Address, type Hex, type Log } from "viem";

/**
 * What the device signs, and how to build it.
 *
 * Three calls make a Tenant real, and every one of them is gated on
 * `rootDevice` — so every one is a signature on the Ledger, not a request to a
 * server. The platform onboarded the Tenant; from here on it can only watch.
 */

export const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address;

/** `transfer(address,uint256)` — the one call an Agent's Grant permits. */
const TRANSFER = "0xa9059cbb" as Hex;

/** Period.Day in the contract's enum. */
const DAY = 2;

export const REGISTRY_ABI = [
  {
    type: "function",
    name: "setExecutor",
    stateMutability: "nonpayable",
    inputs: [{ name: "executor_", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "selfEndpoint",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes4" }],
  },
  {
    type: "function",
    name: "rootDevice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "executor",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "selfOperator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "selfHostKey",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "setHost",
    stateMutability: "nonpayable",
    inputs: [
      { name: "ipv4", type: "bytes4" },
      { name: "sshHostKey", type: "bytes32" },
      { name: "operator", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "grant",
    stateMutability: "nonpayable",
    inputs: [
      { name: "g", type: "tuple", components: GRANT_COMPONENTS() },
      { name: "parentGrant", type: "tuple", components: GRANT_COMPONENTS() },
    ],
    outputs: [{ name: "agentId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "revoke",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "event",
    name: "Granted",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "parent", type: "bytes32", indexed: true },
      { name: "label", type: "string", indexed: false },
      { name: "agentKey", type: "address", indexed: false },
    ],
  },
] as const;

function GRANT_COMPONENTS() {
  return [
    { name: "parent", type: "bytes32" },
    { name: "label", type: "string" },
    { name: "agentKey", type: "address" },
    { name: "start", type: "uint48" },
    { name: "end", type: "uint48" },
    { name: "salt", type: "uint256" },
    {
      name: "calls",
      type: "tuple[]",
      components: [
        { name: "target", type: "address" },
        { name: "selector", type: "bytes4" },
        { name: "maxValue", type: "uint128" },
        { name: "checker", type: "address" },
        { name: "checkerCodeHash", type: "bytes32" },
      ],
    },
    {
      name: "spends",
      type: "tuple[]",
      components: [
        { name: "token", type: "address" },
        { name: "allowance", type: "uint160" },
        { name: "unit", type: "uint8" },
        { name: "multiplier", type: "uint16" },
      ],
    },
  ] as const;
}

export type Grant = {
  parent: Hex;
  label: string;
  agentKey: Address;
  start: number;
  end: number;
  salt: bigint;
  calls: readonly {
    target: Address;
    selector: Hex;
    maxValue: bigint;
    checker: Address;
    checkerCodeHash: Hex;
  }[];
  spends: readonly { token: Address; allowance: bigint; unit: number; multiplier: number }[];
};

const ZERO32 = `0x${"0".repeat(64)}` as Hex;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as Address;

/** An empty Grant — what a Tenant's root passes as `parentGrant`. */
export const NO_PARENT: Grant = {
  parent: ZERO32,
  label: "",
  agentKey: ZERO_ADDR,
  start: 0,
  end: 0,
  salt: BigInt(0),
  calls: [],
  spends: [],
};

/**
 * A first Agent: USDC transfers only, a daily ceiling, a fixed window.
 *
 * `start` is a minute in the past so a block that lands a few seconds early
 * still finds the Grant live. The struct is what the device shows and what the
 * chain hashes — nothing here may be changed after signing without producing a
 * different Agent.
 */
export function firstGrant(opts: {
  label: string;
  agentKey: Address;
  capUsd: number;
  days: number;
}): Grant {
  const now = Math.floor(Date.now() / 1000);
  return {
    parent: ZERO32,
    label: opts.label,
    agentKey: opts.agentKey,
    start: now - 60,
    end: now + Math.round(opts.days * 86400),
    salt: BigInt(0),
    calls: [
      { target: USDC, selector: TRANSFER, maxValue: BigInt(0), checker: ZERO_ADDR, checkerCodeHash: ZERO32 },
    ],
    spends: [
      { token: USDC, allowance: BigInt(Math.round(opts.capUsd * 1_000_000)), unit: DAY, multiplier: 1 },
    ],
  };
}

/**
 * The token's own approval. Not ours, and deliberately so.
 *
 * The Tenant's USDC never leaves the Tenant's account for a contract to hold —
 * the executor pulls what a Grant permits, when it is permitted, with
 * `transferFrom`. ERC-20 requires an allowance for that, so this is the
 * signature that makes funding possible at all.
 *
 * It is a second, independent ceiling: the allowance is the most the executor
 * can *ever* move, where the Grant's cap is the most it can move in a day. Set
 * it to what the Grant could spend if it ran to the end at full rate, so it
 * bounds the same thing the device already agreed to rather than being open.
 */
const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** What the Grant could spend over its whole life, in USDC's six decimals. */
export function allowanceFor(capUsd: number, days: number): bigint {
  return BigInt(Math.round(capUsd * 1_000_000)) * BigInt(Math.max(1, Math.ceil(days)));
}

export const calldata = {
  /** A plain ERC-20 transfer, for when the owner pays something themselves. */
  transfer: (to: Address, value: bigint) =>
    encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [to, value] }),
  approve: (executor: Address, value: bigint) =>
    encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [executor, value] }),
  setExecutor: (executor: Address) =>
    encodeFunctionData({ abi: REGISTRY_ABI, functionName: "setExecutor", args: [executor] }),
  setHost: (ipv4: Hex, hostKey: Hex, operator: Hex) =>
    encodeFunctionData({ abi: REGISTRY_ABI, functionName: "setHost", args: [ipv4, hostKey, operator] }),
  grant: (g: Grant) =>
    encodeFunctionData({ abi: REGISTRY_ABI, functionName: "grant", args: [g, NO_PARENT] }),
  revoke: (agentId: Hex) =>
    encodeFunctionData({ abi: REGISTRY_ABI, functionName: "revoke", args: [agentId] }),
};

/** The Agent's id, read back from the receipt rather than recomputed. */
export function agentIdFrom(logs: Log[]): Hex | null {
  const [ev] = parseEventLogs({ abi: REGISTRY_ABI, eventName: "Granted", logs });
  return (ev?.args.agentId as Hex) ?? null;
}

/**
 * The host record as it stands, so opening a door does not move the machine.
 *
 * `setHost` writes the address, the host key and the operator together, on
 * purpose — they are one fact about one machine. That means authorising a
 * visitor has to resend the two that are not changing, read from the chain
 * rather than remembered, so a stale page cannot quietly relocate a Tenant.
 */
export async function readHost(
  client: { readContract: (a: never) => Promise<unknown> },
  registry: Address,
): Promise<{ ipv4: Hex; hostKey: Hex; operator: Hex }> {
  const call = (functionName: "selfEndpoint" | "selfHostKey" | "selfOperator") =>
    client.readContract({ address: registry, abi: REGISTRY_ABI, functionName } as never);

  const [ipv4, hostKey, operator] = await Promise.all([
    call("selfEndpoint"),
    call("selfHostKey"),
    call("selfOperator"),
  ]);
  return { ipv4: ipv4 as Hex, hostKey: hostKey as Hex, operator: operator as Hex };
}
