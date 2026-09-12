import { describe, expect, test, vi } from "vitest";
import { reactive } from "vue";
import { createSheet, createSheetEvaluator, setCellContent } from "@idea10/core/workbook";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import {
  createCellPresentationCache,
  createSheetCanvasScene,
} from "../../../../modules/sheet-grid/canvas/cell-scene";
import {
  createSheetDisplaySnapshot,
  useSheetDisplaySnapshot,
} from "../../../../modules/sheet-grid/canvas/sheet-display-snapshot";

function createLayout(scrollY = 0) {
  const geometry = createSheetGeometry({ rowCount: 120, columnCount: 10 });
  const rows = createRowVisibilityIndex({ rowCount: 120, defaultRowHeight: 24 });
  return createSheetViewportLayout({
    geometry,
    rows,
    viewportSize: { width: 288, height: 120 },
    bodyScrollPosition: { x: 0, y: scrollY },
    freeze: { rows: 0, columns: 0 },
    mergeResolver: { getRangeAt: () => undefined },
  });
}

function paintScene(display: ReturnType<typeof createSheetDisplaySnapshot>, scrollY = 0) {
  return createSheetCanvasScene({
    display,
    layout: createLayout(scrollY),
    columnCount: 10,
    locale: "en-US",
    dateSystem: "1900",
    fontRevision: 0,
    cache: createCellPresentationCache({ measure: (text) => text.length * 7 }),
  });
}

describe("Sheet display snapshot", () => {
  test("evaluates document formulas once and does not rescan them for viewport scenes", () => {
    const sheet = createSheet("Snapshot", "snapshot");
    for (let row = 80; row < 100; row += 1) {
      setCellContent(sheet, { row, column: 0 }, { kind: "formula", formula: { source: "=1" } });
    }
    const evaluator = createSheetEvaluator(sheet);
    const evaluate = vi.spyOn(evaluator, "getComputedValue");
    const spills = vi.spyOn(evaluator, "getSpillProjections");
    const display = createSheetDisplaySnapshot({ sheet, evaluator, revision: 1 });
    expect(evaluate).toHaveBeenCalledTimes(20);
    expect(spills).toHaveBeenCalledTimes(1);

    evaluate.mockClear();
    spills.mockClear();
    paintScene(display);
    paintScene(display, 24);

    expect(spills).not.toHaveBeenCalled();
    for (let row = 80; row < 100; row += 1) {
      expect(evaluate).not.toHaveBeenCalledWith({ row, column: 0 });
    }
  });

  test("refreshes both spill display and reachable extent for a document revision", () => {
    const sheet = createSheet("Snapshot", "snapshot");
    setCellContent(
      sheet,
      { row: 99, column: 0 },
      {
        kind: "formula",
        formula: { source: "=SEQUENCE(2)" },
      },
    );
    const before = createSheetDisplaySnapshot({
      sheet,
      evaluator: createSheetEvaluator(sheet),
      revision: 1,
    });
    expect(before.contentExtent.rowCount).toBe(101);
    expect(before.getSpill({ row: 100, column: 0 })?.value).toBe(2);

    setCellContent(
      sheet,
      { row: 99, column: 0 },
      {
        kind: "formula",
        formula: { source: "=SEQUENCE(4)" },
      },
    );
    const after = createSheetDisplaySnapshot({
      sheet,
      evaluator: createSheetEvaluator(sheet),
      revision: 2,
    });
    expect(after.contentExtent.rowCount).toBe(103);
    expect(after.getSpill({ row: 102, column: 0 })?.value).toBe(4);
  });

  test("tracks sparse document mutations when a Grid fixture has no workbook revision", () => {
    const sheet = reactive(createSheet("Snapshot", "snapshot"));
    const display = useSheetDisplaySnapshot({
      getSheet: () => sheet,
      getEvaluator: () => createSheetEvaluator(sheet),
    });
    expect(display.value.contentExtent.rowCount).toBe(1);

    setCellContent(
      sheet,
      { row: 99, column: 0 },
      {
        kind: "formula",
        formula: { source: "=SEQUENCE(3)" },
      },
    );
    expect(display.value.contentExtent.rowCount).toBe(102);
    expect(display.value.getSpill({ row: 101, column: 0 })?.value).toBe(3);
  });
});
