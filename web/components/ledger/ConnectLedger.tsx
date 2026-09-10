"use client";

import { useEffect, useState } from "react";
import { connect, isSupported, RejectedOnDevice, type Device } from "@/lib/ledger";

import { Hero } from "@/components/hero/Hero";

type State =
  | { phase: "idle" }
  | { phase: "connecting"; step: string }
  | { phase: "failed"; message: string; declined: boolean };

export function ConnectLedger({ onConnected }: { onConnected: (d: Device) => void }) {
  const [state, setState] = useState<State>({ phase: "idle" });

  // WebHID exists only in the browser, so asking during render makes the server
  // and the client disagree and React throws out the tree. Asked once after
  // mount; until then the page assumes support, because the optimistic guess is
  // the one that does not flash a warning at everybody.
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(isSupported()), []);

  async function handleConnect() {
    setState({ phase: "connecting", step: "Waking the device" });
    try {
      const device = await connect((step) => setState({ phase: "connecting", step }));
      onConnected(device);
    } catch (err) {
      setState({
        phase: "failed",
        message: (err as Error).message,
        // Declining is not a failure and should not be dressed as one.
        declined: err instanceof RejectedOnDevice,
      });
    }
  }

  return (
    <Hero
      onConnect={handleConnect}
      connecting={state.phase === "connecting"}
      supported={supported}
      status={<StatusLine state={state} supported={supported} />}
    />
  );
}

/**
 * What the device is waiting for.
 *
 * Someone connecting a Ledger is looking at the device, not the screen, so the
 * page has to say which of the two is waiting on them — "Connecting…" alone
 * leaves a person watching a spinner while the device asks for a PIN.
 */
function StatusLine({ state, supported }: { state: State; supported: boolean }) {
  if (state.phase === "connecting") {
    return (
      <p className="flex items-center gap-2 text-sm text-neutral-400" role="status" aria-live="polite">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
        {state.step}
      </p>
    );
  }

  if (state.phase === "failed") {
    return (
      <p
        className={`text-sm ${state.declined ? "text-amber-400/90" : "text-red-400/90"}`}
        role="status"
        aria-live="polite"
      >
        {state.message}
      </p>
    );
  }

  if (!supported) {
    return (
      <p className="text-sm text-amber-400/90">
        This browser has no WebHID. Use Chrome, Edge or Brave.
      </p>
    );
  }

  return <p className="text-sm text-neutral-600">Unlock your Ledger and open the Ethereum app.</p>;
}
