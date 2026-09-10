# x402

An Agent that pays for what it uses, inside a ceiling it cannot cross, with no
human in the loop.

There are two ways to do it here, and they trade against each other. Both work
against Sepolia; neither is a mock.

```
# standard x402 — any x402 seller can take this money
node --experimental-strip-types seller-exact.ts
node --experimental-strip-types agent-exact.ts research 2

# bounded settlement — nothing to steal, but the seller must speak our scheme
node --experimental-strip-types seller.ts
node --experimental-strip-types agent.ts scout 4
node --experimental-strip-types revoke-demo.ts
```

## What runs where

Everything under `x402/` except the seller runs **inside the Agent's container**.
What must not is the point:

| in the container | outside it |
|---|---|
| the Agent process | the Tenant's key — holds the funds, gave the allowance |
| the Agent Key — signs batches and EIP-3009 authorizations | the device — a Ledger, physically elsewhere |
| a **burner** relayer key, with gas and no authority | the seller and the facilitator — other people entirely |
| the Grant JSON, an RPC URL, outbound HTTPS | |

`RELAYER_PK` is deliberately a burner. An Agent holding the Tenant's key could
call `transfer` on the token directly and empty the account without ever
touching the registry — the ceiling would be decorative. The burner holds no
authority at all; the worst an Agent can do with it is waste its own gas.

Proven by running the Agent with the Tenant's key absent from its environment:

```
env -u PRIVATE_KEY RELAYER_PK=$(cat .relayer) node … agent-exact.ts research 1

funding tx  from 0x263Bdf219e649d8b8c05aa311C2b0086b082A43B   ← the burner
            USDC 0xe08224b2…(the Tenant) → 0xd98ec625…(the Agent)  0.25
```

The Tenant's money moved without the Tenant's key being anywhere near the
container. That is what the allowance and the registry are for.

The container also holds USDC between funding and settlement — one payment's
worth, briefly. That is the exposure named under *Why `exact` needs funding*,
and it is why the Agent is funded one payment at a time.

## Where an Agent Key comes from

Not from the Ledger Key Ring directly, though that is the tempting shape. The
ring shares one root across every member, so `HKDF(ringRoot, label)` would let
any member derive **every** Agent's key — a compromised `research` container
could then act as `scout`, up to scout's Grant. Siblings must not be able to
impersonate each other; that isolation is most of what the hierarchy is for.

So the ring seals and a separate root derives (`keys.ts`):

| | |
|---|---|
| ring membership | the VPS — the USB-less enrolment |
| agent root secret | one per Tenant, held by the VPS as `wallet-cli ring encrypt --key harness-agents` ciphertext under that Tenant's ring; opened only to derive. Survives reboots, recoverable from the Ledger seed, dead once the host is removed from the ring |
| an Agent's key | `HKDF(root, "harness/agent/<tenant>/<label>")` |
| the container | gets only its own key, never the root — so it can derive nothing but itself |

wallet-cli expects to have joined the ring itself over USB. `tools/harness-ring` lends it the member this host joined as through the browser relay: a per-Tenant state directory and the member key in a kernel session keyring that lives for one command. You can open the same ciphertext on any laptop in your ring with `wallet-cli ring decrypt --key harness-agents`.

This also settles an ordering problem. Because the VPS holds the root, it can
compute an Agent's address **before its container exists**, so the device signs
a Grant for a key it never holds and never has to wait for a container to start:

```
$ node --experimental-strip-types keys.ts demo newsdesk
0x713C90e9C29Add4Fb6c1ecbCD74FD1675F487d4F

$ AGENT_KEY=0x713C… forge script script/GrantAgent.s.sol …
```

Agents granted before `keys.ts` existed carry keys derived from a public string
— `keccak256("research-agent-key")` — which anyone reading this repo can
compute. They are worth nothing by construction, and `load()` says so out loud
rather than treating them as real:

```
  ! research uses a publicly derivable demo key — anyone can compute it
```

## The choice

|  | `exact` (standard) | `harness-settled` |
|---|---|---|
| works with | any x402 seller | sellers who adopt it |
| ceiling enforced at | funding | paying |
| Agent holds funds | one payment, briefly | never |
| revoked mid-flight | the funded payment still goes through | refused, in both places |

Neither dominates. `exact` is the one to show a judge who wants x402
interoperability; `harness-settled` is the one that makes revocation mean
something. They share the Grant, the registry and the cap.

