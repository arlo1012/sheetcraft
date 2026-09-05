import { mkdirSync, writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const reports = join(root, "reports");
mkdirSync(reports, { recursive: true });

const result = await new Promise((resolve, reject) => {
  const worker = new Worker(new URL("../src/probes/node-worker-entry.mjs", import.meta.url));
  let message;
  worker.once("message", (value) => {
    message = value;
  });
  worker.once("error", reject);
  worker.once("exit", (code) => {
    if (code !== 0) reject(new Error(`Node Worker exited with ${code}.`));
    else if (!message) reject(new Error("Node Worker exited without a probe result."));
    else resolve({ runtime: "node-worker", ...message });
  });
});

writeFileSync(join(reports, "node-worker-smoke.json"), `${JSON.stringify(result, null, 2)}\n`);
