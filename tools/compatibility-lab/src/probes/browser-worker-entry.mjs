import { runWorkerProbe } from "./worker-probe.mjs";

globalThis.onmessage = async () => {
  try {
    globalThis.postMessage({ runtime: "browser-worker", ...(await runWorkerProbe()) });
  } catch (error) {
    globalThis.postMessage({ error: String(error) });
  }
};
