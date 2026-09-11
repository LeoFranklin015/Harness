// The dashboard, plus a way through to the terminal on the same origin.
//
// `next start` cannot carry a websocket: the App Router has no hook for an
// HTTP upgrade, so the terminal server has to listen somewhere of its own. That
// left the browser needing two ports, which is fine on the box and wrong
// everywhere else — behind a tunnel, an ssh forward or any reverse proxy, the
// dashboard arrives and the terminal does not, and what a person sees is a
// panel that opens and immediately closes.
//
// So this is Next with one addition: an upgrade on /api/terminal/ws is spliced
// straight through to the terminal server. Raw sockets rather than a websocket
// library, because nothing here needs to understand the protocol — it is two
// pipes and a rewritten request line.
//
// It also means the terminal server can bind loopback only. One port is public,
// and it is the one that was already public.

import { createServer } from "node:http";
import { connect } from "node:net";
import next from "next";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

/** Where the terminal server listens. Loopback: only this process reaches it. */
const TERMINAL_PORT = Number(process.env.HARNESS_TERMINAL_PORT ?? 8023);
const TERMINAL_PATH = "/api/terminal/ws";

/**
 * Where the shell actually is.
 *
 * The terminal server attaches to containers, so it only exists on the box. A
 * deployed instance splices the upgrade to the box instead of to loopback, and
 * the box splices it on to the terminal server — two hops, both raw sockets,
 * neither parsing a frame.
 *
 * When `HARNESS_BOX` is set this instance is the deployed one, and the
 * handshake it forwards keeps its own path so the box recognises it. The box
 * refuses anything without the origin token, so that is added here too.
 */
const BOX = process.env.HARNESS_BOX?.replace(/^https?:\/\//, "").replace(/\/$/, "");
const ORIGIN_TOKEN = process.env.HARNESS_ORIGIN_TOKEN;
const [BOX_HOST, BOX_PORT] = BOX ? BOX.split(":") : [];

const app = next({ dev: false, hostname: HOST, port: PORT });
await app.prepare();
const handle = app.getRequestHandler();

const server = createServer((req, res) => handle(req, res));

server.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "";
  if (!url.startsWith(TERMINAL_PATH)) {
    // Nothing else here speaks websocket, and a silent hang would be worse.
    socket.destroy();
    return;
  }

  // The same gate the rest of the app is behind. An upgrade never reaches
  // Next, so the middleware that checks this cannot see it, and without this
  // the one path that bypasses Next would be the one path left open.
  // Same asymmetry as in proxy.ts: the box demands the token, the deployed
  // instance presents it.
  const originToken = BOX ? undefined : process.env.HARNESS_ORIGIN_TOKEN;
  if (originToken && req.headers["x-harness-origin"] !== originToken) {
    socket.destroy();
    return;
  }

  socket.setNoDelay(true);

  const port = BOX ? Number(BOX_PORT ?? 80) : TERMINAL_PORT;
  const host = BOX ? BOX_HOST : "127.0.0.1";

  const target = connect(port, host, () => {
    // Replay the handshake verbatim, with only the path changed: the terminal
    // server expects the token on `/`, and everything else about the request —
    // the Sec-WebSocket-Key above all — has to arrive untouched. Forwarding to
    // the box is the exception: it is this same server on the far side, so the
    // path it knows is the one that arrived.
    const tail = url.slice(TERMINAL_PATH.length) || "/";
    const path = BOX ? url : tail.startsWith("/") ? tail : `/${tail}`;
    target.write(`GET ${path} HTTP/1.1\r\n`);
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      target.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
    }
    if (BOX && ORIGIN_TOKEN) target.write(`x-harness-origin: ${ORIGIN_TOKEN}\r\n`);
    target.write("\r\n");
    if (head?.length) target.write(head);

    socket.pipe(target);
    target.pipe(socket);
  });

  const drop = () => {
    socket.destroy();
    target.destroy();
  };
  target.on("error", drop);
  socket.on("error", drop);
});

server.listen(PORT, HOST, () => {
  console.log(`  dashboard on ${HOST}:${PORT}`);
  console.log(`  terminal spliced through ${TERMINAL_PATH} -> 127.0.0.1:${TERMINAL_PORT}`);
});
