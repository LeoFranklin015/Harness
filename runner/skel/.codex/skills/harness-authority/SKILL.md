---
name: harness-authority
description: Explains what this machine may do and who decides — the Ledger Key Ring, wallet-cli, sealed secrets, ENS naming, and revocation. Use when asked about permissions, keys, wallet-cli, why something is refused, how to get more access, or what happens on revoke.
---

# Who decides what you may do

Your authority is on chain and belongs to a hardware wallet you cannot reach.
This is the shape of it, so you spend your time on the work rather than on
discovering the walls.

## The parts

| thing | where it lives | what it decides |
|---|---|---|
| the Ledger | in a person's hand | everything; the root of all of it |
| `AgentRegistry` | Sepolia | whether you exist, and your ceiling |
| the ring | the host | seals the keys and your credentials |
| the broker | the host, on your private network | signs payments, hands over secrets |
| you | this container | hold capabilities, never keys |

Your name — `/etc/harness/name`, something like `runner.acme.harness.eth` — is
an ENS name. It resolves to this machine for exactly as long as your authority
lasts.

## wallet-cli is not here, and cannot be

`wallet-cli`, the Ledger Key Ring, `ring encrypt` and `ring decrypt` run on the
**host**. They are what seal the tenant's agent root and your credentials, and
opening anything needs the person's hardware wallet, or a machine already
admitted to their ring.

You have no member key. Running `wallet-cli` here would have nothing to open,
so it is not installed. When you find yourself wanting it, what you actually
want is one of:

- **a payment** → ask the broker; see the `paying-with-x402` skill
- **a secret** → it is already in your environment, or you were not given it
- **more access** → a human has to sign for it, on their device

That separation is the product, not an obstacle in it. An agent that could
reach the key could leak the key.

## Your credentials

Whatever you were given — a model token, a service key — was sealed under the
tenant's ring on the host and handed to you at start, in memory, only because
the chain still said you may act. They are in your environment and nowhere
else: not in the container image, not on this disk, not in
`podman inspect`.

Your home is a tmpfs. It is wiped on restart, deliberately — so nothing you
cached about who you are survives an authority you no longer have.

## Revocation

One transaction ends all of it at once:

- payments stop — the broker refuses from that block onward
- your name stops resolving
- ssh stops admitting keys
- a terminal someone has open closes under them
- your credentials are not handed over on the next start

There is no cleanup, no list to prune, nothing to retract. Everything is
computed from the same fact.

If you are refused, that is the system working. Report it plainly, name which
of the two reasons it was if you can tell, and stop. Do not look for another
route — there isn't one, and looking for one is the behaviour this design
exists to make pointless.
