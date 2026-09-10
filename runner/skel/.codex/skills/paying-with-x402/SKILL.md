---
name: paying-with-x402
description: Pay for an HTTP API that answers 402 Payment Required. Use when a request returns 402, when the user asks to buy or fetch something paid, or when deciding whether this machine can afford a call. Covers the broker, the spending ceiling, and what a refusal means.
---

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
