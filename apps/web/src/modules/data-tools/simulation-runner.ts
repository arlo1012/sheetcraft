import type { GoalSeekRequest } from "@idea10/core/goal-seek";
import type { PlanningRequest } from "@idea10/core/planning-solver";
import { serializeWorkbook, type WorkbookSnapshot } from "@idea10/core/serialization";
import type { Workbook } from "@idea10/core/workbook";

type Work =
  | { kind: "goalSeek"; workbook: Workbook; request: GoalSeekRequest }
  | { kind: "planning"; workbook: Workbook; request: PlanningRequest };

let nextId = 0;
/** Solves against a serialized snapshot in an isolated worker so the live workbook never blocks. */
export async function runSimulation(work: Work): Promise<unknown> {
  if (typeof Worker === "undefined") throw new Error("simulation worker unavailable");
  const workbookSnapshot: WorkbookSnapshot = serializeWorkbook(work.workbook);
  const worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
  const id = ++nextId;
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("simulation worker timed out")), 5_000);
      worker.addEventListener(
        "message",
        (event: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
          if (event.data.id !== id) return;
          clearTimeout(timeout);
          if (event.data.error) reject(new Error(event.data.error));
          else resolve(event.data.result);
        },
        { once: true },
      );
      worker.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new Error("simulation worker failed"));
        },
        { once: true },
      );
      try {
        worker.postMessage({ id, kind: work.kind, workbookSnapshot, request: work.request });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  } finally {
    worker.terminate();
  }
}
