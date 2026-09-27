import { solveGoalSeek } from "@idea10/core/goal-seek";
import { solvePlanning } from "@idea10/core/planning-solver";
import { deserializeWorkbook } from "@idea10/core/serialization";

type Request =
  | {
      id: number;
      kind: "goalSeek";
      workbookSnapshot: Parameters<typeof deserializeWorkbook>[0];
      request: Parameters<typeof solveGoalSeek>[1];
    }
  | {
      id: number;
      kind: "planning";
      workbookSnapshot: Parameters<typeof deserializeWorkbook>[0];
      request: Parameters<typeof solvePlanning>[1];
    };

self.addEventListener("message", ({ data }: MessageEvent<Request>) => {
  try {
    const workbook = deserializeWorkbook(data.workbookSnapshot);
    const result =
      data.kind === "goalSeek"
        ? solveGoalSeek(workbook, data.request)
        : solvePlanning(workbook, data.request);
    self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
