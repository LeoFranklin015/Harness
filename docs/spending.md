# The money

**They'll ask:** *"What can the agent actually spend, and what stops it
running off with everything?"*

## Say this first

> The agent never holds the money. It stays in the owner's account until the
> instant of a purchase, and only moves if the rule allows that exact
> purchase. There's no agent wallet to drain.

That single sentence answers most of the money questions.

## Where the money is

Nowhere new. No account was funded for the agent, no balance was topped up,
nothing was moved into escrow.

The owner's USDC sits in the owner's own account the whole time. When the
agent buys something, the payment is pulled straight out at that moment —
and only if the rule permits it.

So the answer to *"how much could it steal?"* is **the daily limit**, not
"whatever's in the wallet". There is no pot sitting anywhere to empty.

## Two limits, not one

| | Caps | Set when |
|---|---|---|
| Total allowance | the most that can *ever* move | at setup |
| Daily ceiling | the most that can move per day | in the grant |

Both are set by the same Ledger tap.

## A normal purchase

```
Agent:      "send $1.50 to this address"
                    ↓
Blockchain: Is this agent still live?     ✓
            Is this type of call allowed? ✓
            Is there room under the limit? ✓
                    ↓
            $1.50 moves from the owner's account
```

Three things worth knowing:

**The agent signs, but our server pays the transaction fee.** Blockchains
charge a small fee per transaction. If every agent had to hold funds for
fees, you'd be topping up dozens of tiny balances forever. So the agent
signs the request and our server submits it and pays. The server has no
authority of its own — the worst it can do is waste its own fee money.

**The spend is counted before the money moves**, so nothing can slip through
by racing.

**It counts what actually moved**, not what the agent claimed, so a
misbehaving contract can't under-report.

## When it wants more than it's allowed

This is the demo moment. Sell it.

```
Agent:      "send $20"
Blockchain: refused — $20 asked, $8 left
Agent:      does not retry. does not ask for a bigger limit.
            prepares the payment and sends it to the owner's Ledger
Owner:      a person taps the device — or doesn't
```

**The decision we'd defend:** going over the limit does *not* raise the
limit. Raising it to let one invoice through means it stays raised, and now
your $10 agent is a $30 agent forever.

Instead the agent hands that one payment to a human. The limit is untouched.
The human is in the loop for exactly one transaction and then out again.

And the agent doesn't take "I signed it" on trust — our server checks the
payment actually landed on the blockchain before telling the agent anything.

## The bit that's genuinely novel

> The agent runs on a server with no USB port. The Ledger is on somebody's
> desk, possibly in another country. So **the transaction travels to the
> device** rather than the device coming to the transaction.

Anything that can say "this needs signing" can reach the device someone is
carrying — a server, a phone, a script. The Ledger stays the only thing that
decides.

## If they push

**"What does the agent's key actually let it do?"**
Ask for one kind of action — moving a specific token — inside a daily limit,
until cancelled. That's the entire power of it.

**"What if the agent is tricked into paying a scammer?"**
It can, up to the daily limit, exactly like an employee with a company card.
That's the trade: useful agents can spend. The point is the cap and the
instant off switch, not perfect judgement.

**"Can it do things other than pay?"**
The rule format is general — you can list any contract and function. Today
the part that carries out the action handles payments. So you can *authorise*
more than you can currently *execute*, and the setup screen marks which is
which rather than hiding it.

---

More likely questions on this and everything else: **[Judge questions](./questions.md)**
