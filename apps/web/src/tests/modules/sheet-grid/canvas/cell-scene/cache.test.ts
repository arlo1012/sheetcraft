import { describe, expect, test, vi } from "vitest";
import { MergedCellRangeResolver } from "@idea10/core";
import type { ConditionalFormatCondition } from "@idea10/core/conditional-formatting";
import { createBuiltinTableStyles } from "@idea10/core/table-styles";
import {
  createSheet,
  createSheetEvaluator,
  setCellContent,
  setCellNote,
  setCellStyle,
  setCellValue,
} from "@idea10/core/workbook";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import {
  createCellPresentationCache,
  createSheetCanvasScene,
  type SheetCanvasScene,
} from "../../../../../modules/sheet-grid/canvas/cell-scene";
import { createSheetDisplaySnapshot } from "../../../../../modules/sheet-grid/canvas/sheet-display-snapshot";

function cell(scene: SheetCanvasScene, row: number, column: number) {
  return scene.panes
    .flatMap((pane) => pane.cells)
    .find((entry) => entry.address.row === row && entry.address.column === column)!;
}

function fixture() {
  const sheet = createSheet("Canvas", "canvas-cache");
  const measure = vi.fn((text: string) => text.length * 7);
  const cache = createCellPresentationCache({ measure });
  const geometry = createSheetGeometry({ rowCount: 100, columnCount: 20 });
  const rows = createRowVisibilityIndex({ rowCount: 100, defaultRowHeight: 24 });
  let revision = 0;
  let display = createSheetDisplaySnapshot({
    sheet,
    evaluator: createSheetEvaluator(sheet),
    revision,
  });
  function refreshDisplay() {
    revision += 1;
    display = createSheetDisplaySnapshot({
      sheet,
      evaluator: createSheetEvaluator(sheet),
      revision,
    });
  }
  function render(options: { y?: number; locale?: string; fontRevision?: number } = {}) {
    const resolver = new MergedCellRangeResolver(sheet.mergedCells);
    const layout = createSheetViewportLayout({
      geometry,
      rows,
      viewportSize: { width: 288, height: 120 },
      bodyScrollPosition: { x: 0, y: options.y ?? 0 },
      freeze: sheet.freezePanes,
      mergeResolver: { getRangeAt: (address) => resolver.getRangeAtAddress(address) },
    });
    return createSheetCanvasScene({
      display,
      layout,
      columnCount: geometry.columnCount,
      locale: options.locale ?? "en-US",
      dateSystem: "1900",
      fontRevision: options.fontRevision ?? 0,
      cache,
    });
  }
  return { sheet, measure, render, refreshDisplay };
}

