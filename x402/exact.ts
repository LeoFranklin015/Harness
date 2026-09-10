// EIP-3009, the way x402's `exact` scheme wants it.
//
// `transferWithAuthorization` recovers the signer and requires it to equal
// `from`, and this USDC is FiatToken v2.1 — no `isValidSignature`, so no
// contract signer and no EIP-1271. Whoever signs must be the EOA that holds the
// tokens. That is why paying this way needs the Agent funded first: it is a
// property of the token, not a choice we made.

import { hashTypedData, type Address, type Hex } from "viem";
import { USDC } from "./harness.ts";

/** Matches the token's own DOMAIN_SEPARATOR — checked against the chain. */
export const USDC_DOMAIN = {
  name: "USDC",
  version: "2",
  chainId: 11155111,
  verifyingContract: USDC,
} as const;

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export type Authorization = {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

export function authorizationDigest(a: Authorization): Hex {
  return hashTypedData({
    domain: USDC_DOMAIN,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: a,
  });
}

export const USDC_3009_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** x402 sends the authorization as decimal strings, not numbers. */
export function toWire(a: Authorization) {
  return {
    from: a.from,
    to: a.to,
    value: a.value.toString(),
    validAfter: a.validAfter.toString(),
    validBefore: a.validBefore.toString(),
    nonce: a.nonce,
  };
}

export function fromWire(w: any): Authorization {
  return {
    from: w.from,
    to: w.to,
    value: BigInt(w.value),
    validAfter: BigInt(w.validAfter),
    validBefore: BigInt(w.validBefore),
    nonce: w.nonce,
  };
}
