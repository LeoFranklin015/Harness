# Payments use x402, funded just-in-time

An earlier draft of this design ruled out x402 and EIP-3009 entirely, in favour of a direct
on-chain transfer. That reasoning conflated two separate problems, one of which turned out
not to exist. We use x402, and we solve the real problem by funding the Agent Key for
exactly one Action.

## The two problems, separated

**Chain support — not a blocker.** Coinbase's facilitator supports Base Sepolia and not
Ethereum Sepolia, which is where our ENS and policy state live. But
`facilitator.x402.rs` supports `eip155:11155111` today, with funded signers, schemes
`exact` and `upto`. Sepolia USDC is at `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
(6 decimals) with `TRANSFER_WITH_AUTHORIZATION_TYPEHASH` and `DOMAIN_SEPARATOR` both
resolving on-chain.

**Smart-contract signers — a real blocker.** EIP-3009 `transferWithAuthorization` requires
an EOA ECDSA signature. Any contract that custodies funds cannot produce one. Removing the
custody contract does not remove this problem; it relocates it.

This was challenged on the grounds that Circle added EIP-1271 support in FiatTokenV2_2, so
a contract could be the payer. **Checked on-chain; it does not apply to our deployment.**
Sepolia USDC `0x1c7D4B19…` is a `FiatTokenProxy` whose implementation (read from the
`org.zeppelinos.proxy.implementation` slot) is `0xda317c1d3e835dd5f1be459006471acaa1289068`,
and `version()` returns **`"2"`** — V2/V2_1, predating V2_2. `0x1626ba7e`
(`isValidSignature`) does not appear in its bytecode, and a live `eth_call` to the
`bytes`-signature overload reverts `ECRecover: invalid signature`: the overload exists but
unpacks to ECDSA recovery. A contract cannot be the payer here.

Note this is a fact about *this deployment*, not about USDC generally. Other chains may run
V2_2. Do not repeat the claim about any deployment without re-checking `version()`.

## The resolution

Funds stay in the tenant's own 7702-delegated account. At onboarding, one device tap
approves an ERC-20 allowance to the policy contract. Thereafter the policy contract — and
only the policy contract — pulls via `transferFrom` when an Action passes its check. No
further taps, no custody contract, and the allowance is a second ceiling enforced by USDC
beneath our own.

**The allowance goes to the policy contract, never to an Agent Key.** An Agent Key holding
an allowance could call `transferFrom` itself for the whole amount without consulting
Policy, which returns the cap to being advisory. The Agent Key signs a *request*; the
contract decides.

When an Action passes, the contract pulls exactly the approved amount to the Agent Key — an
ordinary EOA — which signs the EIP-3009 authorization and the facilitator settles.

The "a child never has custody" invariant degrades to "a child has custody of exactly the
approved amount, for exactly one Action." That is a defensible sentence, and it buys real
x402 interoperability: our Seller becomes callable by any x402 agent, not only ours.

## Considered and rejected

- **Direct `transfer()` with no x402.** Simpler and safe — one transaction, zero custody —
  but no interoperability. This remains the fallback if just-in-time funding proves
  troublesome; falling back costs nothing but the interop claim.
- **A standing float per Agent.** Rejected outright: it hands the child a persistent
  balance, which means the Cap is no longer enforced at the moment of action. That is the
  core claim of the whole system, so this option is not available at any price.

## Required invariants

These are not implementation details; without them the system does not enforce a cap.

- **`Spent` increments in the same transaction as the disbursement, never after
  settlement.** Settlement happens at a third-party facilitator and is not observable to
  our contract. If the counter waited for it, an Agent could request a disbursement and
  simply never settle — declining to sign, letting `validBefore` lapse, or relying on a
  facilitator error — leaving funds on its key with `Spent` still zero, repeatable
  indefinitely. That failure path recreates the standing float this ADR rejects.
- **The check and the pull are one atomic on-chain call.** A check performed off-chain, or
  in a separate transaction from the transfer, lets concurrent Actions all read the same
  `Spent` and all pass. The Lease serialises Runners, not Actions, and one Runner issuing
  parallel tool calls is the normal case.
- **Price is read from the seller's 402 response before the pull**, and the exact amount is
  disbursed. Disbursing from a cached price either underfunds (settlement reverts) or
  overfunds (residue).
- **Amounts are atomic units end to end.** Cap, Spent and x402's `maxAmountRequired` are all
  6-decimal atomic units. One implicit conversion is a 10^6 error in either direction.

## Consequences

- USDC that reaches an Agent Key and is never spent — a reverted settlement, a seller
  failure, a lapsed `validBefore` — is stranded, because the Agent Key holds no gas. `Spent`
  is consumed for nothing. Accept this and document it, or fund a sweep; do not solve it by
  leaving a standing balance.
- A signed EIP-3009 authorization is a bearer instrument valid until `validBefore` and is
  not revocable on-chain. Revoking an Agent mid-flight does not stop an already-signed
  payment. Keep `validBefore` short.
- The signed message does not name the resource, so the Tool allowlist is enforced on the
  disbursement, not on the payment.
- Two on-chain operations per payment rather than one.
- No third-party payable endpoints exist on Ethereum Sepolia — the discovery index returns
  zero results for `eip155:11155111` — so we run our own Seller. Keep a self-hosted
  `x402-rs` configuration in the repo as a fallback if the public facilitator is
  unavailable during the demo.
