import { readFileSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The device agent, served so nobody has to fetch a repo.
 *
 * Whoever holds the Ledger is not necessarily the person who set this up —
 * a colleague, a judge, someone with ten minutes. Telling them to scp a file
 * out of a checkout is a step that loses people, and it is unnecessary: the
 * script is a hundred lines of standard-library Python and the dashboard is
 * already in front of them.
 *
 * It is not secret and grants nothing. It signs only what this dashboard
 * hands it, shows the bytes first, and cannot do anything the person holding
 * the device does not confirm on the device.
 */

const AGENT = process.env.HARNESS_TOOLS
  ? path.join(process.env.HARNESS_TOOLS, "harness-device-agent")
  : "/home/opc/hackathon/tools/harness-device-agent";

export function GET() {
  try {
    return new Response(readFileSync(AGENT, "utf8"), {
      headers: {
        // text/plain so it is readable in a browser before it is run. Reading
        // it first is the correct instinct and should not be discouraged by
        // making the browser download it instead.
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("the device agent is not on this host\n", { status: 404 });
  }
}
