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
  const { pathname } = request.nextUrl;

  // --- who may reach this box at all ------------------------------------
  //
  // The dashboard is served to the world by a front door on a host that has a
  // certificate, and that front door forwards to this port. So the port has to
  // be open to the internet — but only one caller should be using it.
  //
  // The front door holds a shared secret and presents it on every request,
  // including the websocket upgrade. Anything arriving without it is somebody
  // who found the address, and gets nothing. This is not a login: it decides
  // which *origin* may talk to the box, not which person is on the far side.
  //
  // The broker is the one exception. It runs on this machine and calls one
  // route, with a bearer token of its own, so it is let through on that.
  const originToken = process.env.HARNESS_ORIGIN_TOKEN;
  if (originToken) {
    const brokerToken = process.env.HARNESS_BROKER_TOKEN;
    const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const fromBroker =
      pathname === "/api/sign" &&
      request.method === "POST" &&
      !!brokerToken &&
      same(bearer, brokerToken);

    if (!fromBroker && !same(request.headers.get("x-harness-origin") ?? "", originToken)) {
      return new NextResponse("not here", { status: 403 });
    }
  }

  const passcode = process.env.HARNESS_PASSCODE;
  if (!passcode) return NextResponse.next();

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
