// The pieces both sides of an x402 exchange need: what a Grant is, how it is
// hashed, and how a payment is settled through the registry that bounds it.

import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

export const RPC =
  process.env.HARNESS_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";

/** ETHOnline 2026 hackathon ENSv2 deployment — see ADDRESSES.md. */
export const UNIVERSAL_RESOLVER =
  "0xd26f2040d083af1cd2962ba303f4bea0c4faf142" as Address;
export const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address;

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC),
});

export function wallet(pk: Hex) {
  return createWalletClient({
    account: privateKeyToAccount(pk),
    chain: sepolia,
    transport: http(RPC),
  });
}

// --- the Grant ------------------------------------------------------------

export type CallRule = {
  target: Address;
  selector: Hex;
  maxValue: bigint;
  checker: Address;
  checkerCodeHash: Hex;
};

export type SpendLimit = {
  token: Address;
  allowance: bigint;
  unit: number;
  multiplier: number;
};

export type Grant = {
  parent: Hex;
  label: string;
  agentKey: Address;
  start: number;
  end: number;
  salt: bigint;
  calls: CallRule[];
  spends: SpendLimit[];
};

export type Call = { to: Address; value: bigint; data: Hex };

/**
 * The EIP-712 types, matching `GrantLib`'s typehashes exactly.
 *
 * A Grant is stored on-chain only as a hash, so every caller has to resupply
 * the struct byte for byte — timestamps included. Getting a field wrong here
 * produces a different `agentId`, and the registry answers "no such Agent"
 * rather than "you hashed it wrong".
 */
export const GRANT_TYPES = {
  Grant: [
    { name: "parent", type: "bytes32" },
    { name: "label", type: "string" },
    { name: "agentKey", type: "address" },
    { name: "start", type: "uint48" },
    { name: "end", type: "uint48" },
    { name: "salt", type: "uint256" },
    { name: "calls", type: "CallRule[]" },
    { name: "spends", type: "SpendLimit[]" },
  ],
  CallRule: [
    { name: "target", type: "address" },
    { name: "selector", type: "bytes4" },
    { name: "maxValue", type: "uint128" },
    { name: "checker", type: "address" },
    { name: "checkerCodeHash", type: "bytes32" },
  ],
  SpendLimit: [
    { name: "token", type: "address" },
    { name: "allowance", type: "uint160" },
    { name: "unit", type: "uint8" },
    { name: "multiplier", type: "uint16" },
  ],
} as const;

export const BATCH_TYPES = {
  Batch: [
    { name: "agentId", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "calls", type: "bytes32" },
  ],
} as const;

// --- ABIs -----------------------------------------------------------------

export const REGISTRY_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "g",
        type: "tuple",
        components: [
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
        ],
      },
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
      { name: "nonce", type: "uint256" },
      { name: "agentSig", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "hashGrant",
    stateMutability: "view",
    inputs: [{ name: "g", type: "tuple", components: [] }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "spentOf",
    stateMutability: "view",
    inputs: [
      { type: "bytes32" },
      {
        name: "limit",
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          { name: "allowance", type: "uint160" },
          { name: "unit", type: "uint8" },
          { name: "multiplier", type: "uint16" },
        ],
      },
    ],
    outputs: [
      {
        name: "period",
        type: "tuple",
        components: [
          { name: "start", type: "uint48" },
          { name: "end", type: "uint48" },
          { name: "spend", type: "uint160" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "domainSeparator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
] as const;

export const RESOLVER_ABI = [
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { type: "bytes" },
      { type: "address" },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
