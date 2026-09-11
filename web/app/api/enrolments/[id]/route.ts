import { NextResponse } from "next/server";
import { getEnrolment, completeEnrolment } from "@/lib/enrolment";
import { BOX, forwardToBox } from "@/lib/box";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** The dashboard polls this while the Tenant runs the helper. */
export async function GET(request: Request, { params }: Params) {
  // Shares state with the box; the whole exchange happens there.
  if (BOX) return forwardToBox(request);

  const { id } = await params;
  const record = getEnrolment(id);
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(record);
}

/** The helper posts here once `ring init` and `addMember` have both run. */
export async function POST(request: Request, { params }: Params) {
  // Shares state with the box; the whole exchange happens there.
  if (BOX) return forwardToBox(request);

  const { id } = await params;
  if (!getEnrolment(id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { rootId?: unknown; applicationPath?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const { rootId, applicationPath } = body;
  if (typeof rootId !== "string" || !/^[0-9a-f]{64,66}$/.test(rootId)) {
    return NextResponse.json({ error: "rootId must be hex" }, { status: 400 });
  }
  if (typeof applicationPath !== "string" || !/^m(\/\d+'?)+$/.test(applicationPath)) {
    return NextResponse.json({ error: "applicationPath must be a derivation path" }, { status: 400 });
  }

  return NextResponse.json(completeEnrolment(id, rootId, applicationPath));
}
