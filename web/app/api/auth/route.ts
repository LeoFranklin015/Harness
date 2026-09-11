import { NextResponse } from "next/server";
import { COOKIE, same, sessionToken } from "@/lib/auth";

/**
 * Trading the passcode for a cookie.
 *
 * The passcode is compared here and never sent back. What the browser keeps
 * is the derived token, in an httpOnly cookie, so a script on the page cannot
 * read it and a copy of the cookie is not a copy of the passcode.
 *
 * Not `secure`: the box serves plain HTTP over the mesh, and a secure cookie
 * would be dropped silently, which looks exactly like a wrong passcode.
 */
export async function POST(request: Request) {
  const passcode = process.env.HARNESS_PASSCODE;
  if (!passcode) return NextResponse.json({ ok: true });

  const { passcode: offered } = (await request.json().catch(() => ({}))) as {
    passcode?: string;
  };
  if (!offered || !same(offered, passcode)) {
    return NextResponse.json({ error: "Wrong passcode." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await sessionToken(passcode), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
