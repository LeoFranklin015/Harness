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

# Userspace networking gets us an address on the mesh, but not an open port.
# Without a TUN device the kernel has no route for 100.x, so tailscaled runs a
# netstack instead — and a netstack will not hand an inbound connection to a
# local process unless it is told which port to forward. sshd is listening on
# 0.0.0.0:22 and would otherwise never see a packet: the connection just hangs,
# which looks exactly like a firewall and is not one.
#
# The alternative is a real TUN, which costs NET_ADMIN. This costs one line.
tailscale --socket=/run/tailscale/tailscaled.sock serve --bg --tcp 22 tcp://localhost:22

tailscale --socket=/run/tailscale/tailscaled.sock ip -4 | head -1 > /run/tailscale-ip
echo "mesh address: $(cat /run/tailscale-ip)"

# Keep a path open to every peer, so that arriving is enough to be let in.
#
# This machine is behind NAT and never dials out, so nothing here ever
# establishes a path on its own. When a visitor knocks, tailscaled has no
# cached endpoint for them and no DERP home either — the netmap only carries
# that once the two have talked — and a WireGuard handshake from a NAT'd source
# cannot be answered from nothing:
#
#     wg: [peer] - Failed to send handshake response: no UDP or DERP addr
#
# The visitor sees a connection that hangs and then times out, which is
# indistinguishable from a closed port and is the opposite of what happened:
# the packets arrived, and there was no way to reply. Discovery would have
# fixed it, but discovery is what had not run yet.
#
# So this side initiates, periodically, to everyone. A ping is enough to learn
# a peer's endpoints and hold the NAT mapping open, which turns "reachable if
# you retry for a while" into "reachable". It costs one UDP packet per peer per
# interval and nothing else.
# Plain `status` rather than `--json`: it puts this node on the first line and
# one peer per line after it, so the peers are a column. The JSON spreads each
# address over three lines, which needs a parser this image does not have.
peers() {
    tailscale --socket=/run/tailscale/tailscaled.sock status 2>/dev/null \
        | awk 'NR > 1 && $1 ~ /^100\./ { print $1 }'
}

while :; do
    for ip in $(peers); do
        tailscale --socket=/run/tailscale/tailscaled.sock ping -c 1 --timeout 2s "$ip" >/dev/null 2>&1 &
    done
    wait
    sleep 20
done &

exec /usr/sbin/sshd -D -e
