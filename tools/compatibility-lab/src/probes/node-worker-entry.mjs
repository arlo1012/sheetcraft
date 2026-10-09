import { parentPort } from "node:worker_threads";
import { runWorkerProbe } from "./worker-probe.mjs";

parentPort?.postMessage(await runWorkerProbe());
