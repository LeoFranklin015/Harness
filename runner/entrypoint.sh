#!/bin/sh
# Bring the Agent onto the mesh, then serve.
#
# Tailscale runs in here rather than on the host, which is the part that
# matters: a host on the tailnet is a host everyone you share with can reach,
# and an Agent on the tailnet is the point.
#
# This used to run with --tun=userspace-networking, on the argument that an
# Agent should not need NET_ADMIN. It was a good argument and it did not work.
# A netstack could talk to peers behind the same NAT, and could not establish a
# path to a peer out on the internet — not directly, and not over DERP either.
# Visitors saw a connection that hung and timed out, which looks exactly like a
# closed port and was nothing of the kind. The nameserver, identical but for a
# real TUN, reached the same peer first try; that is what settled it.
#
# CAP_NET_ADMIN is narrower than it sounds. It applies to this container's own
# network namespace, which holds one interface and these processes. It cannot
# see or touch the host's networking, and the host stays off the tailnet.
set -e

: "${TS_AUTHKEY:?TS_AUTHKEY is required}"
: "${TS_HOSTNAME:?TS_HOSTNAME is required}"

tailscaled --state=/var/lib/tailscale/tailscaled.state \
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

# No `serve --tcp 22` any more. That existed to hand inbound connections to
# sshd across a netstack, which a real TUN does by itself: the kernel has a
# route for 100.x, and sshd on 0.0.0.0:22 simply receives them.
#
# It has to be actively cleared, though, because serve config lives in the
# state directory and that is a volume which outlives the image. Left in place
# it does real harm now: under a netstack it forwarded to localhost, but with a
# TUN tailscaled opens an actual socket on 100.x:22 and sshd then cannot bind
# 0.0.0.0:22 at all. The container came up on the mesh and died a second later
# with "Address in use".
tailscale --socket=/run/tailscale/tailscaled.sock serve reset 2>/dev/null || true

# What this Agent was given, opened by the broker if the chain still allows it.
# In the background, because the broker binds a gateway that does not exist
# until a container is running on the network — which is to say, until this one
# is — so it may not answer for a few seconds and sshd should not wait.
/usr/local/bin/fetch-secrets &

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
