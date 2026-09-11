# The off switch

**They'll ask:** *"How do you turn it off?"*

This is the strongest part of the product. Take your time on it.

## Say this first

> One tap. Spending stops, the name stops working, SSH stops letting you in,
> an open terminal closes while you're looking at it, and the agent gets no
> passwords if it restarts.
>
> And we didn't go and switch five things off. We changed one fact, and five
> things were already watching it.

## Why that's the interesting part

Most systems revoke by going around undoing things: delete the key here,
remove the firewall rule there, drop the DNS record, clear the cache. Every
one of those is a step that can fail, and a step someone can forget. Half of
a revocation is worse than none, because you think you're safe.

**Harness has nothing to undo.** Every part of the system asks the
blockchain, every time it's used. So one change makes everything stop, and
nothing can be missed — there was no list in the first place.

```
        one tap: revoke
               │
               ▼
     the blockchain says: no longer authorised
               │
    ┌──────┬───┴───┬───────┬────────┐
    ▼      ▼       ▼       ▼        ▼
 spending  name   SSH   open      secrets
  stops    dies   shut  terminal   withheld
                        closes
```

## Proof, not a promise

We tested this against a live agent with a second live agent beside it as a
control. Every row is a real measurement:

| | The revoked agent | The one still running |
|---|---|---|
| Tried to pay | refused, nothing moved | worked |
| Tried to escalate to the owner | refused | reached the device |
| Looked up its name | nothing | returned its address |
| Checked the door key | no key matches | matched |
| Asked for its secrets | refused | served |

If a judge doubts any single claim, that's the answer.

## Two things that surprised us

**The machine keeps running, and that's correct.** Revoking doesn't kill the
computer — it removes its authority. It sits there able to spend nothing,
reachable by nobody, and gets no secrets if it restarts. Killing it would
look tidier and prove less.

**Cancelling a machine cancels every agent on it**, automatically. Not
because we go through them, but because each one checks upward and finds the
gap. Nothing to propagate means nothing can half-propagate.

## The demo shot

Have a terminal open on the agent, visible on screen, when you tap Revoke.

The shell closes under your hands. It checks the blockchain every 15
seconds, so it'll close on its own — **don't touch it, just let it happen
and stop talking for a second.**

That one moment makes the whole argument better than any slide: the
authority was never inside the machine, so taking it away needed nothing
from the machine.

## If they push

**"What if the blockchain is unreachable when something checks?"**
Everything fails closed. Not being able to ask is not permission.

**"Can the agent cancel itself?"**
Yes — the owner or the agent can. An agent that thinks it's been compromised
can stand itself down. It can't do the reverse.

**"How fast?"**
As soon as the transaction confirms, plus up to 15 seconds for an already-open
terminal. Everything else is on the next request, which is immediate.

## One trap to avoid on stage

If you check the name from the wrong place, you may get an answer for an
agent you just cancelled — that's an unrelated piece of local plumbing
answering with a name that happens to match, and it never looks at the
blockchain.

**Always demonstrate the name lookup from inside the private network**, the
way the pre-written demo does. Don't improvise this one.

---

More likely questions on this and everything else: **[Judge questions](./questions.md)**
