# Runner

A Tenant's machine. Its sshd asks ENS who may log in, so shell access answers to
the same authority as spending.

```
./build-tenant.sh leo research     # prints the host key for the contract
sudo podman run -d --name harness-leo harness-leo
```

Rootful podman so each Tenant gets a real routable private IP on `10.88.0.0/16`
rather than a port on loopback — a Tenant is a machine, and it should have an
address like one.

## What a Tenant is allowed

By default a container has **no memory limit at all** — `podman stats` shows its
usage against the host's total, because the host's total is the ceiling. Either
Tenant could allocate all 11.4 GB and take the box and its neighbour with it.
Tenants are meant to be isolated, and a neighbour who can exhaust your memory is
not isolated from you.

`run-tenant.sh` therefore pins both the address and the share:

| | | why |
|---|---|---|
| `--ip` | fixed per Tenant | the address is published on chain, so it must survive a restart; podman hands out addresses in order and a recreated container would quietly move off its own ENS record |
| `--memory` / `--memory-swap` | 256 MB | swap set equal, or the container simply swaps past the cap |
| `--cpus` | 0.5 | one Tenant cannot spin the box |
| `--pids-limit` | 128 | a fork bomb is a memory limit you forgot |
| `--read-only` + tmpfs | root fs immutable | the Agent's code is what shipped |
| `--cap-drop ALL` | plus four | see below |

Verified rather than assumed — 400 MB into a 256 MB Tenant is killed by the
cgroup, and neither the host nor the neighbouring Tenant notices:

```
$ podman exec harness-acme python3 -c "bytearray(400*1024*1024); print('NOT ENFORCED')"
  -> killed by the cgroup
  harness-leo Up   harness-acme Up   host: 7961 MB available
```

sshd needs exactly four capabilities and gets no others:

| | |
|---|---|
| `NET_BIND_SERVICE` | port 22 is privileged |
| `SYS_CHROOT` | privilege separation chroots to `/var/empty` |
| `SETUID` / `SETGID` | drop to the Agent's uid |

Both were found by breaking it: without the first, `Bind to port 22 failed:
Permission denied`; without the second, `chroot("/var/empty"): Operation not
permitted`.

## This is not a hardware boundary

The containers share the host kernel — `6.12.0-204…aarch64` inside and out — so
the isolation is namespaces, cgroups and seccomp, not virtualisation. A kernel
escape reaches the other Tenant and the agent root secret with it.

That is the right boundary between Agents *inside* one Tenant, which share a
device and a ceiling anyway. It is the wrong one *between* Tenants. In
production a Tenant is a machine, and the boundary is the machine; here they are
containers on one host because that is the hardware available. Firecracker or
Kata would close it, but this box is itself a guest with no `/dev/kvm`, so a
microVM is not available to run.

## Three things in the build are load-bearing

- **The host key is generated outside and copied in.** `ssh-keygen -A` only
  creates keys that do not already exist, so an injected key survives it — and
  it means ENS can publish the key *before* the Runner is ever reachable,
  leaving no window in which a client has to trust on first use.
- **`AuthorizedKeysFile none`.** Without it sshd consults
  `~/.ssh/authorized_keys` first, and a key left there would outlive
  revocation. No list of authorized keys exists anywhere on the machine.
- **`sed 's/^runner:!/runner:*/' /etc/shadow`.** `adduser -D` leaves the account
  locked and sshd refuses a locked account even for public-key auth. The Agent
  has no password at all, which is `*`, not `!`.

## Two Tenants, 2026-09-06

```
harness.eth                  PlatformRegistry   0xbDF56e17…28F7
├── leo.harness.eth          10.88.0.6          registry 0xD4f048C3…E8e4  executor 0x7c44b9c3…18F6
│     └── research.leo.…     $10/day
└── acme.harness.eth         10.88.0.7          registry 0x3B8c36Dc…926c  executor 0x9dB089dB…2925
      └── scout.acme.…       $2/day
```

Separate registries, separate executors, separate host keys, separate addresses.
Each Tenant's registry carries its own `rootDevice`, so two Tenants are two trees
rooted in two different pieces of hardware and neither device can grant anything
in the other's tree. Separate executors mean neither Tenant's registry can direct
the other's funds.

Both reachable by name, with `known_hosts` at `/dev/null` and no
`authorized_keys` anywhere — both ends consulting ENS:

```
research.leo.harness.eth  →  10.88.0.6   in ec69b022b9ec, I am research.leo.harness.eth
scout.acme.harness.eth    →  10.88.0.7   in 1e5ae51ee2da, I am scout.acme.harness.eth
```

Then one transaction revoked `research.leo`. Neither container was restarted or
reconfigured:

| | DNS | SSH |
|---|---|---|
| `research.leo.harness.eth` | — | refused |
| `scout.acme.harness.eth` | 10.88.0.7 | allowed |

The blast radius of a revocation is exactly one Agent.
