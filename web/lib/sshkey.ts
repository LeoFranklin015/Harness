import { createHash, hkdfSync } from "node:crypto";
import type { Hex } from "viem";
import { agentRootFor, existingAgentRootFor } from "./agent-root";
import { ed25519FromSeed } from "./openssh";


/**
 * The key a visitor is given, and the setup that installs it.
 *
 * The visitor never supplies a key of their own. Asking someone to paste their
 * public key is where a person stops — and their everyday key is more than a
 * short visit is worth, since it is the one they use for everything else.
 */

export type VisitorKey = {
  /** The OpenSSH private key, whole. */
  privateKey: string;
  /** The `ssh-ed25519 AAAA…` line. */
  publicKey: string;
  /** Exactly what `ssh-keygen -l` prints and sshd passes as `%f`. */
  fingerprint: string;
  /** The same digest as raw bytes, which is what `setHost` takes. */
  operator: Hex;
};

/**
 * The key that opens one Agent, derived rather than invented.
 *
 * It used to be generated fresh per visit, which meant a fresh fingerprint on
 * chain per visit, which meant a transaction and a tap on the Ledger every
 * time somebody wanted a shell. That is a lot of ceremony for letting a
 * colleague look at a log.
 *
 * Deriving it from the Tenant's sealed root removes the transaction entirely:
 * the fingerprint is knowable at provisioning time, so it goes into the
 * `setHost` that is already being signed there, and every later invite is just
 * handing out a key that the chain already names. Nothing is stored — the root
 * is sealed under the Ledger's ring, and this is a pure function of it, so the
 * key is recoverable on any host in the ring and readable on none outside it.
 *
 * What this gives up is per-visitor revocation: two visitors to the same Agent
 * hold the same key, and retiring one retires both. That is the honest trade,
 * and the ceiling that actually matters is unchanged — revoking the Agent
 * still ends spending, resolution and shell access together, which is the
 * thing being demonstrated.
 */
export function visitorKeyFor(tenant: string, label: string, create = false): VisitorKey {
  // `create` is for provisioning, which is the one moment a Tenant is supposed
  // to acquire a root. An invite passes false, so a Tenant that never went
  // through the ring produces an error rather than a freshly invented key that
  // the chain has never been told about.
  const root = create ? agentRootFor(tenant) : existingAgentRootFor(tenant);
  const seed = Buffer.from(
    hkdfSync("sha256", root, Buffer.alloc(0), `harness/ssh/${tenant}/${label}`, 32),
  );

  const { privateKey, publicKey } = ed25519FromSeed(seed, `harness visitor ${tenant}`);

  // The same digest sshd computes for `%f`: SHA-256 over the public key blob,
  // which is the base64 middle field of the public key line.
  const blob = Buffer.from(publicKey.split(" ")[1]!, "base64");
  const digest = createHash("sha256").update(blob).digest();

  return {
    privateKey,
    publicKey,
    fingerprint: `SHA256:${digest.toString("base64").replace(/=+$/, "")}`,
    operator: `0x${digest.toString("hex")}` as Hex,
  };
}

/** Where the visitor's key lives once they are set up. */
export function keyFilename(machine: string) {
  return `harness-${machine}.key`;
}


export type Platform = "linux" | "macos" | "windows";

/**
 * The setup, as a script rather than as a paste.
 *
 * The key is 400 bytes and the command that carried it inline was a thousand
 * characters of base64 — unreadable, and therefore pasted unread, which is the
 * habit this product exists to argue against. A short command that fetches a
 * script you can open in a browser first is the honest version of the same
 * thing: the length moved somewhere a person can actually look at it.
 *
 * The script also settles two things a one-liner could not:
 *
 *   where tailscale is    macOS keeps the CLI inside the app bundle and does
 *                         not put it on PATH; Homebrew may or may not link it.
 *                         Guessing wrong is a dead stop, so this looks.
 *   which base64 this is  BSD spells decode -D and GNU spells it -d. Asking
 *                         the tool beats guessing from a user agent.
 *
 * It is run as the visitor, never as root, and reaches for sudo only for the
 * one command that needs it. Piping to `sudo sh` would put the key in root's
 * home, which is not where ssh will look for it.
 *
 * The block pins `HostName` to the address the name resolved to here, and that
 * is worth being explicit about. The ENS name is still what a visitor types
 * and still what the chain answers for — it was resolved through the chain to
 * build this, which is why the address is known at all. But resolving it again
 * on the visitor's machine means a DNS query to the nameserver on the mesh,
 * and a visitor is only granted port 22 on an agent. Port 53 is closed to
 * them, so the lookup does not fail — it hangs, and `ssh <name>` looks broken
 * while never having reached the agent at all.
 *
 * Opening 53 to `tag:visitor` in the tailnet ACL makes live resolution work
 * and is the better answer where somebody can edit the policy. This is the
 * answer that works without one.
 */
