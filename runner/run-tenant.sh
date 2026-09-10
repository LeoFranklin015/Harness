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
set -euo pipefail

tenant="${1:?usage: run-tenant.sh <tenant> <ip>}"
ip="${2:?}"
mem="${MEM:-384m}"   # tailscaled wants ~50MB of its own
cpus="${CPUS:-0.5}"

# sshd needs exactly four capabilities: bind port 22, chroot for privilege
# separation, and change uid/gid to drop to the Agent. Everything else goes.
sudo podman rm -f "harness-${tenant}" >/dev/null 2>&1 || true
# Tailscale needs somewhere to keep its node key across restarts, and the root
# filesystem is read-only on purpose.
sudo podman volume create "harness-${tenant}-ts" >/dev/null 2>&1 || true
# Ownership of the state directory is fixed in the image, not here: a named
# volume copies the image directory up on first start, which would undo a chown
# done at this point.

sudo podman run -d \
    --name "harness-${tenant}" \
    --ip "$ip" \
    -e TS_AUTHKEY="${TS_AUTHKEY:?set TS_AUTHKEY}" \
    -e TS_HOSTNAME="${tenant}-runner" \
    -v "harness-${tenant}-ts:/var/lib/tailscale" \
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

echo "  harness-${tenant}  ${ip}  mem=${mem} cpus=${cpus}"
