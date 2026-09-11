# Questions judges will ask

Grouped by who's asking. Each answer is short enough to say out loud.

If you don't know something: **"I don't know, I can find out."** It costs
nothing. Guessing at a technical detail in front of the people who wrote the
standard costs a lot.

---

## The obvious first question

**"So the agent has a private key?"**

Yes, and it's nearly worthless. It can only ask our payment contract to do
things the grant already permits — one kind of action, one token, under a
daily ceiling, until cancelled. It can't raise its own limit, can't reach
another customer's machine, and can't move money any other way.

**"Then what stops it draining the wallet?"**

There's no wallet to drain. The money stays in the owner's account and is
pulled at the moment of a purchase, only if the rule allows that purchase.
The exposure is the daily ceiling, not the balance.

**"What if the server is hacked?"**

They inherit that same limited key. One tap cancels it. Compare to a stolen
private key, where everything is gone permanently.

---

## From the Ledger team

**"Why does the browser touch the device at all?"**

Onboarding shouldn't need a command line. We use Ledger's Device Management
Kit over WebHID, so the browser only carries messages — our server runs the
actual protocol and the key never leaves the device.

**"Where does the signature happen for an agent's payment?"**

That's the part we think is interesting. The agent runs on a server with no
USB port; the device is on someone's desk. So the transaction travels to the
device rather than the other way round — prepared where the rules live,
signed wherever the Ledger is.

**"What are you using the Key Ring for?"**

Encryption rights, not signing. The device admits our server as a ring
member once, and after that the server can decrypt that customer's secrets
with no human present. That's what lets an agent run at 3am.

**"Is it clear-signed?"**

No — and say this before they ask. The device shows raw transaction data
rather than "grant this agent $10/day". That's ERC-7730 metadata we haven't
written yet, so today the user is trusting our dashboard composed the right
transaction. It's a metadata file, not a redesign, and it's top of the list.

**If you want to impress them:** we hit a bug in their SDK where deleting a
ring and recreating it reuses the closed stream, and the device's error code
isn't in their error map so it surfaces as "unknown error". We worked
around it the same way their unreleased fix does.

---

## From the ENS team

**"Are you actually using ENSv2 or just names?"**

Building on the contracts. Our registries extend their
`PermissionedRegistry`, so names mint, burn and version the way ENSv2 names
are meant to, and labels land in their shared `LabelStore`.

**"What does your resolver do that a public one doesn't?"**

It stores no records. One resolver answers for every name beneath us — no
setup per agent — and every answer is computed at read time from on-chain
state. That's why a
cancelled agent stops resolving for every ENS client instantly — there's no
stored record to go and delete.

**"Which ENSIPs?"**

5, 9, 10, 24, 25 and 26 — all live on Sepolia. **ENSIP-26** is the
interesting one: it standardises how an agent describes itself and where to
reach it. It names `mcp`, `a2a` and `web` as protocols and leaves room for
more; for this kind of agent a shell *is* the interface, so we publish
`agent-endpoint[ssh]`.

**"Why does each machine get its own contract?"**

So the namespace is genuinely the owner's. We can't issue a name under
somebody else's machine — the contract rejects anyone but that machine's own
root device. And a subname is rejected unless its permissions are strictly
narrower than its parent's.

**"How do you stop an agent from misusing its name?"**

ENSv2's `EnhancedAccessControl`. We choose the role bitmap: an agent may set
its own resolver and issue subnames; it may not transfer, renew, mint peers
or unregister. Withholding the role *is* the enforcement — there's no custom
check of ours to get wrong.

---

## On security

**"You publish the SSH fingerprint publicly. Isn't that a risk?"**

A fingerprint is a one-way summary of a *public* key — nothing secret is
exposed. The one real cost is that someone who already has a candidate key
can confirm it has access, which narrows who to target.

In exchange: the usual private file on the server can be edited by anyone
who breaks in, which is exactly how attackers keep access. Ours can't — the
door doesn't read a local file. Changing who may enter needs the owner's
hardware wallet and is publicly visible. **Private but forgeable, versus
public but tamper-proof.**

**"Can one customer's agent reach another's?"**

No. Separate containers on separate private networks, configured so even the
host can't reach in. And authority is per-machine on chain.

**"What if your broker is compromised?"**

It has no authority. It relays signed requests and pays fees. It can't grant
anything, can't raise a ceiling, can't sign for an agent. The worst case is
wasted fee money and a denial of service.

**"What if the blockchain is unreachable?"**

Everything fails closed. Not being able to ask is not permission.

---

## On the architecture

**"Why not just use a multisig / session keys / a smart wallet?"**

Those control *who signs*. This controls *what may be done* — a list of
allowed actions plus a rate limit, checked by a contract on every call. And
revoking is one write that everything else is already watching, rather than
a rotation you have to propagate.

**"Why containers rather than separate servers?"**

Cost and speed for a hackathon. The isolation properties we rely on
(separate networks, no shared filesystem, no host access) are enforced, and
the design doesn't depend on it — each machine could be a real VM.

**"What can the agent actually be allowed to do?"**

Anything you name. A rule is a contract plus a function, and the payment
contract runs whatever passes that check without knowing what it is — a
Uniswap swap is the two calls anyone would write, approve then swap, and
nothing of ours decodes either. Adding a protocol is a row in a list, not a
redeploy.

What stops a badly chosen rule is the ceiling. We measure what actually left
your account, not what the calldata claimed, and reject the whole batch if it
does not fit.

**"Does this scale?"**

The chain work is per-agent and constant. The resolver computes rather than
stores, so more names cost nothing. The real limits are container density
per host and RPC throughput.

**"What's actually finished versus demo-only?"**

Finished: naming, grants, spending with enforcement, escalation to the
device, revocation across all five surfaces, SSH via the mesh, the in-page
terminal. Not finished: clear-signing.

---

## If they ask for a demo of one thing

Ask for **revoke**. Have a terminal open on the agent, on screen, and tap
it. The shell closes by itself within fifteen seconds.

Let it happen. Don't narrate over it.
