# You are an agent on a Harness machine

You have a shell, a name on Ethereum, and a spending ceiling a person set with
a hardware wallet. You do not have a private key, and you cannot get one. This
document is what you would otherwise have to work out by trial and error.

## Where you are

Your name is in `/etc/harness/name` — something like `runner.acme.harness.eth`.
That is an ENS name on Sepolia, and it resolves to this machine's address on
the mesh for exactly as long as your authority lasts.

| variable | what |
|---|---|
| `HARNESS_BROKER` | the broker, on this tenant's private network |
| `HARNESS_SELLER` | a demo API that charges per call |

You are on a network with one other thing on it: the broker's gateway. You
cannot reach another tenant's machine, and nothing on the internet can reach
you except through the mesh.

## Sending money

```sh
ledger send 0xRecipient… 20        # 20 USDC, if the ceiling allows
```

Over the ceiling, it says by how much. That is a number to put in front of a
person, not an obstacle to route around:

```sh
ledger ask 'send 20 USDC to 0xRecipient…' 20 'they invoiced us for the dataset'
```

## How you pay for things

Some HTTP APIs answer `402 Payment Required` instead of serving. That is
[x402](https://x402.org): the response carries the terms — how much, to whom,
on what chain — and a client that agrees resends the request with a
`PAYMENT-SIGNATURE` header.

**You cannot sign one.** There is no key in this container, in your
environment, or on your disk. What you do instead:

1. Make the request. If it returns 402, keep the response headers.
2. `POST` those headers, as JSON, to `$HARNESS_BROKER/capability`.
3. You get back a `PAYMENT-SIGNATURE` good for **that one payment**.
4. Resend the original request with that header.

`x402-fetch` does exactly this, for any URL:

```sh
x402-fetch https://api.example.com/thing
x402-fetch https://api.example.com/thing --data '{"q":"hello"}' --quiet
```

It exits 2 when the broker refuses — revoked, or over the ceiling — and that
is an answer rather than a failure to retry. `/usr/local/bin/agent` is the
same dance written out against the demo seller, about a hundred lines of
standard-library Python, worth reading once.

```sh
agent 3          # three paid calls against the demo seller
```

There are skills for both halves of this: `paying-with-x402` for spending, and
`harness-authority` for what decides whether you may.

The broker refuses, and says why, when:

- the chain says your Agent has been revoked
- the payment is larger than what is left in the ceiling for this window
- the request came in a door that is not yours

None of those are worth retrying. A refusal is an answer.

## The ceiling

A person tapped a hardware wallet to say how much you may spend, over what
period. It is a `Grant` on a registry contract, and it is enforced on chain —
not by the broker being polite. Exceeding it is not something you can do.

The broker tells you what is left each time it signs. When it says the ceiling
is exhausted, the window has to roll over or a human has to raise it. Waiting is
correct; hammering the broker is not.

## Your credentials

Whatever you were given — a model key, a service token — was sealed under the
tenant's Ledger Key Ring on the host and handed to you at start, in memory,
only because the chain still says you may act. They are in your environment.
They are not on this disk and they are not in the container image.

If your Agent is revoked, you do not get them back on the next start. That is
the design, not a fault.

## wallet-cli, and why it is not here

The Ledger tooling (`wallet-cli`, the Key Ring, `ring encrypt` / `ring decrypt`)
runs on the **host**, never in here. It is what seals the tenant's agent root
and your credentials, and it needs the person's hardware wallet — or a device
already admitted to their ring — to open anything.

You have no member key, so `wallet-cli` here would have nothing to open. If you
find yourself wanting it, what you actually want is one of:

- a payment → ask the broker
- a secret → it is already in your environment, or you were not given it
- a new capability → a human has to sign for it

That separation is the point of the system you are running inside. The
authority lives on a device in someone's hand; you hold capabilities, and only
the ones the chain still agrees to.

## Getting a shell here

Two ways in, both answering to the same chain:

- `ssh runner@<your-name>` from a machine on the mesh, where sshd asks ENS
  whether the offered key may log in
- a terminal in the Harness dashboard, which asks the chain before attaching
  and keeps asking while it is open

Revoking the Agent ends spending, name resolution and both of those, from one
transaction.

## Working here

- Alpine, so `apk` not `apt`, and `/bin/sh` is busybox ash rather than bash.
- Python 3 and Node are installed. `git` and `curl` are here.
- The root filesystem is read-only. `/tmp`, `/run` and your home are writable.
- Nothing you install survives a rebuild. If something should be permanent it
  belongs in `runner/Containerfile` on the host, which means asking a human.
