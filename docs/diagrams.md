# Diagram briefs

Seven drawings, one per process. Each is self-contained — hand one brief at a
time to whatever draws them, rather than asking for "the architecture",
which always produces a box-and-line soup nobody reads.

**House style, apply to all seven:**

- Dark background. One accent colour for the Ledger, one for the chain,
  grey for everything else.
- Boxes are *things*; arrows are *actions* and carry a verb.
- Number the steps where order matters. Don't number where it doesn't.
- Nothing on the page that isn't named in the brief.
- If a box has no arrow in or out, delete it.

---

## 1 — The whole system

*One page. The map somebody looks at first.*

**Boxes**
- `Ledger` — on the user's desk (accent)
- `Browser` — the dashboard
- `Broker` — our server
- `Agent container` — one per machine
- `ENSv2 + our registries` — on chain (accent)
- `Tailscale mesh` — a band, not a box, that the container and the visitor
  both sit inside

**Arrows**
- Ledger ↔ Browser — "APDUs over USB"
- Browser → chain — "signed transactions"
- Browser → Broker — "sealed secrets"
- Broker → Agent — "derived key, no authority"
- Agent → Broker — "signed intent"
- Broker → chain — "relays, pays gas"
- chain ⤏ Agent — dashed, "permits or refuses"

**The caption, which is the whole point:**
> The Ledger grants, the chain enforces, the broker relays, the agent asks.
> No arrow carries a private key worth stealing.

---

## 2 — Setting up a machine

*A sequence. Time runs downward.*

**Lanes:** `Ledger` · `Browser` · `Broker` · `Chain`

**Steps**
1. Browser → Broker: "start enrolment"
2. Broker → Ledger, **via the browser**: Key Ring protocol
   — draw the browser as a pass-through here, not a participant
3. Ledger: **user presses the button** — mark this clearly
4. Ledger → Broker: "you are a ring member"
5. **A gap. The flow stops and waits for a click.**
   Annotate: *browsers only allow USB from a real button press*
6. Broker: builds the container, generates the host key and agent key
7. Browser → Ledger: four calls, batched by EIP-7702
   - point the machine at its executor
   - publish the host record
   - approve the executor on USDC
   - set the ceiling → **this mints the agent's name**
8. Ledger: **one tap**
9. Chain: the machine and the agent now exist
10. Broker: seals the agent's secrets under the ring

**Emphasise:** two device moments, and the deliberate stop between them.

---

## 3 — A payment, and going over the ceiling

*Two flows side by side on one page. The contrast is the content.*

**Left — inside the ceiling**
```
Agent  →  signs an intent
Broker →  submits it, pays gas
Chain  →  alive? permitted? under the ceiling?   ✓
Executor → pulls USDC from the OWNER's account
```
Annotate the executor arrow: **the money was never in the agent's hands.**

**Right — over the ceiling**
```
Agent  →  "send $20"
Broker →  refused: $20 asked, $8 left
Agent  →  does NOT retry, does NOT request a bigger ceiling
Agent  →  prepares the payment, sends it to the device
Ledger →  a person taps, or does not
Broker →  verifies on chain that it actually landed
```
Annotate the bottom: **the ceiling is unchanged.**

Put the two under one heading: *the difference between an agent that
spends and an agent that asks.*

---

## 4 — The name tree

*A tree. Small. No arrows except parent-to-child.*

```
harness.eth                    PlatformRegistry
└── acme.harness.eth           the machine — its OWN registry contract
    ├── runner.acme.harness.eth
    └── indexer.acme.harness.eth
```

**Three annotations, and nothing else:**
- beside the machine: *a namespace, not a leaf — its own contract, its own
  root device*
- beside a child: *minted by the machine's registry, not by the platform*
- across the parent-child edge: *a child grant must be strictly narrower*

---

## 5 — Revocation

*The most important drawing. Give it room.*

**Top:** one box — `revoke()` — with a Ledger glyph. Accent colour.

**Middle:** one box — `the chain: no longer authorised`.

**Bottom:** five boxes, fanning out from that one, each with the thing that
asks it:

| box | who asks |
|---|---|
| spending stops | the executor |
| the name stops resolving | the resolver |
| SSH refuses | `AuthorizedKeysCommand` |
| the open terminal closes | re-checks every 15s |
| secrets are withheld | the broker |

**Arrow direction matters.** Draw the five arrows pointing *up*, from each
surface to the chain, labelled "asks". Not down from the chain. The whole
idea is that nothing was pushed — they were already looking.

**Caption:**
> Nothing was switched off. One fact changed, and five things that were
> already watching it reacted.

---

## 6 — How SSH gets in

*A sequence, but short.*

**Actors:** `Your laptop` · `Nameserver` · `Chain` · `Agent's sshd`

