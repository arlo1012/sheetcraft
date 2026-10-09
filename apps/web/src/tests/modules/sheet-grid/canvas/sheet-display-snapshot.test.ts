import { describe, expect, test, vi } from "vitest";
import { reactive } from "vue";
import { createSheet, createSheetEvaluator, setCellContent } from "@sheetcraft/core/workbook";
import type { SheetTable } from "@sheetcraft/core/workbook";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import { DEFAULT_WORKBOOK_THEME, resolveThemeFontFamily } from "@sheetcraft/core/workbook-theme";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
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
  test("resolves live theme colors and multilingual fonts without rewriting direct formatting", () => {
    const sheet = createSheet("Theme", "theme");
    const theme = {
      ...DEFAULT_WORKBOOK_THEME,
      bodyFont: "Calibri",
      fonts: { name: "Custom", headingEastAsia: "黑体", bodyEastAsia: "宋体" },
    };
    sheet.cells.set("0:0", {
      content: { kind: "literal", value: "Hello 世界" },
      style: { fillColor: "#abcdef", fillColorTheme: { slot: "accent1" }, fontTheme: "major" },
    });
    sheet.cells.set("0:1", {
      content: { kind: "literal", value: "Fixed" },
      style: { fillColor: "#123456", fontFamily: "Arial" },
    });
    const display = createSheetDisplaySnapshot({
      sheet,
      theme,
      evaluator: createSheetEvaluator(sheet),
    });
    expect(display.getCellStyle({ row: 0, column: 0 })).toMatchObject({
      fillColor: theme.accentColors[0],
      fontFamily: resolveThemeFontFamily(theme, "major"),
    });
    expect(display.getCellStyle({ row: 0, column: 1 })).toMatchObject({
      fillColor: "#123456",
      fontFamily: "Arial",
    });
    expect(display.getCellStyle({ row: 1, column: 0 })?.fontFamily).toBe(
      resolveThemeFontFamily(theme, "minor"),
    );
    expect(sheet.cells.get("0:0")?.style?.fillColor).toBe("#abcdef");
  });

  test("layers table styles, direct cell formatting and conditional formatting in order", () => {
    const sheet = createSheet("Table", "table");
    const table: SheetTable = {
      id: "sales",
      name: "Sales",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
      columns: [
        { id: "region", name: "Region" },
        { id: "amount", name: "Amount" },
      ],
      style: createBuiltinTableStyles().find((style) => style.id === "table-light-9")!,
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: null,
    };
    sheet.tables = [table];
    sheet.cells.set("0:0", { content: { kind: "literal", value: "Region" } });
    sheet.cells.set("1:0", {
      content: { kind: "literal", value: 10 },
      style: { fillColor: "#f79646" },
    });
    sheet.cells.set("2:0", {
      content: { kind: "literal", value: 20 },
      style: { fillColor: "#f79646" },
    });
    sheet.conditionalFormats = [
      {
        id: "high",
        ranges: [{ start: { row: 2, column: 0 }, end: { row: 2, column: 0 } }],
        anchor: { row: 2, column: 0 },
        condition: { kind: "cellValue", operator: "greaterThan", value: 15 },
        style: { fillColor: "#c0504d" },
      },
    ];
    const display = createSheetDisplaySnapshot({ sheet, evaluator: createSheetEvaluator(sheet) });
    expect(display.getCellStyle({ row: 0, column: 0 })?.fillColor).toBe("#4f81bd");
    expect(display.getCellStyle({ row: 1, column: 0 })?.fillColor).toBe("#f79646");
    expect(display.getCellStyle({ row: 2, column: 0 })?.fillColor).toBe("#c0504d");
    expect(sheet.cells.get("0:0")?.style).toBeUndefined();
  });
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
