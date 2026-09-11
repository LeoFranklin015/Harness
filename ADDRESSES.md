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
| `PlatformRegistry` — what `harness.eth` points at | `0xbDF56e17F8956268Fc018B77Dac2ebEa7b3928F7` |
| `AgentResolver` | `0x2D5D8575A6CfaD38EB6a901Dbc41f9F827C53991` |
| `AgentRegistry` implementation (cloned per Tenant) | `0x74dBF4a7a2C2b46b7a1C3F0e1F4d8B0aD5fC2E11` |
| `demo`'s registry | `0xfE21595f2A1D586B8d098117799c62619707BE59` |
| `demo`'s executor | `0x923C84Fb1A012eB8B45EC086500A7E194C895953` |
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

## SSH, in both directions

The client checks the host against ENS, and the host checks the client. Together
a connection is only possible while both ends still hold authority.

| | who checks whom | hook |
|---|---|---|
| client side | is this really the host? | `KnownHostsCommand` → `tools/harness-known-hosts` |
| host side | may this key log in? | `AuthorizedKeysCommand` → `tools/harness-authorized-keys` |

```
Match User agent
    AuthorizedKeysCommand /usr/local/bin/harness-authorized-keys %u %f %k %t
    AuthorizedKeysCommandUser nobody
    AuthorizedKeysFile none
    PasswordAuthentication no
```

`harness-authorized-keys` is pure `python3` — standard library only, no
Foundry, no pip. It runs inside sshd's login path on every connection, so it
depends on nothing that has to be installed and nothing that could be missing
when someone needs to get in. It includes a Keccak-256 implementation for that
reason: `hashlib` has SHA3-256, whose padding byte differs, and ENS needs
Keccak. About 230ms per login, almost all of it the RPC round trip.

**ENS holds a fingerprint, never the key.** sshd hands `AuthorizedKeysCommand`
the key the client is offering (`%k`, `%f`), so the script only has to verify a
key, never enumerate one. Publishing the authorized key itself would publish an
access roster — who may log in, and precisely which private key is worth
stealing — permanently and globally indexed. A fingerprint verifies a key that is
offered without naming one that is not. The Runner's *host* key is the opposite
case and is published whole: there the machine identifies itself, which is what
SSHFP exists for.

| | verdict |
|---|---|
| live agent, the authorised key | **allowed** |
| live agent, some other key | refused |
| revoked agent, the same key | refused |
| an agent that never existed | refused |
| chain unreachable | refused, non-zero exit — sshd terminates the connection |

The last row is the one to get right: an unreachable chain must not become an
open door.

Revocation ends everything at once. `newsdesk.demo.harness.eth`, one
transaction:

```
same key, same host, after revocation
  newsdesk.demo.harness.eth authorises nobody — revoked, expired, or no runner
  dig  : []
  known-hosts: publishes no host key — revoked, expired, or no runner
```

Spending stops, the name stops resolving, and the host refuses the login —
without evicting anything from the mesh, and without the machine being told that
a revocation happened. All three are computed from the same fact.
