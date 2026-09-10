"use client";

import { useEffect, useState } from "react";

/**
 * One button, and then two commands to paste.
 *
 * An agent's machine has no public address, so letting somebody reach it has to
 * be a deliberate act. This is that act, reduced to a click: the host mints a
 * single-use, ephemeral, minutes-long key tagged `tag:visitor`, and the visitor
 * runs one command on whatever machine they are sitting at.
 *
 * The key is shown once and held only in this component's state. It is never
 * logged and never written down, because it does not need to be — losing one
 * costs nothing and the one you lost expires by itself.
 *
 * Being on the mesh is deliberately not access. The tag can address port 22 on
 * an agent and nothing else, and then sshd asks the chain whether the key being
 * offered may log in at all.
 */

type Invite = {
  key: string;
  expiresIn: number;
  commands: { install: string; join: string };
};

export function MeshInvite({ machine, meshAddress }: { machine: string; meshAddress: string | null }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mesh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ machine }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `could not mint an invite (${res.status})`);
      setInvite(body as Invite);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (available === false) return null;

  if (!invite) {
    return (
      <div className="mt-3">
        <button
          onClick={request}
          disabled={busy || available === null}
          className="rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900/60 disabled:opacity-40"
        >
          {busy ? "Minting…" : "Invite to the mesh"}
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

      {spent ? (
        <button
          onClick={request}
          className="mt-3 rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-700"
        >
          Mint another
        </button>
      ) : (
        <>
          <Command label="1 · install, if you have not" text={invite.commands.install} />
          <Command label="2 · join, single use" text={invite.commands.join} secret />
          {meshAddress && (
            <Command label="3 · then reach the agent" text={`ssh runner@${meshAddress}`} />
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-neutral-600">
            Single use, removed when you disconnect, and scoped to port 22 on
            agents. Whether your key may log in is still the chain&apos;s answer,
            not the tailnet&apos;s.
          </p>
        </>
      )}
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
        <code className={`min-w-0 flex-1 truncate font-mono text-[11px] ${secret ? "text-[#e0a769]" : "text-neutral-300"}`}>
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
