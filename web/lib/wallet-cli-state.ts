import crypto from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import type { MemberCredentials, Trustchain } from "@ledgerhq/ledger-key-ring-protocol/lib/types";

const require = createRequire(import.meta.url);
const { Entry } = require("@napi-rs/keyring") as {
  Entry: new (service: string, account: string) => { setPassword(v: string): void };
};

/**
 * Writes the state `wallet-cli` expects, so the CLI works on this host with no
 * device attached — `ring encrypt`, `ring decrypt`, `ring keys`.
 *
 * The broker joined the ring through the relay; this just hands the same
 * identity to the CLI. Format, established by reading what `ring init` writes:
 *
 *   session.yaml   single-line flow YAML with the trustchain and a PBKDF2 salt
 *   keychain       "ENC:" + hex(iv‖aes256gcm(privkey)‖tag) + "\n" + pubkey
 *                  wrapped with PBKDF2-SHA256, 600000 rounds
 *
 * On Linux with no Secret Service, keyring-rs selects the kernel keyring, which
 * does not survive a reboot — so the wrapped key is kept on disk too and can be
 * re-injected at startup.
 */

const APP = "ledger-wallet-cli";
const PBKDF2_ROUNDS = 600000;

const stateDir = () =>
  path.join(process.env.XDG_STATE_HOME || path.join(homedir(), ".local", "state"), APP);

const keystorePath = () =>
  process.env.RING_STORE || path.join(homedir(), ".config", "agentauth", "member.enc");

function passphrase(): string {
  if (process.env.WALLET_PASS) return process.env.WALLET_PASS;
  const p = path.join(homedir(), ".config", "agentauth", "pass");
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  throw new Error("No WALLET_PASS and no host passphrase file.");
}

export function writeWalletCliState(trustchain: Trustchain, credentials: MemberCredentials) {
  const dir = stateDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const salt = crypto.randomBytes(16);
  writeFileSync(
    path.join(dir, "session.yaml"),
    `{accounts: [],trustchain: {rootId: ${trustchain.rootId},` +
      `applicationPath: "${trustchain.applicationPath}"},domains: [],` +
      `passwordSalt: ${salt.toString("hex")}}\n`,
    { mode: 0o600 }
  );

  const key = crypto.pbkdf2Sync(passphrase(), salt, PBKDF2_ROUNDS, 32, "sha256");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(credentials.privatekey, "utf8"), c.final()]);
  const value =
    `ENC:${Buffer.concat([iv, ct, c.getAuthTag()]).toString("hex")}\n${credentials.pubkey}`;

  // The keychain account name derives from the state directory path.
  const account =
    "member-private-key-" + crypto.createHash("sha256").update(dir).digest("hex").slice(0, 16);
  new Entry(APP, account).setPassword(value);

  const store = keystorePath();
  mkdirSync(path.dirname(store), { recursive: true, mode: 0o700 });
  writeFileSync(store, value, { mode: 0o600 });

  return { stateDir: dir, account, keystore: store };
}
