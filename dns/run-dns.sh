#!/bin/sh
# Build and start the nameserver, on the mesh.
#
# It answers `<agent>.<tenant>.harness.eth` by asking ENS, so a name resolves
# for exactly as long as the chain says it should — and stops resolving in the
# same transaction that stops the Agent spending.
#
# This is the one container that gets a real TUN. DNS is UDP and tailscaled's
# userspace netstack forwards TCP only, so there is no privilege-free way to
# answer a query on the mesh. CAP_NET_ADMIN here reaches this container's own
# network namespace and not the host's; the host stays off the tailnet.
set -eu

repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo/dns"

if [ -z "${TS_AUTHKEY:-}" ] && [ -r "$repo/contracts/.env" ]; then
    TS_AUTHKEY=$(sed -n 's/^\s*\(export \)\?TS_AUTHKEY=//p' "$repo/contracts/.env" | tr -d "\"'" | head -1)
fi
: "${TS_AUTHKEY:?set TS_AUTHKEY, or put it in contracts/.env}"

# Static, so the image needs no Go toolchain and no libc to match.
CGO_ENABLED=0 GOOS=linux GOARCH=$(uname -m | sed 's/aarch64/arm64/;s/x86_64/amd64/') \
    go build -trimpath -ldflags="-s -w" -o harness-dns .

podman build -q -t harness-dns:latest -f Containerfile . >/dev/null

podman rm -f harness-dns >/dev/null 2>&1 || true
podman run -d --name harness-dns \
    --device /dev/net/tun --cap-add NET_ADMIN \
    -e TS_AUTHKEY="$TS_AUTHKEY" \
    -e TS_HOSTNAME=harness-dns \
    harness-dns:latest >/dev/null

# The address is what the tailnet has to be told to send `.eth` queries to, so
# it is the one thing worth printing.
i=0
while [ $i -lt 30 ]; do
    ip=$(podman exec harness-dns tailscale --socket=/run/tailscale/tailscaled.sock ip -4 2>/dev/null | head -1) || true
    [ -n "${ip:-}" ] && break
    i=$((i + 1))
    sleep 1
done

if [ -z "${ip:-}" ]; then
    echo "the nameserver did not reach the mesh; see: podman logs harness-dns" >&2
    exit 1
fi

echo "nameserver on the mesh at ${ip}"

# Tell the tailnet to send `.eth` here.
#
# Done over the API rather than left as an instruction, because a demo that
# begins "first, open the admin console" is a demo nobody can run. The OAuth
# client needs the `dns` scope; without it this says so and the address above
# is what somebody would type in by hand.
env_file="$repo/web/.env"
[ -r "$env_file" ] || env_file="$repo/contracts/.env"
get() { sed -n "s/^\s*\(export \)\?$1=//p" "$env_file" 2>/dev/null | tr -d "\"'" | head -1; }

id=$(get TS_OAUTH_CLIENT_ID)
secret=$(get TS_OAUTH_CLIENT_SECRET)

if [ -z "$id" ] || [ -z "$secret" ]; then
    echo "no Tailscale OAuth client, so .eth was not wired up."
    echo "Add it by hand: DNS -> Nameservers -> Custom -> ${ip}, restricted to 'eth'."
    exit 0
fi

token=$(curl -fsS -X POST https://api.tailscale.com/api/v2/oauth/token \
    -d "client_id=$id" -d "client_secret=$secret" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))') || token=""

if [ -z "$token" ]; then
    echo "could not exchange the OAuth client, so .eth was not wired up." >&2
    exit 1
fi

# PATCH merges, so this replaces the `eth` route and leaves any other alone.
answer=$(curl -fsS -X PATCH https://api.tailscale.com/api/v2/tailnet/-/dns/split-dns \
    -H "Authorization: Bearer $token" -H 'content-type: application/json' \
    -d "{\"eth\": [\"${ip}\"]}") || answer=""

if [ -z "$answer" ]; then
    echo "the tailnet refused the split-DNS change; the client may lack the 'dns' scope." >&2
    echo "Add it by hand: DNS -> Nameservers -> Custom -> ${ip}, restricted to 'eth'." >&2
    exit 1
fi

echo "tailnet resolves .eth here: ${answer}"
echo
echo "Anyone on the mesh can now reach an agent by name:"
echo "  ssh runner@<agent>.<tenant>.harness.eth"
