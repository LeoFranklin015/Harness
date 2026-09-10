import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Hex } from "viem";

const run = promisify(execFile);

/**
 * A keypair that exists for one visit.
 *
 * The alternative was asking the visitor to paste their own public key, and
 * that question — "paste which key, from where?" — is where a person stops. It
 * is also the wrong question: their everyday key is the one they use for
 * everything else, and lending it to a machine they are borrowing for ten
 * minutes gives the machine more than the visit is worth.
 *
 * So the visit gets its own key. It is generated here, its fingerprint is put
 * on chain by the Tenant's device, and the private half is handed over once and
 * kept nowhere. Registering the next visitor overwrites the fingerprint, which
 * is what retires this one — there is no list to prune and no key to remember
 * to remove.
 *
 * `ssh-keygen` rather than a library: the OpenSSH private key format is its
 * own container, not PEM, and the tool that defines the format is already on
 * every machine that has a shell. Nothing is installed for this.
 */

export type VisitorKey = {
  /** The OpenSSH private key, whole. Shown once, held nowhere. */
  privateKey: string;
  /** The `ssh-ed25519 AAAA…` line. */
  publicKey: string;
  /** Exactly what `ssh-keygen -l` prints and sshd passes as `%f`. */
  fingerprint: string;
  /** The same digest as raw bytes, which is what `setHost` takes. */
  operator: Hex;
};

export async function mintVisitorKey(forMachine: string): Promise<VisitorKey> {
  // A directory only this process can read, deleted before we return. The key
  // has to touch a filesystem because ssh-keygen writes files, so the window it
  // exists in is made as small as it can be.
  const dir = await mkdtemp(join(tmpdir(), "harness-key-"));
  const path = join(dir, "visitor");

  try {
    await run("ssh-keygen", [
      "-t", "ed25519",
      "-N", "",
      // Ends up in the public key and in `ssh-keygen -l` output. Naming the
      // machine makes a stray key on a visitor's disk self-explanatory.
      "-C", `harness visitor ${forMachine}`,
      "-f", path,
      "-q",
    ]);

    const [privateKey, publicKey, listed] = await Promise.all([
      readFile(path, "utf8"),
      readFile(`${path}.pub`, "utf8"),
      run("ssh-keygen", ["-lf", `${path}.pub`]).then((r) => r.stdout),
    ]);

    // `256 SHA256:<base64> comment (ED25519)` — the middle field is the one
    // sshd compares, so it is taken verbatim rather than recomputed.
    const fingerprint = listed.trim().split(/\s+/)[1] ?? "";
    if (!fingerprint.startsWith("SHA256:")) {
      throw new Error(`ssh-keygen printed an unfamiliar fingerprint: ${listed.trim()}`);
    }

    // Base64 without padding, 43 characters for 32 bytes; Buffer wants the pad.
    const raw = Buffer.from(`${fingerprint.slice(7)}=`, "base64");
    if (raw.length !== 32) throw new Error(`fingerprint decoded to ${raw.length} bytes, not 32`);

    return {
      privateKey: privateKey.trimEnd(),
      publicKey: publicKey.trim(),
      fingerprint,
      operator: `0x${raw.toString("hex")}` as Hex,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** What the downloaded key is called. Names the machine it opens. */
export function keyFilename(machine: string) {
  return `harness-${machine}.key`;
}

/**
 * The login, as one short line, on whatever the visitor is sitting at.
 *
 * The key arrives as a downloaded file rather than as a heredoc in the
 * clipboard. Pasting a private key through a terminal works, but it is eleven
 * lines of base64 that a person is expected to trust on sight, and it looks
 * like exactly the kind of thing nobody should ever paste into a shell — which
 * is a bad habit to teach in a product whose whole argument is that you should
 * know what you are approving.
 *
 * Per platform, because the differences are the ones that stop a person cold.
 * Windows has no `chmod` and spells home differently; its OpenSSH reads the
 * file regardless. Unix `ssh` refuses a key the group can read, so the `chmod`
 * is not decoration — without it the login fails with a permissions error that
 * says nothing about permissions being the visitor's to fix.
 *
 * `host` is the Agent's ENS name once the tailnet resolves `.eth`, and its mesh
 * address otherwise. The name is the better one to show: it is the same string
 * the chain answers for, so it stops resolving when the Agent is revoked.
 *
 * `IdentitiesOnly` because an ssh-agent holding a dozen keys will offer them
 * all, and sshd counts attempts before the right one arrives.
 */
export function loginCommand(
  user: string,
  host: string,
  machine: string,
  platform: "linux" | "macos" | "windows" = "linux",
) {
  const name = keyFilename(machine);
  if (platform === "windows") {
    const file = `$env:USERPROFILE\\Downloads\\${name}`;
    return `ssh -i ${file} -o IdentitiesOnly=yes ${user}@${host}`;
  }
  const file = `~/Downloads/${name}`;
  return `chmod 600 ${file} && ssh -i ${file} -o IdentitiesOnly=yes ${user}@${host}`;
}
