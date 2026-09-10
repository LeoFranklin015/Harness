#!/usr/bin/env bash
# Builds one Tenant's Runner: a machine with its own SSH host key and name.
#
# The host key is generated here and copied in, never generated inside the
# container. `ssh-keygen -A` only creates keys that do not already exist, so an
# injected key survives it — and it means the key can be published to ENS before
# the Runner is ever reachable, leaving no window in which a client has to trust
# on first use.
set -euo pipefail
tenant="${1:?usage: build-tenant.sh <tenant> <agent-label>}"
agent="${2:?}"
dir="build/${tenant}"

mkdir -p "$dir"
cp Containerfile sshd_config entrypoint.sh ../tools/harness-authorized-keys "$dir/"
echo "${agent}.${tenant}.harness.eth" > "$dir/name"

if [ ! -f "$dir/ssh_host_ed25519_key" ]; then
    ssh-keygen -q -N '' -t ed25519 -f "$dir/ssh_host_ed25519_key" -C "${tenant}-runner"
fi

sudo podman build -q -t "harness-${tenant}" "$dir" >/dev/null

# The raw 32 bytes the contract stores — an ed25519 public key is exactly that,
# and the whole known_hosts line rebuilds from it.
python3 - "$dir/ssh_host_ed25519_key.pub" <<'PY'
import base64, sys
blob = base64.b64decode(open(sys.argv[1]).read().split()[1])
n = int.from_bytes(blob[:4], "big"); m = int.from_bytes(blob[4+n:8+n], "big")
print("0x" + blob[8+n:8+n+m].hex())
PY