## Both halves are theirs

```
node --experimental-strip-types seller-express.ts        # their server
node --experimental-strip-types agent-exact.ts research  # their client
SELLER=http://127.0.0.1:4023 …                           # point one at the other
```

`seller-express.ts` contains no x402 code at all — only a price, an address and
a route handler. `@x402/express`'s `paymentMiddlewareFromConfig` puts up the
paywall, `@x402/evm`'s server-side `ExactEvmScheme` shapes the 402, and
`HTTPFacilitatorClient` sends verification and settlement to a public
facilitator. The buyer is their client. Nothing of ours is in the payment path:

```
round 1  headroom $7.75 of $10  holding $0
  exact/eip155:11155111: $0.25 to 0x…dEaD
  funded $0.25 under the Grant — 0x1fc270db…    ← ours: the ceiling
  served: "42"
  settled 0xe9de39d4… on eip155:11155111        ← theirs: the payment
```

```
settlement tx  from 0x0168f80e035eA68B191FAf9Bfc12778C87d92008   ← the facilitator
               USDC 0xd98ec625…(the Agent) → 0x…dEaD (the seller)  0.25
```

Our contribution is one transaction — funding the Agent, which the registry
allows only inside the cap. Everything after it is x402's.

`seller-exact.ts` is kept as a hand-written seller because it shows what the
protocol requires; `seller-express.ts` is the one to believe.

## Against third-party infrastructure

The buyer pays with the official client. The seller settles through
**`facilitator.x402.rs`**, an unaffiliated public facilitator, which is one of
the few that supports `eip155:11155111` — the Coinbase Bazaar's live catalogue
is mainnet only (Base, Solana, Polygon, Arbitrum) and `x402.org/facilitator`
stops at Base Sepolia.

So a service that has never heard of this project verified our Agent's payment,
named the payer correctly, and put it on chain:

```
  facilitator verified, payer 0xD98eC6253526E9b690597bD3B5f871eF7200086E
  ✓ settled 0x3889babe…
```

```
settlement tx  from 0x97D38AA5dE015245DCCa76305b53ABe6DA25F6a5   ← theirs, not ours
               USDC 0xd98ec625…(the Agent) → 0x…dEaD (the seller)  0.25
```

That `from` is the whole point: **they** paid the gas and **they** submitted it.
Nothing in that transaction is ours except the signature the Agent produced and
the authority that let it be funded. `FACILITATOR=self` falls back to settling
in-process if the remote one is down.

## Standard means their client, not our best guess

`agent-exact.ts` pays using **`@x402/core` and `@x402/evm`** — the official
packages. Their `x402Client` reads the 402, selects a requirement, and their
`ExactEvmScheme` builds and signs the EIP-3009 authorization. Our only
contribution is the signer, and how that signer came to hold any money.

That matters because writing the payment ourselves and calling it standard is a
claim; having their client write it is a property. Their client also validates
our seller in the process, which is how the following were found — every one of
them would have made this work against our own seller and fail against anyone
else's:

| | v2 | what we had |
|---|---|---|
| 402 requirements | `PAYMENT-REQUIRED` header | the response body |
| payment | `PAYMENT-SIGNATURE` header | `X-PAYMENT` |
| receipt | `PAYMENT-RESPONSE` header | `X-PAYMENT-RESPONSE` |
| payload root | `{x402Version, accepted, payload}` | `{x402Version, scheme, network, payload}` |
| resource info | top-level object on the 402 | inside each `accepts` entry |

The body is v1's channel; a v2 client never reads it and throws *"Invalid
payment required response"* before it looks at the terms. The old payload shape
was v1's, carrying a v2 version number — valid under neither schema.

Their client also brings spend controls of its own and allows only assets it
recognises, which Sepolia USDC is not. So it is named explicitly with a
per-payment cap. Two independent ceilings then apply: **theirs**, in the client,
which the Agent could disable because it runs the client — and **ours**, in the
registry, which it cannot.

## Why `exact` needs funding

`transferWithAuthorization` recovers the signer and requires it to equal `from`.
This USDC is FiatToken v2.1 — implementation
`0xda317c1d3e835dd5f1be459006471acaa1289068`, which has no `isValidSignature`,
so there is no EIP-1271 path and no contract signer. **Whoever signs must be the
account that holds the tokens.** That is a property of the token, not a choice.

