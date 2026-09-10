import { encodeFunctionData, type Address, type Hex } from "viem";

/**
 * Turning the Tenant's account into one that can do four things at once.
 *
 * Onboarding is four separate calls — point at the executor, publish the
 * machine, allow the draw, set the ceiling — and each one is a signature,
 * because an ordinary account can only do one thing per transaction. EIP-7702
 * lets an account carry code, and the code we point at can run a batch. Four
 * taps become one.
 *
 * The address is not ours to choose. The Ledger's Ethereum app will only sign a
 * delegation to a contract on its own whitelist, and that whitelist has exactly
 * one production entry: eth-infinitism's `Simple7702Account`, listed for every
 * chain. So this is either that address or nothing — which is a good constraint,
 * because it means the code your account runs is a contract Ledger has looked at
 * and not one we wrote.
 */

/** `Simple7702Account`, the only delegate a Ledger will authorise. */
export const DELEGATE = "0x4Cd241E8d1510e30b2076397afc7508Ae59C66c9" as Address;

/** Whitelisted in app-ethereum from this version. Older apps refuse to sign. */
export const MIN_APP_VERSION = "1.22.1";

/**
 * `executeBatch` — restricted to the EntryPoint or the account itself.
 *
 * We are the account: a transaction an account sends to itself arrives with
 * `msg.sender` equal to that account, which satisfies the guard without any
 * ERC-4337 machinery. It also means every call inside the batch is made *by*
 * the Tenant, so the registry still sees its `rootDevice` and USDC still sees
 * its owner. Nothing in the contracts has to know this happened.
 */
const ACCOUNT_ABI = [
  {
    type: "function",
    name: "executeBatch",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export type BatchCall = { to: Address; data: Hex; value?: bigint };

export function batchCalldata(calls: BatchCall[]): Hex {
  return encodeFunctionData({
    abi: ACCOUNT_ABI,
    functionName: "executeBatch",
    args: [calls.map((c) => ({ target: c.to, value: c.value ?? BigInt(0), data: c.data }))],
  });
}

/**
 * Which contract this account currently runs, if any.
 *
 * A delegated account's code is exactly 23 bytes: the marker `0xef0100`
 * followed by the delegate's address. Anything else — usually nothing at all —
 * means a plain account.
 */
export function delegateFrom(code: Hex | undefined): Address | null {
  if (!code || code.length !== 48 || !code.toLowerCase().startsWith("0xef0100")) return null;
  return `0x${code.slice(8)}` as Address;
}

/** True when this account already runs the delegate we would point it at. */
export function isUpgraded(code: Hex | undefined): boolean {
  return delegateFrom(code)?.toLowerCase() === DELEGATE.toLowerCase();
}

/** Compares dotted versions, so "1.22.10" beats "1.22.9" rather than losing to it. */
export function atLeast(version: string, minimum: string): boolean {
  const parts = (v: string) => v.split(".").map((n) => Number(n) || 0);
  const [a, b] = [parts(version), parts(minimum)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const [x, y] = [a[i] ?? 0, b[i] ?? 0];
    if (x !== y) return x > y;
  }
  return true;
}
