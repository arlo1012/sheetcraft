import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const reports = join(root, "reports");
mkdirSync(reports, { recursive: true });

const result = await new Promise((resolve, reject) => {
  const worker = new Worker(new URL("../src/probes/node-worker-entry.mjs", import.meta.url));
  const timeout = setTimeout(() => {
    void worker.terminate();
    reject(new Error("Node Worker probe timed out after 30 seconds."));
  }, 30_000);
  let message;
  worker.once("message", (value) => {
    message = value;
  });
  worker.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  worker.once("exit", (code) => {
    clearTimeout(timeout);
    if (code !== 0) reject(new Error(`Node Worker exited with ${code}.`));
    else if (!message) reject(new Error("Node Worker exited without a probe result."));
    else resolve({ runtime: "node-worker", ...message });
  });
});

assert.equal(result.formulaSum, 6);
assert.equal(result.restoredValue, 6);
assert.ok(result.formulaFunctionCount > 0);
assert.ok(result.xlsxBytes > 0);
assert.equal(result.restoredDateSystem, "1904");
assert.equal(result.cacheDiscarded, true);
assert.deepEqual(result.restoredFormula, { kind: "formula", formula: { source: "=SUM(1,2,3)" } });
writeFileSync(join(reports, "node-worker-smoke.json"), `${JSON.stringify(result, null, 2)}\n`);
