// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import {
  createAddSheetOutlineGroupCommand,
  createSetSheetFilterCriteriaCommand,
} from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import {
  createWorkbook,
  createSheetEvaluator,
  getActiveSheet,
  setCellContent,
  setCellSparkline,
  type CellAddress,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  createCellPresentationCache,
  createSheetCanvasScene,
  type SheetCanvasScene,
} from "../../../modules/sheet-grid/canvas/cell-scene";
import { createSheetDisplaySnapshot } from "../../../modules/sheet-grid/canvas/sheet-display-snapshot";

function definition(column: number, patch: Partial<CellSparkline> = {}): CellSparkline {
  return {
    type: "line",
    source: { start: { row: 1, column }, end: { row: 4, column } },
    color: "#2563eb",
    negativeColor: "#ef4444",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
    ...patch,
  };
}

function content(scene: SheetCanvasScene, row: number, column: number) {
  return scene.panes
    .flatMap((pane) => pane.cells)
    .find((cell) => cell.address.row === row && cell.address.column === column)!.content;
}

function fixture() {
  const workbook = createWorkbook({ id: "visibility-scene", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  // Keep filter criteria and source data offscreen so recording reads identifies
  // filter derivation independently from ordinary visible cell presentation.
  ["keep", "drop", "keep", "keep"].forEach((category, index) => {
    const row = index + 1;
    setCellContent(sheet, { row, column: 20 }, { kind: "literal", value: category });
    if (row !== 3) {
      setCellContent(sheet, { row, column: 21 }, { kind: "literal", value: row * 10 });
      setCellContent(sheet, { row, column: 22 }, { kind: "literal", value: row * 100 });
    }
  });
  const filterRange = { start: { row: 0, column: 20 }, end: { row: 4, column: 22 } };
  executeWorkbookCommand(
    session,
    createSetSheetFilterCriteriaCommand(sheet.id, filterRange, [
      { column: 20, allowedValues: [{ kind: "string", value: "keep" }] },
    ]),
  );
  const first = definition(21);
  const second = definition(22, { empty: "zero" });
  setCellSparkline(sheet, { row: 0, column: 0 }, first);
  setCellSparkline(sheet, { row: 10, column: 0 }, second);
  setCellSparkline(sheet, { row: 0, column: 1 }, { ...first, showHidden: true });
  const reads: CellAddress[] = [];
  let revision = 0;
  function makeDisplay() {
    const actual = createSheetEvaluator(sheet);
    const evaluator: SheetEvaluator = {
      ...actual,
      getComputedValue(address) {
        reads.push({ ...address });
        return actual.getComputedValue(address);
      },
    };
    return createSheetDisplaySnapshot({ sheet, evaluator, revision });
  }
  let display = makeDisplay();
  const cache = createCellPresentationCache({ measure: (text) => text.length * 7 });
  const geometry = createSheetGeometry({
    rowCount: 40,
    columnCount: 26,
    rowHeight: 24,
    columnWidth: 72,
  });
  const rows = createRowVisibilityIndex({ rowCount: 40, defaultRowHeight: 24 });
  function render(scrollY = 0) {
    const layout = createSheetViewportLayout({
      geometry,
      rows,
      viewportSize: { width: 288, height: 120 },
      bodyScrollPosition: { x: 0, y: scrollY },
      freeze: { rows: 0, columns: 0 },
      mergeResolver: { getRangeAt: () => undefined },
    });
    return createSheetCanvasScene({
      display,
      layout,
      columnCount: geometry.columnCount,
      cache,
      locale: "en-US",
      dateSystem: "1900",
      fontRevision: 0,
    });
  }
  function refreshDisplay() {
    revision++;
    display = makeDisplay();
  }
  return { workbook, sheet, session, filterRange, reads, render, refreshDisplay, first, second };
}

describe("sparkline visibility in real display scenes", () => {
  test("shares filter derivation across different sparklines, scrolling and returning to an evicted cell", () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    const firstScene = f.render();
    expect(content(firstScene, 0, 0).sparkline?.values).toEqual([10, null, 40]);
    expect(content(firstScene, 0, 1).sparkline?.values).toEqual([10, 20, null, 40]);
    const filterReads = f.reads.filter(({ column }) => column === 20).length;
    expect(filterReads).toBeGreaterThan(0);

    expect(content(f.render(240), 10, 0).sparkline?.values).toEqual([100, 0, 400]);
    expect(content(f.render(), 0, 0).sparkline?.values).toEqual([10, null, 40]);
    expect(f.reads.filter(({ column }) => column === 20)).toHaveLength(filterReads);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("refreshes cached visibility on a new display after filter and outline commands", () => {
    const f = fixture();
    expect(content(f.render(), 0, 0).sparkline?.values).toEqual([10, null, 40]);
    expect(content(f.render(240), 10, 0).sparkline?.values).toEqual([100, 0, 400]);
    executeWorkbookCommand(
      f.session,
      createSetSheetFilterCriteriaCommand(f.sheet.id, f.filterRange, [
        {
          column: 20,
          allowedValues: [
            { kind: "string", value: "keep" },
            { kind: "string", value: "drop" },
          ],
        },
      ]),
    );
    executeWorkbookCommand(
      f.session,
      createAddSheetOutlineGroupCommand(f.sheet.id, {
        id: "collapsed-source-row",
        axis: "row",
        start: 3,
        end: 3,
        collapsed: true,
      }),
    );
    const beforeRefresh = serializeWorkbook(f.workbook);
    f.refreshDisplay();
    const scene = f.render();

    expect(content(scene, 0, 0).sparkline?.values).toEqual([10, 20, 40]);
    expect(content(scene, 0, 1).sparkline?.values).toEqual([10, 20, null, 40]);
    expect(content(f.render(240), 10, 0).sparkline?.values).toEqual([100, 200, 400]);
    expect(serializeWorkbook(f.workbook)).toEqual(beforeRefresh);
  });

  test("refreshes offscreen source edits while preserving the visible sparkline cell object", () => {
    const f = fixture();
    const first = content(f.render(), 0, 0);
    const originalCell = f.sheet.cells.get("0:0");
    setCellContent(f.sheet, { row: 4, column: 21 }, { kind: "literal", value: 99 });
    const beforeRefresh = serializeWorkbook(f.workbook);
    f.refreshDisplay();
    const refreshed = content(f.render(), 0, 0);

    expect(f.sheet.cells.get("0:0")).toBe(originalCell);
    expect(first.sparkline?.values).toEqual([10, null, 40]);
    expect(refreshed.sparkline?.values).toEqual([10, null, 99]);
    expect(refreshed.sparkline?.definition).toEqual(f.first);
    expect(serializeWorkbook(f.workbook)).toEqual(beforeRefresh);
  });
});
