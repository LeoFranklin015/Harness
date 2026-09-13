# How Harness works

The mechanics, for someone who knows the product but not the plumbing.

- **[The parts](#the-parts)** — what each piece is and what it does
- **[How they fit](#how-they-fit)** — the one diagram worth memorising
- **[The four flows](#the-four-flows)** — setup, spending, escalation, revoke
- **[Glossary](#glossary)** — every term used anywhere in these docs

Then the deep pages, one per area:
[Ledger & Key Ring](./key-ring.md) ·
[SSH & the mesh](./ssh-and-mesh.md) ·
[Spending](./spending.md) ·
[Revocation](./revocation.md) ·
**[Judge questions](./questions.md)**

---

## The parts

Six pieces. Each does one job, and none of them trusts the others.

### 1. The Ledger — grants authority

A hardware wallet. Holds a secret key that physically cannot leave the
device, and only signs when a human presses a button.

It does exactly two things here: **creates the Key Ring** (once, at setup)
and **signs the rules** that say what an agent may do. Nothing else in the
system can grant authority.

### 2. ENSv2 — names and permissions

Ethereum's naming system, version 2. We don't just use it for names; we
build *on top of its contracts*.

- Every machine gets a name (`acme.harness.eth`) **and its own registry
  contract**, cloned at setup. A name here is a namespace, not a label.
- Every agent gets a name beneath that (`runner.acme.harness.eth`), minted
  by the machine's own registry.
- Names carry records: the agent's key, where the machine is, and the
  fingerprint of the SSH key allowed in.
- Our **resolver** — the contract that answers "what does this name point
  to?" — keeps no records. It works the answer out from the rules each time
  it's asked.

The last point is the one that makes everything else work. See
[Revocation](./revocation.md).

### 3. The registries — enforce the rules

Our own contracts, extending ENSv2's. They hold each agent's **grant**: what
it may call, how much it may spend, for how long.

Granting mints the name; revoking burns it. They're the same action, so a
name can never say something different from the permission behind it.

### 4. The Key Ring — lets the server decrypt

Ledger's system for sharing encryption rights. At setup, the device admits
our server as a member. After that the server can unlock that customer's
secrets — API keys, tokens — **without a human present**, which is the only
reason an agent can run unattended.

Everything rests on disk encrypted. See [Ledger & Key Ring](./key-ring.md).

### 5. Tailscale — the private network

Agent machines have **no public address and no open ports**. They live on a
private mesh network instead. To reach one you have to be invited onto that
mesh, and the invite is single-use and expires.

Our own nameserver runs on that mesh too, so `.eth` names can be looked up
by ordinary tools. See [SSH & the mesh](./ssh-and-mesh.md).

### 6. The broker — relays and pays

Our server. When an agent wants to spend, the agent signs the request and
**the broker submits it to the blockchain and pays the transaction fee**.

Two reasons: agents shouldn't hold funds just to pay fees, and the broker
having no authority of its own means compromising it gains an attacker
nothing but wasted fees.

---

## How they fit

```
   🔒 Ledger ──USB──→ Browser ──→ ⛓ ENSv2 + our registries
   grants                            the rules live here
   authority                              │
                                          │ everything asks it,
                                          │ every single time
                                          │
   Broker ──relays + pays fees────────────┤
     │                                    │
     │ unlocks secrets                    │
     ▼                                    │
   Agent container ←─── Tailscale mesh ───┘
   has a key with                    how you reach it
   no authority of its own
```

**Read it as:** the Ledger grants, the chain enforces, the broker relays,
the mesh carries, the agent asks. No arrow in that diagram carries a private
key that's worth stealing.

---

## The four flows

### Setting up a machine

```
1. Browser asks the Ledger to create/join a Key Ring
   → the server becomes a member, can decrypt from now on

2. The server builds a container, generates the machine's
   SSH host key and the agent's key

3. The Ledger signs (one tap, four actions batched):
     · point the machine at its payment contract
     · publish where the machine is + who may SSH in
     · allow the payment contract to draw on the owner's USDC
     · set the ceiling — this mints the agent's name

4. Agent's secrets are encrypted under the Key Ring and written
```

Two device interactions: once for the ring, once for the chain. Between
them the flow **stops and waits for a click**, because browsers only allow
USB access from a real button press.

### A normal payment

```
agent signs "send $1.50 to X"
   → broker submits it, pays the fee
   → registry checks: alive? allowed? under the ceiling?
   → payment contract pulls $1.50 from the owner's account
```

The money was in the owner's account until that instant. There is no agent
balance.

### Going over the ceiling

```
agent asks for $20 → refused, $8 left
   → agent does NOT retry and does NOT ask for a bigger ceiling
   → it prepares the payment and sends it to whoever holds the Ledger
   → a person taps, or doesn't
   → broker verifies the payment actually landed before believing it
```

The ceiling is never raised. The human handles one transaction and steps
back out.

### Revoking

```
one tap → the registry marks the agent revoked
   → spending refused        (payment contract asks)
   → name stops resolving    (resolver asks)
   → SSH refuses             (the door asks)
   → open terminal closes    (re-checks every 15s)
   → secrets not handed back (broker asks)
```

Nothing was switched off. One fact changed and five things that were
already watching it reacted.

---

## Glossary

**Ledger** — hardware wallet. Holds a secret that never leaves it; signs
only when a human presses a button.

**Sign / signature** — cryptographic approval. Proves you agreed; can't be
forged.

**On chain / blockchain** — a public shared database nobody can secretly
edit. Holds the rules.

**Sepolia** — Ethereum's test network. Real code, play money.

**USDC** — a digital dollar.

**Address** — an account number, like `0xE082…06c0`.

**ENS / ENSv2** — Ethereum's naming system. Turns an address into
`acme.harness.eth`. v2 is the new version, which we build on.

**Registry** — a contract that owns a name and can issue names beneath it.
Each machine has its own.

**Resolver** — the contract that answers "what does this name point to?"
Ours computes answers instead of storing them.

**Record** — a piece of data attached to a name: an address, a fingerprint,
a description.

**Grant** — one agent's rule set: what it may call, how much, how long. Made
by one Ledger tap.

**Ceiling** — the spending limit in a grant.

**Revoke** — cancelling a grant.

**Agent** — the AI worker. Has a name, a machine, a grant.

**Machine / tenant** — the isolated computer an agent runs on. Has its own
name and its own registry contract.

**Container** — the technology that isolates it: a sealed box on a shared
server.

**Broker** — our server. Relays agent requests to the chain and pays fees.

**Gas** — the fee for writing to a blockchain.

**Key Ring** — Ledger's system for letting a server decrypt without a human
present.

**Mesh / Tailscale** — the private network the machines live on.

**Nameserver** — internet plumbing that turns names into addresses. Ours
answers for `.eth`.

**SSH** — the standard way to get a command line on a remote computer.

**Fingerprint** — a short one-way summary of a key. Proves a match without
revealing the key.

**x402** — a standard where a server replies "402 Payment Required" and the
agent pays automatically.

### Names you may need to say out loud

These come up when talking to the Ledger or ENS teams. You will be quoting
them back to the people who wrote them, so it helps to know roughly what
each one is.

**WebHID** — the browser feature that lets a web page talk to a USB device.
How the dashboard reaches the Ledger.

**ERC-7730** — the standard for telling a Ledger how to display a
transaction in plain words. The thing we haven't done yet.

**ENSIP** — an ENS Improvement Proposal: a numbered ENS standard. We
implement 5, 9, 10, 24, 25 and 26.

**PermissionedRegistry** — ENSv2's own registry contract. Ours extends it,
which is what makes our names behave like real ENSv2 names.

**LabelStore** — an ENS contract that remembers the text of a name, since
names are stored hashed. We get it for free by extending their registry.

**EnhancedAccessControl** — ENSv2's permission system. Each name carries a
set of roles; we choose which ones an agent gets.

**Bitmap** — how those roles are stored: a list of yes/no switches packed
into one number. "Choosing the bitmap" means picking which permissions the
agent has.
