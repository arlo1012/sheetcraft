import { describe, expect, test, vi } from "vitest";
import { MergedCellRangeResolver } from "@idea10/core";
import {
  createSheet,
  createSheetEvaluator,
  setCellContent,
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
      sheet,
      evaluator: createSheetEvaluator(sheet),
      layout,
      columnCount: geometry.columnCount,
      locale: options.locale ?? "en-US",
      dateSystem: "1900",
      fontRevision: options.fontRevision ?? 0,
      cache,
    });
  }
  return { sheet, measure, render };
}

describe("Canvas cell presentation cache", () => {
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
    const { sheet, render } = fixture();
    setCellValue(sheet, { row: 90, column: 0 }, 2);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=A91*3" } },
    );
    const before = cell(render(), 0, 0).content;
    expect(before.text).toBe("6");
    setCellValue(sheet, { row: 90, column: 0 }, 4);
    const after = cell(render(), 0, 0).content;
    expect(after.text).toBe("12");
    expect(after).not.toBe(before);
  });

  test("updates changed styles, locale and loaded font metrics", () => {
    const { sheet, measure, render } = fixture();
    setCellValue(sheet, { row: 0, column: 0 }, 12.5);
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      { numberFormat: { kind: "number", fractionDigits: 2, useGrouping: false } },
    );
    const before = cell(render(), 0, 0).content;
    expect(before.text).toBe("12.50");
    const translated = cell(render({ locale: "de-DE" }), 0, 0).content;
    expect(translated.text).toBe("12,50");
    setCellStyle(sheet, { row: 0, column: 0 }, { bold: true, textColor: "#123456" });
    const formatted = cell(render(), 0, 0).content;
    expect(formatted.textLayout?.font.weight).toBe(700);
    expect(formatted.style?.textColor).toBe("#123456");
    measure.mockClear();
    expect(cell(render({ fontRevision: 1 }), 0, 0).content).not.toBe(formatted);
    expect(measure).toHaveBeenCalled();
  });

  test("shares one full merged text layout across all frozen fragments", () => {
    const { sheet, render } = fixture();
    sheet.freezePanes = { rows: 1, columns: 1 };
    sheet.mergedCells = [{ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }];
    setCellValue(sheet, { row: 0, column: 0 }, "Merged title");
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
});