So the Agent holds it, briefly, and the interesting question is how it gets it:
it asks the registry. Funding is itself a USDC transfer out of the Tenant's
account, so it passes the same check every other spend does — permitted call,
live Agent, inside the daily cap. The ceiling has not been given up; it has
moved one step earlier, from the moment of paying to the moment of being funded.

A run, with the two transactions it produces:

```
round 2  headroom $8.5 of $10  holding $0
  exact/eip155:11155111: $0.25 to 0x…dEaD
  funded $0.25 under the Grant — 0xefb45c20…
  served: "42" (settled 0x946ea61d…)
```

```
funding    → called the registry   USDC tenant  → agent   0.25   (cap checked here)
settlement → called USDC itself    USDC agent   → seller  0.25   (EIP-3009)
```

The ceiling still ends the run, one step earlier than before —
`probe.demo.harness.eth`, $0.30/day:

```
round 1  headroom $0.3 of $0.3   → served
round 2  headroom $0.05 of $0.3
  HALTED. $0.05 left of $0.3; cannot be funded.
  The ceiling refused the funding, so there is nothing to pay with.
```

**What it costs.** Between funding and settlement the Agent holds real money,
and revoking it in that window does not claw the money back. So it is funded one
payment at a time and what is at risk is one payment. This is not hypothetical:
while building this, a seller crashed mid-settlement and left $0.25 stranded in
the Agent's account, which the next round then spent. Funds that reach an Agent
stay there until the Agent moves them.

## Why the other scheme exists

Funding an Agent, however briefly, is custody — and custody is total authority
for as long as it lasts. `harness-settled` gives that up: funds move **tenant →
seller directly**, under an allowance, and the Agent never holds anything. It
signs an instruction the registry will honour, and the registry checks the
ceiling at the instant of spending rather than at funding.

x402 has a `scheme` field for exactly this kind of thing. The cost is that a
stock x402 seller does not know the scheme and will not take the payment.

## What the seller verifies

1. **Is this Agent still allowed to act?** Resolve its ENS name and read
   `addr()`. A revoked Agent has no address — not because a record was deleted,
   but because the answer is computed from its authority and the answer became
   no. The seller uses `viem`'s ordinary `getEnsAddress`; it runs none of our
   code and trusts nothing we told it earlier.
2. **Did that Agent authorise this redemption?** An EIP-712 signature over
   `(txHash, resource, payTo, amount)`, recovered against the key ENS just
   named. Without this, anyone watching the chain could present someone else's
   settlement as their own.
3. **Was this settlement already spent?** One transaction buys one thing.
4. **Did the money arrive?** Read the USDC `Transfer` out of the receipt rather
   than believing the payload.

The payment is not bound to a particular resource beyond the signature, which is
deliberate: single redemption already means one payment buys one request, and
the buyer choosing which request is not a problem the seller has.

## Runs, against Sepolia, 2026-09-05

**The ceiling halts the Agent.** `scout.demo.harness.eth`, $0.60/day, $0.25 a
call:

```
round 1  headroom $0.6 of $0.6 today   → served
round 2  headroom $0.35 of $0.6 today  → served
round 3  headroom $0.1 of $0.6 today
  HALTED. $0.1 left of $0.6; this call needed more.
```

Nobody approved rounds 1 and 2 and nobody refused round 3. The device set the
ceiling once; the registry did the rest.

**Revocation lands in two places at once.** `courier.demo.harness.eth` pays,
then the device revokes before it can redeem:

```
ENS says its key is 0x2EC0B6b4137c056385558f6253Dd225065AAe431
paid 0.25 USDC — 0x8dae1232…
revoking …
  ENS now says its key is null
redeeming the payment it already made → 402
  courier.demo.harness.eth has no key — revoked, expired, or unknown
settling again → refused by the registry: no authority to spend
```

One write. The seller refuses because ENS stopped answering; the registry
refuses because the Agent has no authority. Neither was told about the other —
both are reading the same fact.

## The Grant has to be kept

A Grant lives on-chain only as a hash, so anything that later acts under one has
to resupply the struct byte for byte, timestamps included. The chain will not
hand it back. `contracts/script/GrantAgent.s.sol` therefore writes each Grant
into `grants/` as it issues it: issuing and recording are one step, because the
issuer is the only party who can do the recording.
