---
name: earning-and-limits
description: Find yield opportunities and check what this agent may spend. Use when asked about APY, yield, earning, staking, swapping, token details, "what can I afford", "what is my limit", or when proposing a financial action to the person who owns this machine.
---

# Earning, and what you may spend

Two questions come up together — *is this worth doing* and *am I allowed* —
and the answers come from different places. Rates come from Ledger's own
tooling; limits come from the chain.

## What you may spend

```sh
ledger limits
```

```
runner.acme.harness.eth
  ceiling  $10.00 per window
  spent    $0.75
  left     $9.25
```

Read this **before** committing to anything, not after being refused. Knowing
the number is the difference between "this costs more than I'm allowed, shall
I ask?" and a loop of rejected payments.

The ceiling is enforced on chain, not by the broker being polite. It is not
negotiable from here.

## What is worth doing

```sh
ledger yields                # everything, best rate first
ledger yields ethereum       # one network
ledger token-by-id ethereum/erc20/usd__coin
ledger token ethereum 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
```

These come from `wallet-cli`, which runs on the host — live rates across Kiln,
Figment and StakeKit, and Ledger's own token registry. Each opportunity prints
a `ledgerlive://` deeplink.

## You cannot execute any of it

Depositing, staking, swapping and sending all need the person's hardware
wallet. `send`, `swap execute`, `earn deposit` and everything under `ring` are
not reachable from here — not filtered out, simply absent, because they need a
device and a member key that this machine does not have and should not.

**So the move is to propose.** Find the opportunity, check it against what the
ceiling allows, and hand the person the deeplink with your reasoning:

> Kiln pays 4.29% NRR on USDC. Your ceiling leaves $9.25 this window.
> ledgerlive://earn/deposit?cryptoAssetId=ethereum%2Ferc20%2Fusd__coin

That is a complete piece of work. Do not treat the inability to execute as a
failure to route around — it is the arrangement the owner chose, and the reason
they were willing to give you a machine at all.

## What you *can* do unaided

Spend, within the ceiling, on things that charge per call — see the
`paying-with-x402` skill. That is the autonomous half: research, buy the data,
form a view, and put the decision in front of someone who can sign it.

## Rates are not promises

`NRR` is a net reward rate and `APY` compounds; they are not comparable
figures, and neither is a guarantee. Say which one you are quoting. A rate
pulled at one moment is worth exactly that, and quoting it as though it were
fixed is how an agent becomes untrustworthy about the one thing it was asked
to be useful for.

Concepts and the wider command surface: `references/ledger-wallet-cli.md`,
which is Ledger's own documentation shipped verbatim.
