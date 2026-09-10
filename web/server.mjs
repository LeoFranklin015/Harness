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

  socket.setNoDelay(true);

  const target = connect(TERMINAL_PORT, "127.0.0.1", () => {
    // Replay the handshake verbatim, with only the path changed: the terminal
    // server expects the token on `/`, and everything else about the request —
    // the Sec-WebSocket-Key above all — has to arrive untouched.
    const path = url.slice(TERMINAL_PATH.length) || "/";
    target.write(`GET ${path.startsWith("/") ? path : `/${path}`} HTTP/1.1\r\n`);
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      target.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
    }
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