describe("Canvas cell presentation cache", () => {
  test("exposes notes for normal and merged-cell corner indicators", () => {
    const { sheet, render, refreshDisplay } = fixture();
    setCellNote(sheet, { row: 0, column: 0 }, { text: "normal" });
    sheet.mergedCells = [{ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } }];
    setCellNote(sheet, { row: 1, column: 1 }, { text: "merged" });
    refreshDisplay();

    expect(cell(render(), 0, 0).hasNote).toBe(true);
    expect(cell(render(), 1, 1).hasNote).toBe(true);
  });

  test("refreshes existing header text when a table style is applied, changed, and cleared", () => {
    const { sheet, render, refreshDisplay } = fixture();
    setCellValue(sheet, { row: 0, column: 0 }, "Amount");
    setCellValue(sheet, { row: 1, column: 0 }, 12);
    refreshDisplay();
    expect(cell(render(), 0, 0).content.style?.textColor).toBeUndefined();
    const header = sheet.cells.get("0:0");
    const style = createBuiltinTableStyles().find((entry) => entry.id === "table-medium-1")!;
    sheet.tables = [
      {
        id: "table",
        name: "Table1",
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        columns: [{ id: "amount", name: "Amount" }],
        style,
        headerRow: true,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: true,
        filter: null,
      },
    ];
    refreshDisplay();
    expect(cell(render(), 0, 0).content.style?.textColor).toBe("#ffffff");
    expect(cell(render(), 0, 0).content.textLayout?.font.weight).toBe(700);
    sheet.tables[0]!.style = {
      ...style,
      elements: { headerRow: { style: { textColor: "#ff0000", bold: true } } },
    };
    refreshDisplay();
    expect(cell(render(), 0, 0).content.style?.textColor).toBe("#ff0000");
    sheet.tables[0]!.style = { ...style, elements: {} };
    refreshDisplay();
    expect(cell(render(), 0, 0).content.style?.textColor).toBeUndefined();
    expect(cell(render(), 0, 0).content.textLayout?.font.weight).toBe(400);
    expect(sheet.cells.get("0:0")).toBe(header);
  });

  test("updates duplicate highlights after offscreen edits and restores base styles on clear", () => {
    const { sheet, render, refreshDisplay } = fixture();
    setCellValue(sheet, { row: 0, column: 0 }, "Alpha");
    setCellValue(sheet, { row: 90, column: 0 }, "alpha");
    setCellStyle(sheet, { row: 0, column: 0 }, { fillColor: "#0000ff", textColor: "#000000" });
    sheet.duplicateRules = [
      {
        id: "highlight",
        kind: "highlight",
        range: {
          start: { row: 0, column: 0 },
          end: { row: 99, column: 0 },
        },
        fillColor: "#ffc7ce",
        textColor: "#9c0006",
      },
    ];
    refreshDisplay();
    expect(cell(render(), 0, 0).style?.fillColor).toBe("#ffc7ce");
    expect(cell(render(), 0, 0).content.style?.textColor).toBe("#9c0006");
    expect(sheet.cells.get("0:0")?.style?.fillColor).toBe("#0000ff");
    setCellValue(sheet, { row: 90, column: 0 }, "Beta");
    refreshDisplay();
    expect(cell(render(), 0, 0).style?.fillColor).toBe("#0000ff");
    expect(cell(render(), 0, 0).content.style?.textColor).toBe("#000000");
    setCellValue(sheet, { row: 90, column: 0 }, "Alpha");
    refreshDisplay();
    expect(cell(render(), 0, 0).style?.fillColor).toBe("#ffc7ce");
    sheet.duplicateRules = [];
    refreshDisplay();
    expect(cell(render(), 0, 0).style?.fillColor).toBe("#0000ff");
  });

  test("reuses text layouts through scrolling and unrelated cell edits", () => {
    const { sheet, measure, render } = fixture();
    setCellValue(sheet, { row: 2, column: 1 }, "wrapped words that need several lines");
    setCellStyle(sheet, { row: 2, column: 1 }, { wrapText: true });
    const before = cell(render(), 2, 1).content;
    measure.mockClear();
    const scrolled = cell(render({ y: 24 }), 2, 1).content;
    expect(scrolled).toBe(before);
    expect(measure).not.toHaveBeenCalled();
    setCellValue(sheet, { row: 90, column: 10 }, "off-screen edit");
    expect(cell(render({ y: 24 }), 2, 1).content).toBe(before);
    expect(measure).not.toHaveBeenCalled();
  });

  test("invalidates formulas when an off-screen dependency changes", () => {
    const { sheet, render, refreshDisplay } = fixture();
    setCellValue(sheet, { row: 90, column: 0 }, 2);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=A91*3" } },
    );
    refreshDisplay();
    const before = cell(render(), 0, 0).content;
    expect(before.text).toBe("6");
    setCellValue(sheet, { row: 90, column: 0 }, 4);
    refreshDisplay();
    const after = cell(render(), 0, 0).content;
    expect(after.text).toBe("12");
    expect(after).not.toBe(before);
  });

  test("renders dynamic-array projections without persisting spill cells", () => {
    const { sheet, render, refreshDisplay } = fixture();
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(2)" } },
    );
    refreshDisplay();
    const before = render();
    expect(cell(before, 0, 0).content.text).toBe("1");
    expect(cell(before, 1, 0).content.text).toBe("2");
    expect(cell(render({ y: 24 }), 1, 0).content.text).toBe("2");
    expect(sheet.cells.has("1:0")).toBe(false);

    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(3)" } },
    );
    refreshDisplay();
    expect(cell(render(), 2, 0).content.text).toBe("3");
    expect(sheet.cells.has("2:0")).toBe(false);
  });

  test("resolves conditional formats at each spill projection while inheriting the root style", () => {
    const { sheet, render, refreshDisplay } = fixture();
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(3)" } },
    );
    setCellStyle(sheet, { row: 0, column: 0 }, { fillColor: "#d9eaf7" });
    sheet.conditionalFormats = [
      {
        id: "bar",
        anchor: { row: 0, column: 0 },
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }],
        condition: {
          kind: "dataBar",
          minimum: { kind: "min" },
          maximum: { kind: "max" },
          color: "#4f81bd",
        },
        style: {},
      },
      {
        id: "icons",
        anchor: { row: 0, column: 0 },
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }],
        condition: {
          kind: "iconSet",
          iconSet: "threeTrafficLights",
          thresholds: [{ kind: "min" }, { kind: "percent", value: 50 }, { kind: "max" }],
        },
        style: {},
      },
      {
        id: "projection-style",
        anchor: { row: 0, column: 0 },
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }],
        condition: { kind: "cellValue", operator: "greaterThan", value: 1 },
        style: { fillColor: "#c6efce" },
      },
    ];
    refreshDisplay();
    const first = cell(render(), 0, 0);
    const second = cell(render(), 1, 0);
    const third = cell(render(), 2, 0);
    expect(first.style?.fillColor).toBe("#d9eaf7");
    expect(second.style?.fillColor).toBe("#c6efce");
    expect(third.style?.fillColor).toBe("#c6efce");
    expect(first.content.conditionalFormatVisual?.dataBar?.end).toBe(0);
    expect(second.content.conditionalFormatVisual?.dataBar?.end).toBeCloseTo(0.5);
    expect(third.content.conditionalFormatVisual?.dataBar?.end).toBe(1);
    expect(first.content.conditionalFormatVisual?.iconSet).toMatchObject({ iconIndex: 0 });
    expect(second.content.conditionalFormatVisual?.iconSet).toMatchObject({ iconIndex: 1 });
    expect(third.content.conditionalFormatVisual?.iconSet).toMatchObject({ iconIndex: 2 });
  });

  test("updates changed styles, locale and loaded font metrics", () => {
    const { sheet, measure, render, refreshDisplay } = fixture();
    setCellValue(sheet, { row: 0, column: 0 }, 12.5);
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      { numberFormat: { kind: "number", fractionDigits: 2, useGrouping: false } },
    );
    refreshDisplay();
    const before = cell(render(), 0, 0).content;
    expect(before.text).toBe("12.50");
    const translated = cell(render({ locale: "de-DE" }), 0, 0).content;
    expect(translated.text).toBe("12,50");
    setCellStyle(sheet, { row: 0, column: 0 }, { bold: true, textColor: "#123456" });
    refreshDisplay();
    const formatted = cell(render(), 0, 0).content;
    expect(formatted.textLayout?.font.weight).toBe(700);
    expect(formatted.style?.textColor).toBe("#123456");
    measure.mockClear();
    expect(cell(render({ fontRevision: 1 }), 0, 0).content).not.toBe(formatted);
    expect(measure).toHaveBeenCalled();
  });

  test("shares one full merged text layout across all frozen fragments", () => {
    const { sheet, render, refreshDisplay } = fixture();
    sheet.freezePanes = { rows: 1, columns: 1 };
    sheet.mergedCells = [{ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }];
    setCellValue(sheet, { row: 0, column: 0 }, "Merged title");
    refreshDisplay();
    const scene = render();
    const fragments = scene.panes.map((pane) =>
      pane.cells.find((entry) => entry.address.row === 0 && entry.address.column === 0)!,
    );
    expect(fragments).toHaveLength(4);
    for (const fragment of fragments) {
      expect(fragment.rect.width).toBe(96);
      expect(fragment.rect.height).toBe(24);
      expect(fragment.contentRect).toEqual({ x: 0, y: 0, width: 192, height: 48 });
      expect(fragment.content).toBe(fragments[0]!.content);
    }
  });

  test("projects data bars and icon sets into the scene while reserving icon space and hiding values", () => {
    const { sheet, render, refreshDisplay } = fixture();
    setCellValue(sheet, { row: 0, column: 0 }, -10);
    setCellValue(sheet, { row: 1, column: 0 }, 20);
    expect(cell(render(), 0, 0).content.conditionalFormatVisual).toBeUndefined();
    sheet.conditionalFormats = [
      {
        id: "bar",
        anchor: { row: 0, column: 0 },
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 1, column: 0 } }],
        condition: {
          kind: "dataBar",
          minimum: { kind: "min" },
          maximum: { kind: "max" },
          color: "#4f81bd",
          negativeColor: "#c0504d",
          showValue: false,
        },
        style: {},
      },
      {
        id: "icons",
        anchor: { row: 0, column: 0 },
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 1, column: 0 } }],
        condition: {
          kind: "iconSet",
          iconSet: "threeTrafficLights",
          thresholds: [{ kind: "min" }, { kind: "percent", value: 50 }, { kind: "max" }],
        },
        style: {},
      },
    ];
    refreshDisplay();
    const negative = cell(render(), 0, 0).content;
    const positive = cell(render(), 1, 0).content;
    expect(negative.text).toBe("");
    expect(negative.textLayout).toBeUndefined();
    expect(negative.conditionalFormatVisual).toMatchObject({
      dataBar: { axis: expect.any(Number), showValue: false },
      iconSet: { iconSet: "threeTrafficLights", iconIndex: 0 },
    });
    expect(positive.conditionalFormatVisual?.dataBar).toMatchObject({
      start: expect.any(Number),
      end: expect.any(Number),
      axis: expect.any(Number),
    });
    expect(positive.conditionalFormatVisual?.iconSet).toMatchObject({ iconIndex: 2 });
  });

  test("keeps a visible value clear of its icon set slot", () => {
    const { sheet, render, refreshDisplay } = fixture();
    setCellValue(sheet, { row: 0, column: 0 }, 40);
    setCellStyle(sheet, { row: 0, column: 0 }, { horizontalAlign: "left" });
    const before = cell(render(), 0, 0).content.textLayout!;
    const condition: Extract<ConditionalFormatCondition, { kind: "iconSet" }> = {
      kind: "iconSet",
      iconSet: "threeArrows",
      thresholds: [{ kind: "min" }, { kind: "percent", value: 50 }, { kind: "max" }],
      showValue: true,
    };
    sheet.conditionalFormats = [
      {
        id: "icons",
        anchor: { row: 0, column: 0 },
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }],
        condition,
        style: {},
      },
    ];
    refreshDisplay();
    const after = cell(render(), 0, 0).content;
    expect(after.text).toBe("40");
    expect(after.textLayout?.x).toBeGreaterThan(before.x);

    condition.icons = [null, null, null];
    refreshDisplay();
    const noIcon = cell(render(), 0, 0).content;
    expect(noIcon.conditionalFormatVisual?.iconSet).toEqual({ hidden: true, showValue: true });
    expect(noIcon.text).toBe("40");
    expect(noIcon.textLayout?.x).toBe(before.x);

    condition.showValue = false;
    refreshDisplay();
    expect(cell(render(), 0, 0).content.text).toBe("");
    expect(cell(render(), 0, 0).content.textLayout).toBeUndefined();
  });
});
