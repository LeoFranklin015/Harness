#!/bin/sh
# Bring the Agent onto the mesh, then serve.
#
# Userspace networking: no TUN device, no NET_ADMIN. The Agent gets a mesh
# address without the container needing the privileges that would let it touch
# the host's network — which is the whole reason Tailscale runs in here rather
# than on the host. A host on the tailnet is a host everyone you share with can
# reach; an Agent on the tailnet is the point.
set -e

: "${TS_AUTHKEY:?TS_AUTHKEY is required}"
: "${TS_HOSTNAME:?TS_HOSTNAME is required}"

tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state \
           --socket=/run/tailscale/tailscaled.sock &

# Shields stay down: they would block *all* inbound, including the ssh this
# Agent exists to serve. What restricts access is the tailnet ACL — shared users
# reach `tag:agent:22` and nothing else — and then sshd asks ENS whether the key
# offered may log in at all. Two gates, neither of them this flag.
#
# DNS is not accepted from the tailnet either: this Agent resolves names through
# the chain, and letting MagicDNS answer first would put a different source of
# truth in front of it.
tailscale --socket=/run/tailscale/tailscaled.sock up \
    --authkey="${TS_AUTHKEY}" \
    --hostname="${TS_HOSTNAME}" \
    --shields-up=false \
    --accept-dns=false

tailscale --socket=/run/tailscale/tailscaled.sock ip -4 | head -1 > /run/tailscale-ip
echo "mesh address: $(cat /run/tailscale-ip)"

exec /usr/sbin/sshd -D -e
