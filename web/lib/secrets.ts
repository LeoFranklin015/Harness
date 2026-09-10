import { existsSync, readFileSync } from "node:fs";

/**
 * Reads one variable out of the secrets file without pulling the file into the
 * process environment.
 *
 * Loading the whole file into `process.env` would put every secret in reach of
 * anything that can print the environment, and into the crash dumps of things
 * that do. Asking for one name at a time keeps the blast radius of a mistake to
 * the value actually needed.
 *
 * The file is gitignored and mode 600; the environment wins if it is set, so a
 * deployment can inject values the normal way.
 */
const FILE = process.env.HARNESS_SECRETS ?? "/home/opc/hackathon/contracts/.env";

export function secret(name: string): string {
  const found = optionalSecret(name);
  if (!found) throw new Error(`${name} is not set, and ${FILE} does not define it`);
  return found;
}

/** The same, for a value the caller can do without. */
export function optionalSecret(name: string): string | null {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  if (!existsSync(FILE)) return null;

  for (const line of readFileSync(FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && m[1] === name) {
      const value = m[2]!.trim().replace(/^["']|["']$/g, "");
      return value || null;
    }
  }
  return null;
}
