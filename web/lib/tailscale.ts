import { optionalSecret, secret } from "./secrets";

/**
 * Minting a way onto the mesh, one visitor at a time.
 *
 * An agent's machine has no public address — it exists on a private network and
 * on the tailnet, and nothing else. That is deliberate: a machine nobody can
 * route to is a machine nobody can scan. But it means letting somebody in has
 * to be an explicit act, so this is that act.
 *
 * What a visitor gets is the narrowest thing Tailscale can issue:
 *
 *   single-use      the key admits one machine and is spent
 *   ephemeral       the node is removed by Tailscale when it goes offline
 *   pre-authorised  no admin has to approve it, so the invite works unattended
 *   tagged          `tag:visitor`, which the ACL lets reach `tag:agent:22` only
 *   short-lived     minutes, not days
 *
 * The tag is the part that matters. A visitor joins a network where the only
 * thing they can address is port 22 on an agent, and then sshd asks the chain
 * whether their key may log in at all. Being on the mesh is not access.
 *
 * We never hold a long-lived key for this. An OAuth client is exchanged for a
 * short access token per request, and the token is used once and dropped.
 */

const API = "https://api.tailscale.com/api/v2";

/** `-` means "the tailnet this OAuth client belongs to", so we need not name it. */
const TAILNET = optionalSecret("TS_TAILNET") ?? "-";

/** How long an unredeemed invite stays good. Long enough to paste, not to keep. */
const INVITE_TTL_SECONDS = 15 * 60;

export type Invite = {
  /** The auth key. Shown once, never logged, never stored. */
  key: string;
  /** When it stops being redeemable, ISO-8601. */
  expires: string;
  /** Seconds until then, for a countdown that does not need clock agreement. */
  expiresIn: number;
};

/**
 * Exchanges the OAuth client for an access token.
 *
 * Tailscale's OAuth clients are the only credential here that lives on disk,
 * and they cannot join a machine to anything by themselves — they can only mint
 * keys, and only for the tags they own.
 */
async function accessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: secret("TS_OAUTH_CLIENT_ID"),
    client_secret: secret("TS_OAUTH_CLIENT_SECRET"),
  });

  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    // Deliberately not echoing the response: a failed token exchange can carry
    // the client id back, and this string ends up in logs.
    throw new Error(
      res.status === 401
        ? "Tailscale rejected the OAuth client. Check TS_OAUTH_CLIENT_ID and TS_OAUTH_CLIENT_SECRET."
        : `Tailscale's token endpoint answered ${res.status}.`,
    );
  }

  const { access_token } = (await res.json()) as { access_token?: string };
  if (!access_token) throw new Error("Tailscale returned no access token.");
  return access_token;
}

/** True when this host has been given an OAuth client to mint with. */
export function canInvite(): boolean {
  return Boolean(
    optionalSecret("TS_OAUTH_CLIENT_ID") && optionalSecret("TS_OAUTH_CLIENT_SECRET"),
  );
}

/**
 * Mints one invite.
 *
 * `description` is what shows up in the tailnet's key list, so it names the
 * machine the visitor came for. It is the only audit trail Tailscale keeps for
 * us, so it is worth being specific.
 */
export async function mintInvite(forMachine: string): Promise<Invite> {
  const token = await accessToken();

  const res = await fetch(`${API}/tailnet/${encodeURIComponent(TAILNET)}/keys`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      // ASCII only, and no punctuation beyond a dash: Tailscale rejects a
      // description with "invalid characters" and a middle dot is enough to
      // trigger it.
      description: `harness visitor - ${forMachine}`.replace(/[^\x20-\x7E]/g, ""),
      expirySeconds: INVITE_TTL_SECONDS,
      capabilities: {
        devices: {
          create: {
            reusable: false,
            ephemeral: true,
            preauthorized: true,
            tags: ["tag:visitor"],
          },
        },
      },
    }),
  });

  if (!res.ok) {
    // Tailscale's own message is specific and worth passing through — it is the
    // difference between "would not mint a key (400)" and being told which
    // field was wrong. Swallowing it cost an hour once.
    const said = await res
      .json()
      .then((b: { message?: string }) => b?.message)
      .catch(() => undefined);

    if (said && /tag/i.test(said)) {
      throw new Error(
        `Tailscale refused the tag: ${said}. The OAuth client must be created with tag:visitor, and tag:visitor must exist in tagOwners.`,
      );
    }
    throw new Error(said ? `Tailscale refused: ${said}` : `Tailscale would not mint a key (${res.status}).`);
  }

  const { key, expires } = (await res.json()) as { key?: string; expires?: string };
  if (!key) throw new Error("Tailscale returned no key.");

  const at = expires ? new Date(expires) : new Date(Date.now() + INVITE_TTL_SECONDS * 1000);
  return {
    key,
    expires: at.toISOString(),
    expiresIn: Math.max(0, Math.round((at.getTime() - Date.now()) / 1000)),
  };
}

export type Platform = "linux" | "macos" | "windows";

/**
 * What to run, for somebody who has never used this before.
 *
 * Per platform, because the differences are exactly the ones that stop a person
 * cold: macOS installs from the App Store, has no `sudo` for this, and often
 * does not put the CLI on `PATH` at all. Handing a Mac user a Linux command is
 * how an invite becomes a support conversation.
 *
 * Two commands rather than one clever pipeline: an installer is worth reading
 * before it is run, and pasting a `curl | sh` you have not looked at is the
 * habit this whole product argues against.
 */
/**
 * How to get Tailscale, for somebody who has never used it.
 *
 * Separate from the command that uses it, because an installer is worth reading
 * before it is run and pasting a `curl | sh` you have not looked at is the
 * habit this whole product argues against.
 */
export function installCommand(platform: Platform = "linux"): string {
  if (platform === "macos") return "brew install --cask tailscale";
  if (platform === "windows") return "winget install --id tailscale.tailscale";
  return "curl -fsSL https://tailscale.com/install.sh | sh";
}
