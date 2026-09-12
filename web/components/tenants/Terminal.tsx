"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A shell on the machine, in the page.
 *
 * The long way round still exists and is still the better one for anybody who
 * will come back: join the mesh, and `ssh runner.<agent>.harness.eth`. This is
 * for the visit that does not justify installing anything — a look at a log, a
 * question about what the agent is doing, a judge who has ninety seconds.
 *
 * What is on the other end is the same shell, as the same user, with the same
 * credentials already opened from the ring. And it answers to the same
 * authority: the terminal server asks the chain before it attaches anything,
 * and keeps asking while you are typing. Revoke the agent and this closes
 * under you, which is the honest demonstration of what revoking means.
 */

export function Terminal({
  tenant,
  agent,
  onClose,
}: {
  tenant: string;
  agent: string;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"opening" | "live" | "closed">("opening");

  useEffect(() => {
    let socket: WebSocket | null = null;
    let term: import("@xterm/xterm").Terminal | null = null;
    let stopped = false;

    (async () => {
      // Imported here rather than at module scope: xterm reaches for `window`
      // as it loads, and this page is server-rendered first.
      const { Terminal: Xterm } = await import("@xterm/xterm");
      await import("@xterm/xterm/css/xterm.css");
      if (stopped || !host.current) return;

      term = new Xterm({
        // Fixed, and matching what the server passes to `podman exec`. podman
        // cannot be told about a resize after the fact, so the panel is sized
        // to the shell rather than the other way round.
        cols: 100,
        rows: 30,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: 12,
        cursorBlink: true,
        theme: {
          background: "#0a0a0a",
          foreground: "#d4d4d4",
          cursor: "#e0a769",
          selectionBackground: "#3a3a3a",
        },
      });
      term.open(host.current);
      term.focus();

      let ticket: { token: string };
      try {
        const res = await fetch("/api/terminal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tenant, agent }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `could not open a terminal (${res.status})`);
        ticket = body;
      } catch (err) {
        setError((err as Error).message);
        setState("closed");
        return;
      }
      if (stopped) return;

      // Same origin as the page, always. The terminal server listens on a port
      // of its own — the App Router cannot carry an upgrade — but the dashboard
      // splices it through, so nothing here needs a second port to be reachable.
      // Naming that port directly worked on the box and nowhere else: behind a
      // tunnel or a reverse proxy the page arrives and the socket does not, and
      // what you see is a panel that opens and immediately closes.
      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(
        `${scheme}://${window.location.host}/api/terminal/ws?token=${ticket.token}`,
      );

      socket.onopen = () => setState("live");
      socket.onmessage = (e) => term?.write(typeof e.data === "string" ? e.data : "");
      socket.onclose = () => setState("closed");
      socket.onerror = () => {
        setError("The terminal server closed the connection.");
        setState("closed");
      };

      term.onData((d) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(d);
      });
    })();

    return () => {
      stopped = true;
      socket?.close();
      term?.dispose();
    };
  }, [tenant, agent]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm duration-200 animate-in fade-in-0"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Terminal on ${agent}.${tenant}.harness.eth`}
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 duration-200 animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-900 px-4 py-2.5">
          <p className="font-mono text-[11px] text-neutral-400">
            {agent}.{tenant}.harness.eth
          </p>
          <div className="flex items-center gap-3">
            <span
              className={`font-mono text-[10px] uppercase tracking-wider ${
                state === "live"
                  ? "text-emerald-500/80"
                  : state === "opening"
                    ? "text-neutral-500"
                    : "text-neutral-600"
              }`}
            >
              {state === "live" ? "connected" : state === "opening" ? "opening…" : "closed"}
            </span>
            <button
              onClick={onClose}
              className="rounded-full px-2 text-sm text-neutral-500 transition hover:text-neutral-200"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="bg-[#0a0a0a] p-3">
          <div ref={host} />
        </div>

        {error ? (
          <p className="border-t border-neutral-900 px-4 py-2.5 text-[11px] text-amber-400/90">
            {error}
          </p>
        ) : (
          <p className="border-t border-neutral-900 px-4 py-2.5 text-[11px] text-neutral-600">
            The same shell ssh would have given you, as the same user. It answers
            to the chain — revoke this machine and this closes while you are in
            it.
          </p>
        )}
      </div>
    </div>
  );
}