1. laptop → nameserver: `runner@acme.harness.eth` — an ordinary DNS lookup
2. nameserver → chain: asks the resolver
3. chain → nameserver: an address, **or nothing if revoked**
4. laptop → sshd: connects over the mesh, offers a key
5. sshd → chain: "is this fingerprint the admitted one?"
6. chain → sshd: yes / no
7. sshd → laptop: a shell

**Annotate steps 2 and 5 together:** *two independent checks, both against
the chain. A connection needs both ends to still hold authority.*

**Do not draw the internals of the nameserver.** One box. That part stays
vague on purpose.

---

## 7 — The whole journey

*The big one. Everything from an empty dashboard to a human tapping for a
payment the agent was not allowed to make.*

This is the demo, drawn. It is worth being a wide landscape page with
**phase bands** running left to right, so a reader can see where they are
without following every arrow.

**Lanes (top to bottom):**

```
👤 Person + 🔒 Ledger
🖥  Dashboard (browser)
⚙  Broker (our server)
📦 Agent container
⛓  Chain — ENSv2 + our registries
```

### Phase A — Provision  ·  *two taps*

1. Person: fills in the machine name, ceiling, capabilities
2. Dashboard → Broker: start enrolment
3. Broker ↔ Ledger *(through the browser)*: Key Ring
4. **🔒 TAP 1** — the device admits the broker to the ring
5. *the flow stops and waits for a click* — annotate why
6. Broker: builds the container, mints keys, seals the secrets
7. Dashboard → Ledger: four calls batched by EIP-7702
8. **🔒 TAP 2** — executor, host record, allowance, ceiling
9. Chain: machine and agent names now exist

*Band caption: after this, no human is needed again until the ceiling is hit.*

### Phase B — It is alive

10. Agent container: boots, asks the broker for its secrets
11. Broker → Chain: "is this agent still authorised?"
12. Chain: yes → Broker unseals the secrets → Agent starts

*Annotate 11 — the broker asks every single time. It never caches.*

### Phase C — Getting a shell  ·  *two ways in, draw both*

**C1, in the browser**
13. Person clicks *Terminal*
14. Terminal server → Chain: is this agent live?
15. Chain: yes → shell opens in the page
16. *loop back on itself*: **re-asks every 15 seconds**

**C2, from your own machine**
13. Person clicks *Use over SSH* → an invite is minted, **🔒 optional tap**
14. Laptop joins the mesh
15. `ssh runner@acme.harness.eth`
16. name → chain, and the door → chain: **two independent checks**

*Band caption: a shell exists only while the chain still says so.*

### Phase D — The agent works  ·  *no human*

17. Person types a task into the shell
18. Agent: needs a paid API → hits x402, gets `402 Payment Required`
19. Agent → Broker: signs an intent, "pay $1.50"
20. Broker → Chain: submits it, **pays the gas**
21. Chain: alive? permitted? under the ceiling? → ✓
22. Executor: pulls $1.50 **from the owner's account**
23. Agent: gets the resource, carries on

*Annotate 22 in the accent colour: **the money was never in the agent's
hands.** This is the sentence the whole diagram exists to earn.*

### Phase E — Past the ceiling  ·  *the human comes back*

24. Person: "send $20 to this supplier"
25. Agent → Broker: "send $20"
26. Broker → Chain: checks → **refused, $8 left**
27. Broker → Agent: `402` with the shortfall
28. Agent: **does not retry. does not ask for a bigger ceiling.**
    — put this in a callout, it is the design decision
29. Agent → Broker: "prepare it as a payment instead"
30. Broker → Agent: `{to, amount, calldata}`
31. Agent → the machine the Ledger is plugged into
32. **🔒 TAP 3** — a person reads it and presses, or does not
33. Chain: the payment, signed by the **owner**, not the agent
34. Broker → Chain: verifies the hash actually landed
35. Broker → Agent: "the owner signed it. **your ceiling is unchanged.**"

*Band caption: the human is in the loop for exactly one transaction, then
out again.*

### Phase F — The off switch

36. Person clicks *Revoke* → **🔒 TAP 4**
37. Chain: agent marked revoked
38. Five things stop, all by asking: spending, the name, SSH, the open
    terminal (within 15s), the secrets

*Point back to drawing #5 rather than redrawing the fan-out.*

---

### What the reader should take away

Mark these three on the page, because they are what the whole journey
proves:

- **Taps 1 and 2** set everything up. **Tap 3** is the only one after that,
  and only because the agent asked for more than it was given.
- **Every arrow into the chain is a question**, not an instruction. Nothing
  in the system is told; everything asks.
- **The money crosses at step 22 only**, from the owner's account, at the
  moment of purchase.
