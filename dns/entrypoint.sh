#!/bin/sh
# Bring the nameserver onto the mesh, then serve.
#
# A real TUN, unlike a Runner. tailscaled's userspace netstack forwards TCP and
# only TCP — `tailscale serve --tcp 22` is what makes an Agent reachable with no
# privilege at all — and DNS is UDP. There is no `serve --udp`, so the choice is
# a kernel interface or no DNS.
#
# CAP_NET_ADMIN sounds worse than it is here: it applies to this container's own
# network namespace, which contains one interface and this process. It cannot
# see or touch the host's networking, and the host stays off the tailnet.
set -e

: "${TS_AUTHKEY:?TS_AUTHKEY is required}"
: "${TS_HOSTNAME:=harness-dns}"

tailscaled --state=/var/lib/tailscale/tailscaled.state \
           --socket=/run/tailscale/tailscaled.sock &

# Accepting DNS from the tailnet would be circular: this *is* the tailnet's
# answer for `.eth`, and taking MagicDNS's view of the world first would put a
# second source of truth in front of the chain.
tailscale --socket=/run/tailscale/tailscaled.sock up \
    --authkey="${TS_AUTHKEY}" \
    --hostname="${TS_HOSTNAME}" \
    --shields-up=false \
    --accept-dns=false

MESH=$(tailscale --socket=/run/tailscale/tailscaled.sock ip -4 | head -1)
echo "mesh address: ${MESH}"

# See runner/entrypoint.sh for why this exists: behind NAT, nothing establishes
# a path to a peer until this side initiates, and a resolver that only answers
# when it happens to have talked to you recently is worse than no resolver.
S=/run/tailscale/tailscaled.sock
while :; do
    for ip in $(tailscale --socket=$S status 2>/dev/null | tail -n +2 | cut -d" " -f1 | grep ^100); do
        tailscale --socket=$S ping -c 1 --timeout 2s "$ip" >/dev/null 2>&1 &
    done
    wait
    sleep 20
done &

# Bound to the mesh address alone. On 0.0.0.0 it would also answer on the
# container's private network, which is a second way in that nobody asked for.
exec /usr/local/bin/harness-dns -addr "${MESH}:53"
