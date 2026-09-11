import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, same, sessionToken } from "@/lib/auth";

/**
 * The gate, in front of everything.
 *
 * Runs before any route, so a POST that provisions a machine cannot be
 * reached by finding the endpoint — the page and the API are behind the same
 * check. Three things are deliberately in front of it:
 *
 *   - the login page and the route that answers it, or there is no way in
 *   - `/api/mesh/s/*`, a single-use invite link that carries its own
 *     unguessable token and is opened by someone who was given it, not by
 *     someone signed in here
 *   - `/api/sign`, which the broker calls from the host when an Agent has
 *     run out of ceiling. It cannot hold a cookie, so it presents a bearer
 *     token instead
 *
 * With `HARNESS_PASSCODE` unset the gate is open and says so in the log.
 * Failing closed would brick a checkout on a fresh clone, and the honest
 * failure mode for a thing nobody has configured is to behave as it did
 * before it existed.
 */
export async function proxy(request: NextRequest) {
  const passcode = process.env.HARNESS_PASSCODE;
  if (!passcode) return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname === "/api/auth") return NextResponse.next();
  if (pathname.startsWith("/api/mesh/s/")) return NextResponse.next();

  if (pathname === "/api/sign" && request.method === "POST") {
    const token = process.env.HARNESS_BROKER_TOKEN;
    const offered = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (token && same(offered, token)) return NextResponse.next();
    return NextResponse.json({ error: "not authorised" }, { status: 401 });
  }

  const expected = await sessionToken(passcode);
  if (same(request.cookies.get(COOKIE)?.value ?? "", expected)) return NextResponse.next();

  // An API caller wants a status it can act on; a person wants the form.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "not authorised" }, { status: 401 });
  }
  const to = request.nextUrl.clone();
  to.pathname = "/login";
  to.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(to);
}

export const config = {
  // Everything except Next's own assets and the favicon, which are static and
  // give nothing away.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
