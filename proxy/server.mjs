/**
 * The public front door.
 *
 * The dashboard has to run on the machine that holds the machines: it shells
 * out to podman to build a container, to tailscale to put it on the mesh, and
 * to forge to deploy its executor. None of that can move to a platform. But
 * the browser needs HTTPS — WebHID refuses to hand over a Ledger outside a
 * secure context — and the box has no certificate.
 *
 * So this is the smallest thing that resolves that: a process on a host that
 * does have a certificate, forwarding both halves of the connection to the box.
 * Requests go through untouched, and so do upgrades, which is the part that
 * matters. The in-page terminal is a websocket, and a platform that cannot
 * carry an upgrade cannot carry this product.
 *
 * No dependencies. Two Node built-ins and about eighty lines, because a proxy
 * that needs a package is a proxy you have to keep.
 */

import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";

const ORIGIN = process.env.HARNESS_ORIGIN;
if (!ORIGIN) throw new Error("set HARNESS_ORIGIN, e.g. 141.148.209.77:3000");

const [HOST, PORT_STR] = ORIGIN.replace(/^https?:\/\//, "").split(":");
const PORT = Number(PORT_STR ?? 80);
const LISTEN = Number(process.env.PORT ?? 8080);

/**
 * The secret that says this request came through the front door.
 *
 * The box's port has to be open to the internet for this to reach it, so the
 * box refuses anything that does not carry this. Set the same value here and
 * in the box's environment. Unset, nothing is added and the box lets everything
 * through — which is right for running the two on one machine.
 */
const TOKEN = process.env.HARNESS_ORIGIN_TOKEN;
const stamp = (headers) => (TOKEN ? { ...headers, "x-harness-origin": TOKEN } : headers);

/**
 * The Host header is forwarded as it arrived, not rewritten to the box.
 *
 * The dashboard builds mesh invite links out of it, so rewriting would mint
 * invites pointing at an address nobody outside can reach. The cost is that
 * the box sees a hostname that is not its own, which it has no opinion about.
 */
const server = createServer((req, res) => {
  const upstream = httpRequest(
    { host: HOST, port: PORT, path: req.url, method: req.method, headers: stamp(req.headers) },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`the machine is not answering: ${err.message}\n`);
  });

  req.pipe(upstream);
});

/**
 * The upgrade, spliced at the socket.
 *
 * Nothing here parses the websocket protocol. The handshake is replayed to the
 * box byte for byte and the two sockets are joined, so whatever the terminal
 * server and the browser agree on is between them.
 */
server.on("upgrade", (req, socket, head) => {
  const upstream = connect(PORT, HOST, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    // The upgrade is replayed by hand, so the stamp has to be added by hand.
    if (TOKEN) lines.push(`x-harness-origin: ${TOKEN}`);
    upstream.write(lines.join("\r\n") + "\r\n\r\n");
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  const drop = () => {
    upstream.destroy();
    socket.destroy();
  };
  upstream.on("error", drop);
  socket.on("error", drop);
});

// Long-lived by design: an idle shell is still a shell, and the default would
// close one somebody is looking at.
server.headersTimeout = 0;
server.requestTimeout = 0;
server.keepAliveTimeout = 76_000;

server.listen(LISTEN, () => {
  console.log(`front door on :${LISTEN} -> ${HOST}:${PORT}`);
});
