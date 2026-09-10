import { TransportStatusError } from "@ledgerhq/errors";

/**
 * An APDU relay: the device is on the operator's desk, everything else runs
 * here.
 *
 * The Ledger can only be reached by the machine it is plugged into, so the
 * browser holds the USB handle and nothing else. It receives APDUs, hands them
 * to WebHID, and sends the replies back. No key material passes through it, and
 * it cannot forge anything — blocks are signed by the device, so a tampered
 * exchange produces a block that fails verification.
 *
 * HTTP long-polling rather than WebSockets: this is a handful of round trips
 * once per tenant, and it needs no custom server.
 */

type Pending = {
  apdu: string;
  resolve: (responseHex: string) => void;
  reject: (error: Error) => void;
};

type Session = {
  /** Set while the server is waiting for the browser to answer. */
  inFlight: Pending | null;
  /** Resolves the browser's poll as soon as there is something to send. */
  notify: (() => void) | null;
  lastSeen: number;
};

// Single-process state. `next start` is one process; a multi-instance deployment
// would need this in Redis, keyed the same way.
const sessions = new Map<string, Session>();

const SESSION_IDLE_MS = 5 * 60_000;
const EXCHANGE_TIMEOUT_MS = 90_000;

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > SESSION_IDLE_MS) {
      s.inFlight?.reject(new Error("Relay session expired."));
      sessions.delete(id);
    }
  }
}

export function openSession(id: string) {
  sweep();
  sessions.set(id, { inFlight: null, notify: null, lastSeen: Date.now() });
}

export function closeSession(id: string) {
  const s = sessions.get(id);
  s?.inFlight?.reject(new Error("Relay closed."));
  sessions.delete(id);
}

export function hasSession(id: string) {
  return sessions.has(id);
}

/** Called by the browser's poll: returns the next APDU, or null on timeout. */
export async function takeNextApdu(id: string, waitMs: number): Promise<string | null> {
  const s = sessions.get(id);
  if (!s) throw new Error("No such relay session.");
  s.lastSeen = Date.now();

  if (s.inFlight) return s.inFlight.apdu;

  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => {
      s.notify = null;
      resolve(null);
    }, waitMs);
    s.notify = () => {
      clearTimeout(timer);
      s.notify = null;
      resolve(s.inFlight?.apdu ?? null);
    };
  });
}

/** Called by the browser with what the device replied. */
export function deliverResponse(id: string, responseHex: string) {
  const s = sessions.get(id);
  if (!s?.inFlight) throw new Error("No exchange is waiting on this session.");
  s.lastSeen = Date.now();
  const pending = s.inFlight;
  s.inFlight = null;
  pending.resolve(responseHex);
}

/**
 * A transport whose exchange happens over the relay.
 *
 * Duck-typed rather than extending `@ledgerhq/hw-transport`: that package is
 * CJS, and depending on how the bundler resolves its default export, `extends`
 * can yield a class without a working `send`. LKRP's `ApduDevice` only ever
 * calls `send` and `close`, so implementing those directly is both smaller and
 * not sensitive to module interop.
 */
export class RelayTransport {
  constructor(private readonly sessionId: string) {}

  /** Same contract as hw-transport's: throws on an unexpected status word. */
  async send(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data: Buffer = Buffer.alloc(0),
    statusList: number[] = [0x9000]
  ): Promise<Buffer> {
    const response = await this.exchange(
      Buffer.concat([Buffer.from([cla, ins, p1, p2, data.length]), data])
    );
    const sw = response.readUInt16BE(response.length - 2);
    if (!statusList.includes(sw)) throw new TransportStatusError(sw);
    return response;
  }

  async exchange(apdu: Buffer): Promise<Buffer> {
    const s = sessions.get(this.sessionId);
    if (!s) throw new Error("The device connection was lost.");
    if (s.inFlight) throw new Error("An exchange is already in flight.");

    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        s.inFlight = null;
        reject(new Error("The device did not respond. Is it still unlocked?"));
      }, EXCHANGE_TIMEOUT_MS);

      s.inFlight = {
        apdu: apdu.toString("hex"),
        resolve: (hex) => {
          clearTimeout(timer);
          resolve(Buffer.from(hex, "hex"));
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };

      // Wake a waiting poll, if the browser is already asking.
      s.notify?.();
    });
  }

  async close(): Promise<void> {
    // The browser owns the USB handle; nothing to close here.
  }
}
