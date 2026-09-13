
# Harness

**Every AI agent gets a container with limits your Ledger sets, and you ssh to
it by its ENS name.**

<img width="1440" height="717" alt="Screenshot 2026-09-13 at 7 58 41 AM" src="https://github.com/user-attachments/assets/b6d48265-d737-4d0e-b369-17a5c0a20236" />

Harness gives every AI agent its own machine, its own name, and a spending
limit it cannot go past.

Right now, giving an agent money means giving it a key. Once it has the key, it
can spend everything, and the only thing stopping it is the agent's own
judgement. We think that is backwards.

With Harness you tap your Ledger once. That creates a container for the agent,
mints it an ENS name like `runner.acme.harness.eth`, and writes a daily
spending limit on chain. The agent gets a shell, tools, and whatever
credentials you sealed for it.

Inside its limit the agent acts on its own, with no approvals and no waiting.
Past that, a human has to sign. There is no server deciding any of this. The
contract enforces it.

The name is real ENS, so you just ssh to it. No wallet, no plugin, no copied IP
address. The same name that resolves for DNS is the one sshd checks your key
against.

Revoking is one transaction. The name stops resolving, the shell stops opening,
and the money stops moving, all at once, because all three were reading the
same record the whole time.

Built for ETHOnline 2026. Live on Sepolia.

---

## Using it

1. **Connect your Ledger.** The dashboard talks to it in the browser. There is
   nothing to install.
2. **Add a machine.** Name it, pick a limit and a window, and hand it the
   credentials it needs. One confirmation on the device and the machine exists.
3. **Open a terminal**, in the page or over ssh from your own shell.
4. **Give it work.** It pays for what it needs inside the limit, on its own.
5. **Approve the big ones.** Anything past the limit comes to your device.
6. **Revoke when you're done.**

```
ssh runner.acme.harness.eth
```

## Ledger Key Ring, on a machine with no USB port

The host is a VPS. There is no device attached to it and there never will be,
so the ring has to be joined over the network without a key ever crossing it.

The host generates its own member keypair and keeps it. The browser opens a
relay session and does nothing but forward bytes between the Ledger over WebHID
and the ring flow running on the host. It never holds a key and never sees one.
One confirmation on the device admits the host as a member of the tenant's
ring.

Once that is done we write the trustchain and the member credentials into
wallet-cli's state directory, so `wallet-cli ring encrypt` and `ring decrypt`
work on the VM from then on with no device present. That is how the ring ends
up usable directly inside the machine.

We use it to hold the agent's credentials. Model keys and service tokens are
sealed under the tenant's ring and sit on disk as ciphertext. They are opened
at container start, in memory, and only if the chain still says the agent is
live. A revoked agent does not get them back the next time it starts. The agent
never sees a private key at any point.

The fiddly part was the transport. LKRP's SDK speaks `hw-transport-webhid` and
the Device Management Kit speaks its own, and only one of them can hold the HID
handle at a time. So a session is something we open, use, and explicitly
release, and the device is passed back and forth between the two as the flow
moves from Ledger Sync to the Ethereum app. WebHID permission is per origin and
per device and it persists, so the handover is invisible to the person holding
the Ledger.

The Ledger signs a grant that says what the agent may spend and over what
period. Inside that permission the agent acts on its own, whether that is an
x402 call or any other transaction. Anything outside it is pushed back to the
Ledger for the person to sign, so they stay in the loop for what they did not
already allow. The registry enforces it by measuring the tenant's balance
before and after the batch and reverting if the difference is over the
allowance.

Payments use EIP-3009 out of the tenant's account, the one the Ledger controls.
We use `@x402/express` and `@x402/core`, so none of the payment code is ours
and it works with any x402 seller.

Setting up a machine needs four transactions. We batch them with EIP-7702 so it
is one confirmation on the device instead of four.

File by file: **[ledger.md](./ledger.md)**.

## ENS

We deployed our own registry on the ENSv2 Sepolia contracts, using
`PermissionedRegistry` and `EnhancedAccessControl`. Each tenant's registry
roots its own subtree. `harness.eth` holds `acme.harness.eth`, and acme's
registry holds `runner.acme.harness.eth`. EAC is what stops one tenant writing
into another's subtree, and it is also why the agent cannot rewrite its own
records, so it cannot change the key or the fingerprint it is admitted by. None
of that is us checking it in application code.

`AgentResolver` answers for those names. It resolves the machine's address, the
agent's key, and the ssh host key fingerprint, computed from the grant when you
ask rather than written in as separate records.

Both are fine to have in public. An ssh host key fingerprint is meant to be
published, which is what GitHub does with theirs. The address is a Tailscale
mesh address, so it only means anything to a device already in the tailnet.

We run a nameserver in front of it that answers `.eth` over DNS. That is what
makes `ssh runner.acme.harness.eth` work with no wallet and no plugin. On the
machine, sshd's `AuthorizedKeysCommand` asks ENS whether the key being offered
is allowed in, and `known_hosts` comes from the same name.

Revoking is one transaction. It unregisters the name, so resolution, ssh access
and spending all stop together.

File by file: **[ens.md](./ens.md)**.

## Under the hood

| | |
|---|---|
| **Contracts** | a registry tree, a resolver and a spend executor on ENSv2 |
| **Dashboard** | Next.js, talks to the Ledger over WebHID |
| **Nameserver** | Go, answers `.eth` over DNS by reading the chain |
| **Broker** | Node, relays agents' signed requests and pays their gas |
| **Machines** | containers, one per tenant, each on its own network |

60 contract tests. The long version, component by component, is in
**[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Verify it

Through ENS's own UniversalResolver, with nothing of ours in the path:

```bash
UR=0xd26f2040d083af1cd2962ba303f4bea0c4faf142
RPC=https://ethereum-sepolia-rpc.publicnode.com
NAME=0x0872657365617263680464656d6f076861726e6573730365746800

cast call $UR 'resolve(bytes,bytes)(bytes,address)' $NAME \
  $(cast calldata 'addr(bytes32)' $(cast namehash research.demo.harness.eth)) \
  --rpc-url $RPC
```

Addresses and the rest of the proofs are in **[ADDRESSES.md](./ADDRESSES.md)**.

## Running it

```bash
cd contracts && forge test

./tools/harness up        # nameserver, broker, terminal, seller, dashboard
./tools/harness status
./tools/harness down
```

Set `MONGODB_URI` in `web/.env`. You need a Ledger for anything that signs.

## Layout

```
contracts/   registries, resolver, executor, tests
web/         the dashboard: provisioning, spend, terminal, mesh invites
x402/        the broker: relays agent requests, pays gas, handles payments
runner/      the agent container: sshd, the ledger tool, agent skills
dns/         the nameserver that answers .eth over DNS
terminal/    the in-page shell, which re-checks the chain every 15 seconds
tools/       harness up/down, the ssh hooks, the device agent
```

## What isn't finished

**Transactions are blind-signed.** The device shows raw calldata rather than
"grant runner.acme $10/day". That needs ERC-7730 metadata, which we have not
written, so today you are trusting the dashboard composed the right
transaction. It is a metadata file rather than a change to the design.

**Sepolia only**, against the ENSv2 hackathon deployment, which is a separate
namespace from the ENSv2 Beta.
