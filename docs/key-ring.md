# The Ledger and the Key Ring

**They'll ask:** *"You're plugging a hardware wallet into a browser — is
that safe?"*

## Say this first

> The browser never touches anything worth stealing. It passes messages
> between the device and our server. The secret stays inside the Ledger, the
> way it's designed to.

That's the whole answer. Everything below is for if they keep going.

## Why a hardware wallet at all

Someone has to say "this agent may spend $10 a day". That decision is the
one thing in the entire system that must never be automated — the moment
software can grant authority to software, the whole idea collapses.

A Ledger is a small device that holds a secret key and physically will not
use it unless a human presses a button. So the one human decision is made on
the one device that can't be tricked into making it alone.

**Everything after that is automatic. Only the granting needs a person.**

## The problem we had to solve

An agent runs at 3am with nobody watching. It needs its passwords — an API
key, a token. Those have to be stored somewhere on the server.

If you store them in plain text, anyone who steals the disk has them. If you
encrypt them with a password, somebody has to type the password every time
the server restarts — which defeats the point of an unattended agent.

**Ledger's Key Ring solves exactly this.** It lets the device grant our
server permission to decrypt things, once. After that the server can unlock
the agent's secrets on its own, and a stolen disk is useless because the
files are encrypted.

## What actually happens, in five steps

```
1. Our server creates its own secret, and keeps it.
      Only the matching public half ever moves.

2. The browser connects to the Ledger over USB.

3. Our server runs the conversation; the browser just
      carries the messages back and forth.
      server  →  browser  →  Ledger  →  browser  →  server

4. The user presses the button. The Ledger writes a record
      saying "this server is allowed in".

5. Done. From now on the server unlocks the agent's secrets
      by itself, with no device and no human.
```

**Step 3 is the one worth understanding.** The Ledger is plugged into the
user's laptop. Our server is in a data centre. They can't talk directly, so
the browser sits in the middle and relays messages — like a translator who
passes sentences along without understanding them. It never learns anything.

## If they push

**"Could the browser steal the key?"**
No. The Ledger never sends its secret to anything, ever. What travels are
requests and answers, not keys.

**"Could a malicious website do this?"**
No. Connecting to a USB device needs the user to pick it from a dialog the
browser itself draws, which a page cannot fake or click for you. And
permission is tied to one website and one device.

**"What if the server is compromised later?"**
It can decrypt that customer's secrets — that's the trade we made for an
agent that runs unattended. What it cannot do is spend money outside the
rule, or grant itself more, because that lives on the blockchain and needs
the device.

**"Why not just use Ledger Live?"**
We use a separate slot in the device's system, so this doesn't collide with
whatever the user already has set up.

## One detail that impresses Ledger engineers

If you're talking to someone from Ledger specifically, this lands:

> We found a bug in their SDK. If you delete a ring and try to make a new
> one, their library reuses the closed one and the device rejects it with an
> error their own error-mapper doesn't recognise, so it surfaces as
> "unknown error". We worked around it. They've fixed the same thing in a
> nightly build that isn't released yet.

You don't need to understand it. Saying it proves we actually built on their
stack rather than reading the brochure.

---

More likely questions on this and everything else: **[Judge questions](./questions.md)**
