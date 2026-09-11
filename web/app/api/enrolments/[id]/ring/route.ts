import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getEnrolment, completeEnrolment, brokerCredentials } from "@/lib/enrolment";
import { openSession, closeSession } from "@/lib/relay";
import { joinRing } from "@/lib/ring-server";
import { writeWalletCliState } from "@/lib/wallet-cli-state";
import { BOX, forwardToBox } from "@/lib/box";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Runs the whole ring flow here, reaching the device through a relay the
 * browser holds open. The broker's private key never leaves this host, and the
 * browser never sees a key at all.
 *
 * Returns a relay session id first so the browser can start polling, then does
 * the work — the two are the same request because the SDK call and the relay
 * have to overlap.
 */
export async function POST(request: Request, { params }: Params) {
  // Only the box can do this; everywhere else forwards to it.
  if (BOX) return forwardToBox(request);

  const { id } = await params;
  const enrolment = getEnrolment(id);
  if (!enrolment) return NextResponse.json({ error: "not found" }, { status: 404 });

  const relayId = randomBytes(8).toString("hex");
  openSession(relayId);

  // The browser needs the relay id before the exchange starts, so hand it over
  // first and stream the outcome as the body once the flow completes.
  const credentials = brokerCredentials(enrolment.tenant);
  const work = joinRing(relayId, `${enrolment.tenant}-broker`, credentials)
    .then(({ trustchain, outcome, members }) => {
      completeEnrolment(id, trustchain.rootId, trustchain.applicationPath);
      // Hand the same identity to wallet-cli so the CLI works on this host too.
      let cli: string | null = null;
      try {
        cli = writeWalletCliState(trustchain, credentials).stateDir;
      } catch (e) {
        // The ring is joined either way; the CLI is a convenience on top.
        console.warn("could not provision wallet-cli state:", e);
      }
      return { ok: true as const, outcome, members, cli, ...getEnrolment(id) };
    })
    .catch((e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    }))
    .finally(() => closeSession(relayId));

  const body = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      // First line: the relay id, so the browser can begin forwarding.
      controller.enqueue(enc.encode(JSON.stringify({ relayId }) + "\n"));
      const result = await work;
      controller.enqueue(enc.encode(JSON.stringify(result) + "\n"));
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
