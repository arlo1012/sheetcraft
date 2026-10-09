import { previewDataTable } from "@sheetcraft/core";
import { solveGoalSeek } from "@sheetcraft/core/goal-seek";
import { solvePlanning } from "@sheetcraft/core/planning-solver";
import { deserializeWorkbook } from "@sheetcraft/core/serialization";

type Request =
  | {
      id: number;
      kind: "dataTable";
      workbookSnapshot: Parameters<typeof deserializeWorkbook>[0];
      request: Parameters<typeof previewDataTable>[1];
    }
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
      data.kind === "dataTable"
        ? previewDataTable(workbook, data.request)
        : data.kind === "goalSeek"
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