export function setupScript(
  key: string,
  authKey: string,
  user: string,
  host: string,
  machine: string,
  address: string | null,
  /** Where the dashboard is, so ssh can fetch the device agent on connect. */
  origin: string,
) {
  const file = keyFilename(machine);
  const blob = Buffer.from(`${key}\n`, "utf8").toString("base64");

  return `#!/bin/sh
# Joins this machine to the mesh and teaches ssh about one agent. Nothing here
# runs as root except the join, and nothing outside ~/.ssh is touched.
set -e

ts=""
for c in tailscale /usr/local/bin/tailscale /opt/homebrew/bin/tailscale "/Applications/Tailscale.app/Contents/MacOS/Tailscale"; do
    if command -v "$c" >/dev/null 2>&1; then ts="$c"; break; fi
    if [ -x "$c" ]; then ts="$c"; break; fi
done

if [ -z "$ts" ]; then
    echo "Tailscale is not installed. Install it, then run this again:" >&2
    if [ "$(uname)" = Darwin ]; then
        echo "  brew install --cask tailscale" >&2
    else
        echo "  curl -fsSL https://tailscale.com/install.sh | sh" >&2
    fi
    exit 1
fi

# macOS runs the daemon as root already; Linux needs to be asked.
echo "joining the mesh..."
if [ "$(uname)" = Darwin ] || [ "$(id -u)" -eq 0 ]; then
    "$ts" up --reset --auth-key=${authKey}
else
    sudo "$ts" up --reset --auth-key=${authKey}
fi

mkdir -p ~/.ssh

# BSD base64 decodes with -D, GNU with -d. Ask, rather than guess.
if echo aGk= | base64 -d >/dev/null 2>&1; then d=-d; else d=-D; fi
echo ${blob} | base64 $d > ~/.ssh/${file}
chmod 600 ~/.ssh/${file}

# Appended, never overwritten, and only once: an ~/.ssh/config is something
# people spend years curating.
# The agent, installed once. Fetching it on every connection would put a
# network call in front of every ssh, and ssh waits for that.
mkdir -p ~/.harness
if curl -fsSL --max-time 20 ${origin}/api/device-agent -o ~/.harness/device-agent; then
    chmod +x ~/.harness/device-agent
else
    echo "could not fetch the device agent; ssh will still work, it just will not hold your Ledger" >&2
fi

touch ~/.ssh/config && chmod 600 ~/.ssh/config

if ! grep -q '^Host ${host}$' ~/.ssh/config 2>/dev/null; then
    printf '\\nHost ${host}\\n${address ? `  HostName ${address}\\n` : ""}  User ${user}\\n  IdentityFile ~/.ssh/${file}\\n  IdentitiesOnly yes\\n' >> ~/.ssh/config
fi

# Hold the Ledger for this agent whenever you connect to it.
#
# Something on the machine the device is plugged into has to speak USB to it,
# and that machine is this one. Rather than making a person remember a second
# command every time, ssh starts it: LocalCommand runs here, on connect, and a
# second copy exits at once because the first still holds the port.
#
# Worth knowing this is here — it fetches and runs a script from the dashboard
# each time you ssh to this host. Remove the two lines from ~/.ssh/config to
# stop it; the agent can always be started by hand.
#
# Added to a block that may already exist, not only to a new one: an invite is
# often somebody's second, and skipping the upgrade would leave this quietly
# not working with nothing to notice.
# Values through the environment, not through quoting. The two lines contain
# quotes, a pipe and an ampersand, and threading those through a template, a
# shell and awk produced something none of the three agreed about.
HARNESS_HOST='${host}' HARNESS_AGENT_URL='${origin}/api/device-agent' python3 - <<'HARNESS_PY'
import os

path = os.path.expanduser("~/.ssh/config")
host = os.environ["HARNESS_HOST"]
url = os.environ["HARNESS_AGENT_URL"]

with open(path) as f:
    lines = f.read().split("\\n")

if not any("harness-device" in l for l in lines):
    out = []
    for line in lines:
        out.append(line)
        if line.strip() == "Host " + host:
            out.append("  PermitLocalCommand yes")
            # Runs the copy installed at setup, and fetches nothing. ssh
            # waits for LocalCommand, so anything in here that can block is a
            # connection that hangs: a curl with no timeout against a
            # dashboard that is momentarily unreachable will sit there, and
            # the person is left staring at an ssh that never opens.
            #
            # Detached besides, because a backgrounded job still holding the
            # session's stdout is enough on its own to make ssh wait.
            out.append(
                '  LocalCommand sh -c "nohup python3 ~/.harness/device-agent'
                + ' --listen </dev/null >>~/.harness/device.log 2>&1 &"'
            )
    with open(path, "w") as f:
        f.write("\\n".join(out))
    os.chmod(path, 0o600)
HARNESS_PY

echo
echo "done. from now on:"
echo "  ssh ${host}"
echo
echo "Your Ledger is held automatically for as long as that session is open."
`;
}

/**
 * The whole setup, short enough to read before running.
 *
 * `curl | sh` is a pattern worth being suspicious of, and the suspicion is
 * usually about provenance: a script from a stranger, over the public
 * internet, run unread. This one is fetched from the machine whose dashboard
 * you are already looking at, over a link that works exactly once, and it is
 * plain text — open it in a browser first and the whole thing is thirty lines.
 */
export function setupCommand(origin: string, token: string) {
  return `curl -fsSL ${origin}/api/mesh/s/${token} | sh`;
}

/** What it looks like afterwards, which is the point. */
export function sshCommand(host: string) {
  return `ssh ${host}`;
}
