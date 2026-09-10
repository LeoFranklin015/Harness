# Live on Sepolia — ETHOnline 2026 hackathon ENSv2 deployment

Built against the **dedicated hackathon deployment**, which is a separate
namespace from the standard ENSv2 Beta on Sepolia. The docs are explicit about
this ("Build your hackathon project against these addresses"), and the two do
not see each other's names.

| ENS, theirs | |
|---|---|
| ETHRegistry | `0x1d78834d97c1d7b1a38c1dedbd1a287cfed3971e` |
| ETHRegistrar | `0x7d1B7f586a62Ac3F54b9A396849757814283270b` |
| UniversalResolver (proxy) | `0xd26f2040d083af1cd2962ba303f4bea0c4faf142` |
| LabelStore | `0xD7351F76866123A7E49381F38a30a96AdBa7E855` |

| Ours | |
|---|---|
| `PlatformRegistry` — what `harness.eth` points at | `0x7d2f806171C046833526841094A2179e526CE6DE` |
| `AgentResolver` | `0x90d7dB16B49D62013C037876b765C2284Fc8e292` |
| `AgentRegistry` implementation (cloned per Tenant) | `0xfFEfe4Fd6a89863e74E874C2281E06cd7912E339` |
| `demo`'s registry | `0x7F3a14C1DF064db0969fC4C1cF7a017C802809a2` |
| `demo`'s executor | `0xE44A5a2C4670aFac462c3B49941f596f9c6b2BD7` |
| owner / root device | `0xE08224B2CfaF4f27E2DC7cB3f6B99AcC68Cf06c0` |
| `research` Agent Key | `0xD98eC6253526E9b690597bD3B5f871eF7200086E` |

`harness.eth` is a real registration — bought through the ETHRegistrar's
commit-reveal for 8 USDC, expiring 2027-09-05.

## Three levels, three jobs

```
harness.eth             PlatformRegistry   who the Tenants are
  demo.harness.eth      AgentRegistry      the machine: IP, SSH host key,
                                           and the device that signs here
    research.…          an Agent           spend caps, call rules, expiry
```

Each Tenant's registry carries its **own** device, so two Tenants are two trees
rooted in two separate pieces of hardware and neither device can reach into the
other's tree. Each also gets its own executor, so no Tenant's registry can
direct another's funds.

The host record is published once, by the machine that owns it, and Agents
inherit it — an address and a host key belong to a host, and every Agent on that
host shares them.

## Every name here is a real ENSv2 name

Not a lookup table that answers ENS queries. Granting authority calls
`register()`; revoking calls `unregister()`. Three properties follow from that
rather than being invented:

- The name's expiry **is** the Grant's end. One number, no second clock.
- Revoking burns the token and frees the name.
- An Agent's name **cannot be transferred** — the registration withholds
  `ROLE_CAN_TRANSFER_ADMIN`, so ENSv2 itself refuses. A sellable name would
  outlive the Grant it stands for.

## Proving it end to end

Through ENS's own UniversalResolver, with nothing of ours in the path:

```
UR=0xd26f2040d083af1cd2962ba303f4bea0c4faf142
RPC=https://ethereum-sepolia-rpc.publicnode.com
NAME=0x0872657365617263680464656d6f076861726e6573730365746800

cast call $UR 'resolve(bytes,bytes)(bytes,address)' $NAME \
  $(cast calldata 'addr(bytes32)' $(cast namehash research.demo.harness.eth)) --rpc-url $RPC
# 0x…d98ec6253526e9b690597bd3b5f871ef7200086e   the Agent Key
```

As a hostname, through the nameserver — which is itself an ordinary ENS client,
making that same call:

```
dig @127.0.0.1 -p 5354 research.demo.harness.eth A +short   # 141.148.209.77
ssh research.demo.harness.eth
```

And with SSH trusting ENS instead of `known_hosts`:

```
Host *.harness.eth
    KnownHostsCommand /home/opc/hackathon/tools/harness-known-hosts %H
    StrictHostKeyChecking yes
```

Verified with `known_hosts` pointed at `/dev/null`, so ENS was the only thing
vouching for the host: plain ssh gives `Host key verification failed`; with the
lookup, verification passes.

SSHFP would be the standard route, but `VerifyHostKeyDNS yes` only implicitly
trusts a *secure* fingerprint — DNSSEC-signed — and degrades to `ask` otherwise.
`KnownHostsCommand` needs no DNSSEC and terminates the connection when it exits
non-zero, so a revoked Agent fails closed.

## Rebuilding it

```
export SALT=20260905 STAGE=commit
forge script script/Hackathon.s.sol --rpc-url $RPC --broadcast --slow
# wait 60s — the registrar enforces a minimum commitment age
STAGE=register PLATFORM=… RESOLVER=… forge script script/Hackathon.s.sol --rpc-url $RPC --broadcast --slow
```

`--slow` is required: the deployer carries an EIP-7702 delegation, and public
RPCs reject more than one pending transaction from a delegated account
(`gapped-nonce tx from delegated accounts`).
