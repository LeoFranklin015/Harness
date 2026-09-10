#!/usr/bin/env bash
# Runs one Tenant's machine, with an address that does not drift and a share of
# the host it cannot exceed.
#
# Both matter for the same reason. A Tenant's address is published on chain, so
# it must survive a restart — podman hands out addresses in order, and a
# recreated container would otherwise quietly move to a different one and stop
# matching its own ENS record.
#
# And an unlimited container can allocate the whole host: `leo` could starve
# `acme` and the box with it. Tenants are meant to be isolated from each other,
# and a neighbour who can exhaust your memory is not isolated from you. This is
# not a substitute for the hardware boundary a real deployment wants — a shared
# kernel is still a shared kernel — but it removes the failure that costs
# nothing to prevent.
#
# The same argument applies to the network. On one shared bridge every Runner
# can reach every other Runner, which is a neighbour you did not agree to. So
# each Tenant gets a network of its own with `isolate=strict`, and the only
# address in it that answers is the gateway — the host, where the broker is.
set -euo pipefail

tenant="${1:?usage: run-tenant.sh <tenant> [agent]}"
agent="${2:-runner}"

# The mesh key is read from the secrets file rather than passed in. This script
# is run through sudo by the web server, and an environment handed across sudo
# either gets dropped by the policy or shows up in the process list.
if [ -z "${TS_AUTHKEY:-}" ] && [ -r /home/opc/hackathon/contracts/.env ]; then
    TS_AUTHKEY=$(sed -n 's/^\s*\(export \)\?TS_AUTHKEY=//p' /home/opc/hackathon/contracts/.env | tr -d "\"'" | head -1)
fi
mem="${MEM:-384m}"   # tailscaled wants ~50MB of its own
cpus="${CPUS:-0.5}"

# sshd needs exactly four capabilities: bind port 22, chroot for privilege
# separation, and change uid/gid to drop to the Agent. Everything else goes.
sudo podman rm -f "harness-${tenant}" >/dev/null 2>&1 || true

# One network per Tenant. `isolate=strict` is what makes it a boundary rather
# than a label: netavark drops traffic from this bridge to any other, so a
# Runner cannot reach another Tenant's Runner at all. Its own gateway still
# answers, which is the host, which is where the broker listens — the one thing
# it is meant to be able to reach.
net="harness-${tenant}"
sudo podman network exists "$net" \
    || sudo podman network create --opt isolate=strict "$net" >/dev/null
gateway=$(sudo podman network inspect "$net" --format '{{range .Subnets}}{{.Gateway}}{{end}}')
# Tailscale needs somewhere to keep its node key across restarts, and the root
# filesystem is read-only on purpose.
sudo podman volume create "harness-${tenant}-ts" >/dev/null 2>&1 || true
# Ownership of the state directory is fixed in the image, not here: a named
# volume copies the image directory up on first start, which would undo a chown
# done at this point.

sudo podman run -d \
    --name "harness-${tenant}" \
    --network "$net" \
    -e TS_AUTHKEY="${TS_AUTHKEY:?set TS_AUTHKEY}" \
    -e TS_HOSTNAME="${tenant}-runner" \
    -e HARNESS_BROKER="http://${gateway}:8402" \
    -e HARNESS_SELLER="${HARNESS_SELLER:-http://${gateway}:4023}" \
    --label "harness.tenant=${tenant}" \
    --label "harness.agent=${agent}" \
    `# The name it answers to on chain, so a prompt and a hostname say something` \
    `# a person can act on rather than a container id nobody chose.` \
    --hostname "${agent}.${tenant}.harness.eth" \
    `# A writable home on a tmpfs. The root filesystem is read-only, and a CLI` \
    `# that cannot save its own config re-asks its first-run questions on every` \
    `# launch. Wiped on restart, so nothing a CLI cached about who it is` \
    `# outlives the moment the chain stops vouching for this Agent.` \
    --tmpfs "/home/runner:rw,mode=0755,size=256m" \
    -v "harness-${tenant}-ts:/var/lib/tailscale" \
    `# A real TUN. Userspace networking could not establish a path to a peer` \
    `# out on the internet, so a visitor's connection hung rather than being` \
    `# refused. NET_ADMIN here reaches this container's own network namespace` \
    `# and not the host's.` \
    --device /dev/net/tun \
    --cap-add NET_ADMIN \
    --memory "$mem" \
    --memory-swap "$mem" \
    --cpus "$cpus" \
    --pids-limit 128 \
    --read-only \
    --tmpfs /run \
    --tmpfs /var/run \
    --tmpfs /tmp \
    --cap-drop ALL \
    --cap-add CHOWN --cap-add SETUID --cap-add SETGID --cap-add DAC_OVERRIDE \
    --cap-add NET_BIND_SERVICE --cap-add SYS_CHROOT \
    "harness-${tenant}" >/dev/null

ip=$(sudo podman inspect "harness-${tenant}" \
    --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
echo "  harness-${tenant}  ${ip}  net=${net} (isolated)  broker=${gateway}:8402  mem=${mem} cpus=${cpus}"
