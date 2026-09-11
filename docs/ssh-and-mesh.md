# Getting into the machine

**They'll ask:** *"How do you get a terminal on the agent's machine, and
what stops anyone else?"*

## Say this first

> You type `ssh runner@acme.harness.eth` and you're in. That name is on the
> blockchain, and so is the fingerprint of the key allowed through the door.
> Cancel the agent and both stop working.

## What you're actually demoing

```
ssh runner@acme.harness.eth
```

No wallet. No plugin. No copying an IP address. It works from a laptop, a
phone, or a terminal app on a watch — anything that can look up a name.

That's the part to sell. An ENS name today is normally just an address you
paste into a wallet. Here it's **a computer you can walk into**, and the
same name says who's allowed in.

## Why it's hard, and why that's the interesting bit

`.eth` names aren't real internet names. Normally you need a crypto wallet
or a special browser plugin to look one up — `ssh` has no idea what they
are.

So we run a **nameserver**: the piece of internet plumbing that turns names
into addresses. Ours answers for `.eth` by reading the blockchain. To `ssh`
it looks like any other name lookup, so it just works, with nothing
installed.

**If someone asks how:** a lookup leaves the laptop as an ordinary name
request, our nameserver answers it by asking the blockchain, and the answer
comes back looking completely normal. That's the level of detail to give —
the mechanism is the one part of this we'd rather not spell out publicly.

## The two checks at the door

This is the good bit. Getting in requires **two separate things to be true**
and each is checked against the blockchain independently.

**1. Does the name still point anywhere?**
A cancelled agent resolves to nothing. Not "access denied" — the machine
simply doesn't exist as far as the network is concerned.

**2. Is your key allowed?**
The machine's door doesn't keep a list of who may enter. When you connect,
it takes the key you offered and asks the blockchain whether that key is the
admitted one.

So a connection only happens while **both ends still have authority**.

## The part that sounds backwards but isn't

Normally a server keeps a private file listing who may log in. We publish a
**fingerprint** of the allowed key on a public blockchain instead.

People flinch at "public". The answer:

> A fingerprint is a one-way summary of a *public* key. You can't work
> backwards from it to anything secret — it's like publishing a photo of a
> lock, not a copy of the key.
>
> And here's the win: the normal private file can be edited by anyone who
> breaks into the server. That's exactly how attackers keep access — they
> quietly add their own key and nobody notices. Ours can't be edited that
> way, because the door doesn't read a local file. Changing who may enter
> takes the owner's hardware wallet, and it's visible to everyone.

**Private but forgeable, versus public but tamper-proof.** For a machine
running unattended, the second is better.

## The other way in

There's also a terminal in the dashboard, which needs no setup at all.

It matters for one reason beyond convenience: **it re-checks the blockchain
every 15 seconds**. So when you tap Revoke during the demo, the terminal
closes by itself while everyone is watching. Don't touch it — let it close.

## If they push

**"Could I find the machine by scanning the internet?"**
No. It has no public address and no open ports. You have to be on the
private network first, and that requires an invitation.

**"What if I copy the invite?"**
It's single-use and expires. And it only gets you to the door, which still
asks the blockchain about your key.

**"What if the agent's server is hacked — can they add themselves?"**
No. The door doesn't read anything on that server.

---

More likely questions on this and everything else: **[Judge questions](./questions.md)**
