"use client";

import TransportWebHID from "@ledgerhq/hw-transport-webhid";

/**
 * Forwards APDUs between the server and the Ledger.
 *
 * This is the whole browser side of the ring flow. It holds the USB handle
 * because only the machine the device is plugged into can, and it holds nothing
 * else — no keys, no credentials, no protocol logic. It cannot forge anything:
 * blocks are signed by the device, so a tampered exchange produces a block that
 * fails verification.
 */
export async function runRelay(
  relayId: string,
  signal: AbortSignal
): Promise<void> {
  const transport = await TransportWebHID.create();

  try {
    while (!signal.aborted) {
      const res = await fetch(`/api/relay/${relayId}`, { signal });
      if (res.status === 404) return; // server closed the session: flow is done
      if (!res.ok) throw new Error(`relay poll failed (${res.status})`);

      const { apdu } = (await res.json()) as { apdu?: string };
      if (!apdu) continue; // poll window elapsed with nothing to send

      const response = await transport.exchange(Buffer.from(apdu, "hex"));

      await fetch(`/api/relay/${relayId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: response.toString("hex") }),
        signal,
      });
    }
  } catch (e) {
    if (!signal.aborted) throw e;
  } finally {
    await transport.close().catch(() => {});
  }
}
