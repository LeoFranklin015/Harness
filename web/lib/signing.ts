import { randomUUID } from "node:crypto";

/**
 * A queue of transactions waiting for a hardware wallet, wherever it is.
 *
 * The device is on somebody's desk and the shell asking for a signature is
 * usually somewhere else — an ssh session on the box, most often. Rather than
 * the box reaching out to the laptop, which needs a port forward and a laptop
 * willing to listen, the laptop reaches in: it polls this, signs what it
 * finds, and posts the answer back.
 *
 * That direction is the whole point. Outbound-only means it works from any
 * machine that can see the dashboard — no forwarded ports, no ssh flags, no
 * firewall to open — which is the difference between something a person can
 * be handed and something they have to be talked through.
 *
 * Same shape as the APDU relay next door, for the same reasons. Long-polling
 * rather than sockets: a handful of round trips, no custom server.
 *
 * Nothing here is authority. A queued job is a request to sign; the device
 * still shows the bytes and still needs a button pressed, and a job nobody
 * claims simply expires.
 */

export type Job = {
  id: string;
  tenant: string;
  /** Which account must sign, so the holder can refuse a wrong device. */
  expect: string;
  to: string;
  data: string;
  what: string;
  created: number;
};

type Waiting = {
  job: Job;
  /** Resolves when the device has answered, either way. */
  settle: (r: { ok: boolean; result?: unknown; error?: string }) => void;
  claimed: boolean;
};

const queue = new Map<string, Waiting>();

/** Resolves a poller as soon as there is something for its tenant. */
const listeners = new Map<string, Array<() => void>>();

const JOB_TTL_MS = 5 * 60_000;

function sweep() {
  const now = Date.now();
  for (const [id, w] of queue) {
    if (now - w.job.created > JOB_TTL_MS) {
      w.settle({ ok: false, error: "nobody signed this in time" });
      queue.delete(id);
    }
  }
}

function wake(tenant: string) {
  const waiting = listeners.get(tenant) ?? [];
  listeners.set(tenant, []);
  for (const f of waiting) f();
}

/** Puts a transaction in front of whoever holds the device. */
export function submit(
  job: Omit<Job, "id" | "created">,
): { id: string; done: Promise<{ ok: boolean; result?: unknown; error?: string }> } {
  sweep();
  const id = randomUUID();
  const full: Job = { ...job, id, created: Date.now() };

  let settle!: Waiting["settle"];
  const done = new Promise<{ ok: boolean; result?: unknown; error?: string }>((res) => {
    settle = (r) => {
      queue.delete(id);
      res(r);
    };
  });

  queue.set(id, { job: full, settle, claimed: false });
  wake(job.tenant);
  return { id, done };
}

/**
 * The next unclaimed job for a tenant, waited for rather than polled hard.
 *
 * Claimed on handing over, so two device holders do not both sign the same
 * thing. A claim that is never answered expires with the job.
 */
export async function claimNext(tenant: string, waitMs: number): Promise<Job | null> {
  sweep();

  const take = () => {
    for (const w of queue.values()) {
      if (w.job.tenant === tenant && !w.claimed) {
        w.claimed = true;
        return w.job;
      }
    }
    return null;
  };

  const now = take();
  if (now) return now;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, waitMs);
    const waiting = listeners.get(tenant) ?? [];
    waiting.push(() => {
      clearTimeout(timer);
      resolve();
    });
    listeners.set(tenant, waiting);
  });

  return take();
}

/** What the device said. Unknown ids are ignored rather than reported. */
export function answer(id: string, r: { ok: boolean; result?: unknown; error?: string }): boolean {
  const w = queue.get(id);
  if (!w) return false;
  w.settle(r);
  return true;
}

/** What is waiting, for a dashboard that wants to say so. */
export function outstanding(tenant: string): Job[] {
  sweep();
  return [...queue.values()].filter((w) => w.job.tenant === tenant).map((w) => w.job);
}
