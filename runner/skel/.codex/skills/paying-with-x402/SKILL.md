---
name: paying-with-x402
description: Spend money — send USDC to an address, or pay an API that answers 402 Payment Required. Use whenever asked to send, pay, transfer or buy anything, when a request returns 402, or when working out what this machine can afford. Covers the ceiling, what a refusal means, and how to ask the owner for more.
---

# Spending

## Sending money to somebody

```sh
ledger send 0xRecipient… 20        # 20 USDC
```

The Grant permits exactly one call — `transfer` on USDC — and one ceiling, so
this is the only way money moves and it cannot exceed what was allowed.

**If it refuses, read the numbers.** Over the ceiling looks like:

```
over the ceiling: $20.00 asked, $9.00 left. Ask the owner for $11.00 more.
```

That is not a failure to work around. Do not split it into smaller transfers
to sneak under — the window is what is limited, not the transaction, and
trying looks exactly like what it is.

`ledger send` handles the rest by itself: it puts the payment in front of
whoever holds the hardware wallet and waits. They see it, their device shows
it, and they either press the button or they do not. If they do, it tells you
so — and your own ceiling is unchanged, because they paid it, not you.

There is nothing further for you to run. If you want to record a request
without a payment attached — more room in general, rather than one invoice —
that is:

```sh
ledger ask 'send 20 USDC to 0xRecipient…' 20 'they invoiced us for the dataset'
```

Single quotes, and write the amount as `20 USDC` rather than `$20`. In double
quotes a shell reads `$20` as the twentieth argument and puts nothing there,
so the person reading the request sees "send 0 to 0x…" and has to guess. The
number in the second field is what actually gets approved, but the sentence is
what they read.

Then stop and say you have asked. Somebody with the hardware wallet sees it,
and if they agree the ceiling moves and you can continue.

# Paying for something

Some APIs answer `402 Payment Required` instead of serving. The response
carries the terms — how much, to whom, on what chain — and a client that agrees
resends the request with a `PAYMENT-SIGNATURE` header.

## Use the tool

```sh
x402-fetch https://api.example.com/thing
x402-fetch https://api.example.com/thing --data '{"q":"hello"}'
x402-fetch https://api.example.com/thing --quiet     # body only, for piping
```

It fetches, and if the answer is 402 it pays and fetches again. On stderr it
says what it spent and what is left:

```
x402-fetch: paid $0.25 as runner.acme.harness.eth, $9.75 left in the window
```

Exit codes are worth branching on:

| code | meaning |
|---|---|
| 0 | served |
| 1 | the request or the URL was wrong |
| 2 | **the broker refused** — revoked, or over the ceiling |
| 3 | the broker or the seller could not be reached |

## You cannot sign

There is no private key in this container, in the environment, or on the disk.
When you need to pay:

1. make the request; if it returns 402, keep the response headers
2. `POST` those headers as JSON to `$HARNESS_BROKER/capability`
3. you get back a `PAYMENT-SIGNATURE` good for **that one payment**
4. resend the original request with that header

`x402-fetch` does exactly this. `/usr/local/bin/agent` is a hundred-line
worked example against the demo seller (`$HARNESS_SELLER`), worth reading once.

The signature cannot be reused, cannot be altered, and does not reveal the key
that made it. That is the point of the arrangement, not an inconvenience in it.

## A refusal is an answer

Exit code 2 means the chain said no. Two reasons:

- **revoked** — somebody signed a transaction ending this Agent's authority.
  Nothing you do here will change it. Stop, and say so plainly.
- **over the ceiling** — a person set a spending limit with a hardware wallet
  and this payment exceeds what is left in the current window. Enforced on
  chain, not by the broker being polite.

Neither is worth retrying, and retrying looks like a loop to whoever is
watching. If the work genuinely needs more, say what it would cost and let a
human decide; raising a ceiling requires their device.

## Before spending

Prefer knowing the price to discovering it. A 402 response states the amount
before you commit — reading it and saying "this costs $X, shall I?" is usually
better than spending and reporting afterwards, unless the user has already said
to go ahead.

Money spent here is real. The ceiling exists because somebody expected you to
stay inside it, not because they expected to catch you at the edge.
