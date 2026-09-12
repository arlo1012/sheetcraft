import { vi } from "vitest";
import * as borderPainter from "../../../../../modules/sheet-grid/canvas/border-painter";
import * as cellScene from "../../../../../modules/sheet-grid/canvas/cell-scene";

function getLastResult<T>(results: readonly { type: string; value: unknown }[]): T {
  let result: { type: string; value: unknown } | undefined;
  for (const candidate of results) if (candidate.type === "return") result = candidate;
  if (!result) throw new Error("The Canvas renderer did not create a plan.");
  return result.value as T;
}

/** Records the actual renderer inputs while retaining their production implementations. */
export function recordCanvasRenderPlans() {
  const sceneSpy = vi.spyOn(cellScene, "createSheetCanvasScene");
  const borderPlanSpy = vi.spyOn(borderPainter, "createBorderPaintPlan");
  return {
    get scene() {
      return getLastResult<cellScene.SheetCanvasScene>(sceneSpy.mock.results);
    },
    get borderPlan() {
      return getLastResult<borderPainter.SheetBorderPaintPlan>(borderPlanSpy.mock.results);
    },
    restore() {
      sceneSpy.mockRestore();
      borderPlanSpy.mockRestore();
    },
  };
}
