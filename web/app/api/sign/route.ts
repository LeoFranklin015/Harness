import { NextResponse } from "next/server";
import { answer, submit } from "@/lib/signing";
import { BOX, forwardToBox } from "@/lib/box";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Ask for a signature, or give one.
 *
 * POST puts a transaction in front of whoever is holding the device and waits
 * for them. PUT is that person answering. Neither is authority: the device
 * shows the bytes and a button still has to be pressed.
 */

const label = /^[a-z0-9][a-z0-9-]*$/;

export async function POST(request: Request) {
  // Shares state with the box; the whole exchange happens there.
  if (BOX) return forwardToBox(request);

  const body = (await request.json().catch(() => ({}))) as Record<string, string>;
  const tenant = body.tenant ?? "";
  if (!label.test(tenant)) return NextResponse.json({ error: "which machine?" }, { status: 400 });
  if (!/^0x[0-9a-fA-F]{40}$/.test(body.to ?? "")) {
    return NextResponse.json({ error: "bad destination" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]*$/.test(body.data ?? "")) {
    return NextResponse.json({ error: "bad calldata" }, { status: 400 });
  }

  const { id, done } = submit({
    tenant,
    expect: body.expect ?? "",
    to: body.to!,
    data: body.data!,
    what: (body.what ?? "a transaction").slice(0, 200),
  });

  // Held open until the device answers. The caller is a person waiting at a
  // prompt, so a response that arrives when it arrives beats one that says
  // "check back later".
  const settled = await done;
  return NextResponse.json(
    settled.ok ? { id, result: settled.result } : { id, error: settled.error ?? "refused" },
    { status: settled.ok ? 200 : 502 },
  );
}

export async function PUT(request: Request) {
  // Shares state with the box; the whole exchange happens there.
  if (BOX) return forwardToBox(request);

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    ok?: boolean;
    result?: unknown;
    error?: string;
  };
  if (!body.id) return NextResponse.json({ error: "which job?" }, { status: 400 });

  const known = answer(body.id, {
    ok: Boolean(body.ok),
    result: body.result,
    error: body.error,
  });
  return NextResponse.json({ known });
}
