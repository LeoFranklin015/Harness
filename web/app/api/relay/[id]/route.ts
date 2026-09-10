import { NextResponse } from "next/server";
import { takeNextApdu, deliverResponse, hasSession } from "@/lib/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const POLL_WAIT_MS = 25_000;

/**
 * The browser asks for the next APDU. Held open until there is one, or until
 * the poll window closes and the browser asks again.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!hasSession(id)) return NextResponse.json({ error: "no such session" }, { status: 404 });

  const apdu = await takeNextApdu(id, POLL_WAIT_MS);
  return NextResponse.json(apdu ? { apdu } : {});
}

/** The browser returns what the device replied. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!hasSession(id)) return NextResponse.json({ error: "no such session" }, { status: 404 });

  let body: { response?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const { response } = body;
  if (typeof response !== "string" || !/^[0-9a-f]*$/i.test(response)) {
    return NextResponse.json({ error: "response must be hex" }, { status: 400 });
  }

  try {
    deliverResponse(id, response);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not deliver" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
