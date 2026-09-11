# Harness

**Give an AI agent its own machine, its own name, and a spending limit set
by one tap on a hardware wallet.**

The agent can work unattended and pay for things as it goes. It cannot
raise its own limit, cannot reach anyone else's machine, and cannot leak a
key it never had. When it needs something outside the limit it stops and
puts the payment in front of you.

One more tap ends everything at once: spending, the name, SSH access, an
open terminal, and the credentials it gets on restart.

Built for ETHOnline 2026.

---

## What you get

**A machine per agent.** An isolated container with a shell, its own
private network address, and no public ports. It boots with whatever you
gave it: a Claude or Codex sign-in, API keys, anything else it needs.

**A name you can connect to.**

```
ssh runner@acme.harness.eth
```

No wallet, no plugin, no copied IP address. It works from a laptop, a
phone, or a terminal on a watch, because the name resolves over ordinary
DNS.

**A spending limit you actually control.** You pick a ceiling in dollars
per day and what the agent may do with the money. Your funds stay in your
own account the whole time and move only at the moment of a purchase, only
if the rule allows it. There is no agent wallet to drain.

**A way to be asked.** When the agent wants more than its ceiling, it does
not retry and does not ask for a bigger ceiling. It prepares the payment
and sends it to your device. You read it, you tap or you don't, and the
ceiling is unchanged either way.

**An off switch that works.** Revoking takes one tap and one transaction.
Nothing has to be cleaned up afterwards, because nothing was cached in the
first place.

## Using it

1. **Connect your Ledger.** The dashboard talks to it in the browser. There
   is nothing to install.
2. **Add a machine.** Name it, pick a ceiling and a window, choose what it
   may call, and hand it the keys it needs. Two taps on the device and the
   machine exists.
3. **Open a terminal**, in the page or over SSH from your own shell.
4. **Give it work.** It pays for what it needs inside the limit, on its own.
5. **Approve the big ones.** Anything past the ceiling comes to your device.
6. **Revoke when you're done.**

## How it works

Every part of the system asks the blockchain, every time, rather than
holding a copy of the answer:

| When you | What happens |
|---|---|
| set a limit | a rule is written on chain saying what this agent may do |
| look up the name | a resolver works the answer out from that rule |
| SSH in | the machine checks your key's fingerprint against the chain |
| the agent pays | a contract checks the rule, then pulls from your account |
| revoke | the rule is marked dead, and everything that asks gets a no |

That is why revoking is instant and complete. Nothing gets switched off,
because nothing was ever holding permission of its own.

Names are real ENSv2 names. Each machine gets a registry contract of its
own, and issues its agents' names itself. Granting authority mints the
name and revoking burns it, so a name cannot outlive the permission behind
it.

The long version, component by component, is in
**[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Under the hood

| | |
|---|---|
| **Contracts** | a registry tree, a resolver and a spend executor on ENSv2 |
| **Dashboard** | Next.js, talks to the Ledger over WebHID |
| **Nameserver** | Go, answers `.eth` over DNS by reading the chain |
| **Broker** | Node, relays agents' signed requests and pays their gas |
| **Machines** | containers, one per tenant, each on its own network |

Ledger's Device Management Kit for onboarding, its Key Ring for encrypting
what the agent knows, EIP-7702 to batch four signatures into one, x402 for
machine payments, and Tailscale for the private network.

61 contract tests. Everything is live on Sepolia.

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

Addresses and the rest of the proofs are in
**[ADDRESSES.md](./ADDRESSES.md)**.

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
tools/       harness up/down, the SSH hooks, the device agent
```

## What isn't finished

**Transactions are blind-signed.** The device shows raw calldata rather
than "grant runner.acme $10/day". That needs ERC-7730 metadata, which we
have not written, so today you are trusting the dashboard composed the
right transaction. It is a metadata file rather than a change to the
design.

**The executor settles transfers and swaps.** Those are the two shapes the
contract that carries actions out understands. You can authorise more than
that and the registry will permit it, but it will not execute. The setup
screen marks which options are settleable rather than hiding it.

**Sepolia only**, against the ENSv2 hackathon deployment, which is a
separate namespace from the ENSv2 Beta.
