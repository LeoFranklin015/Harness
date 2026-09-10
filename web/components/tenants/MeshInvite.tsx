"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";

/**
 * One button, one tap on the Ledger, and then commands to paste.
 *
 * An agent's machine has no public address, so letting somebody reach it has to
 * be a deliberate act. This is that act, and it is deliberately two permissions
 * rather than one:
 *
 *   the mesh   this host mints a single-use, ephemeral, minutes-long key tagged
 *              `tag:visitor`, and can do that on its own
 *   the door   the visitor's fingerprint goes on chain under `setHost`, which
 *              only the Tenant's own device can sign
 *
 * So the server can put a person on the network and still not let them in. The
 * door needs the hardware, every time, and the same key that opened it closes
 * it again on revoke.
 *
 * The visitor never supplies a key of their own. Asking someone to paste their
 * public key is where a person stops — and their everyday key is more than a
 * ten-minute visit is worth. The visit gets a keypair that exists for the
 * visit, handed over once and kept nowhere.
 */

type Invite = {
  key: string;
  expiresIn: number;
  commands: { install: string; join: string };
  operator: Hex;
  fingerprint: string;
  privateKey: string;
  keyFilename: string;
  login: string | null;
  loginByAddress: string | null;
};

export function MeshInvite({
  machine,
  meshAddress,
  ensName,
  onAuthorise,
}: {
  machine: string;
  meshAddress: string | null;
  /** The Agent's full name, which is what a visitor should be typing. */
  ensName: string | null;
  /** Puts the fingerprint on chain. Resolves once the device has signed. */
  onAuthorise: (operator: Hex) => Promise<void>;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [phase, setPhase] = useState<"idle" | "minting" | "signing" | "open">("idle");
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  // Ask once whether this host can invite, so the button is absent rather than
  // broken when there is no OAuth client configured.
  useEffect(() => {
    let live = true;
    fetch("/api/mesh")
      .then((r) => r.json())
      .then((d) => live && setAvailable(Boolean(d.available)))
      .catch(() => live && setAvailable(false));
    return () => {
      live = false;
    };
  }, []);

  // A countdown from the server's own number, so it does not depend on the two
  // clocks agreeing.
  useEffect(() => {
    if (!invite) return;
    setLeft(invite.expiresIn);
    const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [invite]);

  async function request() {
    setPhase("minting");
    setError(null);
    setInvite(null);
    try {
      const res = await fetch("/api/mesh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The visitor's own browser is the only thing that knows what they are
        // sitting at, so it says so rather than the page guessing.
        body: JSON.stringify({
          machine,
          platform: thisPlatform(),
          meshAddress,
          ensName,
          user: "runner",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `could not mint an invite (${res.status})`);

      const minted = body as Invite;
      setInvite(minted);

      // Nothing is granted until this lands. Keeping the key on screen only
      // after the signature means a half-finished invite cannot be mistaken
      // for a working one.
      setPhase("signing");
      await onAuthorise(minted.operator);
      setPhase("open");
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
      setInvite(null);
    }
  }

  if (available === false) return null;

  if (phase === "idle" || !invite) {
    return (
      <div className="mt-3">
        <button
          onClick={request}
          disabled={phase === "minting" || available === null}
          className="rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900/60 disabled:opacity-40"
        >
          {phase === "minting" ? "Minting…" : "Invite to the mesh"}
        </button>
        {error && (
          <p className="mt-2 text-xs leading-relaxed text-amber-400/90" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const spent = left <= 0;

  return (
    <div className="mt-4 rounded-lg border border-neutral-800 bg-black/40 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
          visitor invite
        </p>
        <p className={`font-mono text-[10px] ${spent ? "text-neutral-600" : "text-emerald-500/80"}`}>
          {spent ? "expired" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left`}
        </p>
      </div>

      {phase === "signing" ? (
        <p className="mt-3 text-xs leading-relaxed text-neutral-400">
          Confirm on the Ledger — this is the door opening. The tailnet key is
          minted, but nobody can log in until the fingerprint is on chain.
        </p>
      ) : spent ? (
        <button
          onClick={request}
          className="mt-3 rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-700"
        >
          Mint another
        </button>
      ) : (
        <>
          <Command label="1 · install, if you have not" text={invite.commands.install} />
          <Command label="2 · join the mesh, single use" text={invite.commands.join} secret />
          {invite.login || invite.loginByAddress ? (
            <>
              <DownloadKey invite={invite} />
              <Command label="4 · log in" text={(invite.login ?? invite.loginByAddress)!} />
              {invite.login && invite.loginByAddress && (
                <p className="mt-2 text-[11px] leading-relaxed text-neutral-700">
                  If the name does not resolve, the tailnet has not been pointed
                  at the nameserver yet — use{" "}
                  <code className="font-mono text-neutral-600">{meshAddress}</code>{" "}
                  in place of it.
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-[11px] text-neutral-600">
              This machine has no mesh address yet, so there is nothing to log
              into.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-neutral-600">
            Single use, removed when they disconnect, and scoped to port 22 on
            agents. The key above is the only one the chain now admits, and
            revoking this machine stops it in the same transaction that stops
            spending.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-neutral-700">
            If a browser window opens asking them to log in, the mesh key did
            not take — close it and run step 2 again.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * The key, as a file to save rather than a wall of base64 to paste.
 *
 * A private key pasted through a terminal works, but it teaches the habit this
 * product argues against — trusting eleven lines of base64 on sight because a
 * page told you to. Saving a file and pointing `ssh -i` at it is the way people
 * already handle keys, and it makes the command afterwards one short line.
 *
 * The blob is built in the page and revoked immediately: the key never becomes
 * a URL anybody could fetch twice.
 */
function DownloadKey({ invite }: { invite: Invite }) {
  const [saved, setSaved] = useState(false);

  function save() {
    const url = URL.createObjectURL(
      new Blob([`${invite.privateKey}\n`], { type: "application/x-pem-file" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = invite.keyFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <div className="mt-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-600">
        3 · save the key
      </p>
      <button
        onClick={save}
        className="group mt-1 flex w-full items-center gap-2 rounded border border-neutral-900 bg-neutral-950 px-2.5 py-2 text-left transition hover:border-neutral-800"
      >
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#e0a769]">
          {invite.keyFilename}
        </code>
        <span
          className={`shrink-0 font-mono text-[9px] uppercase tracking-wider ${saved ? "text-emerald-400" : "text-neutral-600 group-hover:text-neutral-400"}`}
        >
          {saved ? "saved" : "download"}
        </span>
      </button>
    </div>
  );
}

function Command({ label, text, secret = false }: { label: string; text: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="mt-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-600">{label}</p>
      <button
        onClick={copy}
        title="Copy"
        className="group mt-1 flex w-full items-center gap-2 rounded border border-neutral-900 bg-neutral-950 px-2.5 py-2 text-left transition hover:border-neutral-800"
      >
        <code
          className={`min-w-0 flex-1 truncate font-mono text-[11px] ${secret ? "text-[#e0a769]" : "text-neutral-300"}`}
        >
          {text}
        </code>
        <span
          className={`shrink-0 font-mono text-[9px] uppercase tracking-wider ${copied ? "text-emerald-400" : "text-neutral-600 group-hover:text-neutral-400"}`}
        >
          {copied ? "copied" : "copy"}
        </span>
      </button>
    </div>
  );
}

/** Which commands to show. A wrong guess here is a stuck visitor, not a typo. */
function thisPlatform(): "linux" | "macos" | "windows" {
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  if (/Windows/i.test(ua)) return "windows";
  return "linux";
}

/** The clipboard API only exists on secure origins, so plain HTTP needs a fallback. */
async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {}
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}
