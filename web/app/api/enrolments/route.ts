import { NextResponse } from "next/server";
import { createEnrolment } from "@/lib/enrolment";
import { BOX, forwardToBox } from "@/lib/box";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Shares state with the box; the whole exchange happens there.
  if (BOX) return forwardToBox(request);

  let tenant = "acme";
  try {
    const body = await request.json();
    if (typeof body?.tenant === "string" && body.tenant.trim()) tenant = body.tenant.trim();
  } catch {
    // no body is fine — the dashboard's first click sends none
  }

  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(tenant)) {
    return NextResponse.json(
      { error: "tenant must be a DNS-safe label — it becomes an ENS name" },
      { status: 400 }
    );
  }

  // Return the whole record: a Tenant that has already enrolled comes back
  // with its ring, so the dashboard can show it rather than asking again.
  return NextResponse.json(createEnrolment(tenant), { status: 201 });
}
