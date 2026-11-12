// Main-thread client for the engine worker.
//   run(op, args)          -> Promise<{ result, ms }>
//   latest(key, op, args)  -> like run, but while a request with the same key is in flight only the
//                             newest waiting one is kept; superseded calls resolve to null.

let worker;
let nextId = 1;
const pending = new Map();
const lanes = new Map();

function start() {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (event) => {
    const { id, ok, result, error, ms } = event.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve({ result, ms });
    else entry.reject(new Error(error));
  };
  worker.onerror = (event) => {
    for (const entry of pending.values()) entry.reject(new Error(event.message || "engine failed to start"));
    pending.clear();
  };
  return worker;
}

// Buffers inside args are copied, not transferred, so callers keep their images.
export function run(op, args = {}) {
  start();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, args });
  });
}

export function latest(key, op, args) {
  let lane = lanes.get(key);
  if (!lane) lanes.set(key, (lane = { busy: false, waiting: null }));
  return new Promise((resolve, reject) => {
    if (lane.busy) {
      if (lane.waiting) lane.waiting.resolve(null);
      lane.waiting = { op, args, resolve, reject };
      return;
    }
    const go = (job) => {
      lane.busy = true;
      run(job.op, job.args)
        .then(job.resolve, job.reject)
        .finally(() => {
          lane.busy = false;
          const next = lane.waiting;
          lane.waiting = null;
          if (next) go(next);
        });
    };
    go({ op, args, resolve, reject });
  });
}

export const engineVersion = () => run("version").then((r) => r.result);
