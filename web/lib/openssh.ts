import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

/**
 * Writing an ed25519 keypair in OpenSSH's own format, from a seed.
 *
 * `ssh-keygen` is the obvious way to make a key and it is what this replaced,
 * but it can only invent one: there is no way to hand it 32 bytes and ask for
 * the key those bytes imply. That matters here because the visitor key should
 * be *derived* — from the Tenant's sealed root, like every other key in this
 * system — rather than generated and then kept somewhere. A derived key needs
 * storing nowhere, is the same on any host that can open the ring, and dies
 * with the ring rather than with a file somebody forgot to delete.
 *
 * So the container has to be written by hand. It is not PEM despite the
 * BEGIN/END lines around it; inside is OpenSSH's own length-prefixed encoding:
 *
 *   "openssh-key-v1\0"
 *   string  cipher      "none"
 *   string  kdf         "none"
 *   string  kdfoptions  ""
 *   uint32  keys        1
 *   string  publickey   (string "ssh-ed25519", string pub)
 *   string  private     (uint32 check, uint32 check,
 *                        string "ssh-ed25519", string pub, string seed||pub,
 *                        string comment, padding 1,2,3…)
 *
 * The two check integers must match: it is how ssh tells a wrong passphrase
 * from a right one, and with no passphrase it is just a self-consistency
 * check. The private "string" is 64 bytes because ed25519's signing key is the
 * seed with the public key appended — the same convention NaCl uses.
 */

const MAGIC = Buffer.from("openssh-key-v1\0", "binary");
const TYPE = "ssh-ed25519";

function str(data: Buffer | string): Buffer {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  return Buffer.concat([len, body]);
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

/**
 * The raw 32 public bytes.
 *
 * Node will not hand over ed25519 key material directly, but it will export
 * SPKI, whose last 32 bytes are exactly the public key — the DER prefix for
 * this curve is a fixed 12 bytes.
 */
function publicBytes(key: KeyObject): Buffer {
  return key.export({ format: "der", type: "spki" }).subarray(-32);
}

/** The key those 32 bytes imply, as a Node key object. */
function fromSeed(seed: Buffer): KeyObject {
  if (seed.length !== 32) throw new Error(`an ed25519 seed is 32 bytes, not ${seed.length}`);
  // PKCS#8 for ed25519 is a fixed 16-byte preamble followed by the seed
  // wrapped in an OCTET STRING. Spelling it out beats a dependency.
  const der = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed,
  ]);
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

export type Ed25519 = {
  /** The OpenSSH private key, whole, with its BEGIN/END lines. */
  privateKey: string;
  /** The `ssh-ed25519 AAAA… comment` line. */
  publicKey: string;
};

/** The keypair implied by `seed`, written the way OpenSSH writes them. */
export function ed25519FromSeed(seed: Buffer, comment = ""): Ed25519 {
  const priv = fromSeed(seed);
  const pub = publicBytes(createPublicKey(priv));

  const blob = Buffer.concat([str(TYPE), str(pub)]);

  // Any value, as long as the two agree. Derived from the seed so that the
  // whole file is a function of the seed and nothing else — two runs produce
  // byte-identical output, which is the point of deriving at all.
  const check = seed.subarray(0, 4);

  let inner = Buffer.concat([
    check,
    check,
    str(TYPE),
    str(pub),
    str(Buffer.concat([seed, pub])),
    str(comment),
  ]);

  // Padded to the cipher's block size — 8 here, since there is no cipher —
  // with 1, 2, 3… so the length is unambiguous.
  for (let i = 1; inner.length % 8 !== 0; i++) {
    inner = Buffer.concat([inner, Buffer.from([i])]);
  }

  const body = Buffer.concat([
    MAGIC,
    str("none"),
    str("none"),
    str(""),
    u32(1),
    str(blob),
    str(inner),
  ]);

  const wrapped = body.toString("base64").replace(/(.{70})/g, "$1\n");
  return {
    privateKey: `-----BEGIN OPENSSH PRIVATE KEY-----\n${wrapped}\n-----END OPENSSH PRIVATE KEY-----`,
    publicKey: `${TYPE} ${blob.toString("base64")}${comment ? ` ${comment}` : ""}`,
  };
}
