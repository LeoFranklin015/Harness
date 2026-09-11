"use client";

import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";

/**
 * The account, as one button.
 *
 * The header used to spell the whole session out in place — address, model,
 * derivation path, how many signatures a machine costs, and two links buried
 * in the prose. All of it true, none of it needed while looking at machines.
 * A person reads a header once and then wants it out of the way, so it
 * collapses to the one thing worth seeing at a glance and keeps the rest a
 * click behind it.
 */
export function AccountMenu({
  address,
  model,
  path,
  upgraded,
  upgrading,
  onUpgrade,
  onForget,
}: {
  address: Address;
  model: string;
  path: string;
  upgraded: boolean;
  upgrading: boolean;
  onUpgrade: () => void;
  onForget: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A menu that stays open after a click elsewhere reads as part of the page
  // rather than as something dismissible.
  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function copy() {
    await copyText(address);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-full border border-neutral-800 bg-neutral-950/60 py-1.5 pl-3 pr-2.5 text-sm text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900/70 hover:text-neutral-100"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${upgraded ? "bg-emerald-500" : "bg-neutral-600"}`} />
        <span className="font-mono text-[13px]">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <svg
          viewBox="0 0 12 12"
          className={`h-3 w-3 text-neutral-600 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 text-left shadow-2xl shadow-black/60"
        >
          <div className="border-b border-neutral-900 px-3.5 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-600">Authority</p>
            <p className="mt-1 break-all font-mono text-[12px] leading-relaxed text-neutral-300">
              {address}
            </p>
            <p className="mt-1.5 text-[11px] text-neutral-600">
              {model} · {path}
            </p>
          </div>

          <Item onClick={copy}>
            <span>Copy address</span>
            {copied && <span className="text-[11px] text-emerald-400">copied</span>}
          </Item>

          {upgraded ? (
            <div className="flex items-center justify-between px-3.5 py-2.5 text-sm text-neutral-500">
              <span>Batched signing</span>
              <span className="text-[11px] text-emerald-500/80">one per machine</span>
            </div>
          ) : (
            <Item onClick={onUpgrade} disabled={upgrading}>
              <span>{upgrading ? "Upgrading…" : "Batch into one signature"}</span>
              <span className="text-[11px] text-neutral-600">four today</span>
            </Item>
          )}

          <div className="h-px bg-neutral-900" />

          <Item onClick={onForget} tone="danger">
            Switch device
          </Item>
        </div>
      )}
    </div>
  );
}

function Item({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm transition disabled:opacity-50 ${
        tone === "danger"
          ? "text-neutral-400 hover:bg-red-950/30 hover:text-red-300"
          : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

/** The clipboard API is only there on secure origins; plain HTTP needs this. */
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
