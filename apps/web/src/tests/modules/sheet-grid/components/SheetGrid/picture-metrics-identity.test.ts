import { nextTick } from "vue";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createSheetEvaluator,
  setCellStyle,
  setCellValue,
  setColumnWidth,
  setRowHeight,
  type Sheet,
} from "@sheetcraft/core/workbook";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { mountSheetGrid } from "./fixture";
import { browserCellTextMeasurer } from "../../../../../shared/cell-text/text-metrics";

beforeEach(() => {
  // Supply the native text metrics port; row reconciliation and geometry stay real.
  vi.spyOn(browserCellTextMeasurer, "measure").mockImplementation((text) => text.length * 8);
  vi.spyOn(browserCellTextMeasurer, "measureMetrics").mockImplementation((text, font) => ({
    width: text.length * 8,
    ascent: font.size * 0.8,
    descent: font.size * 0.2,
  }));
});
afterEach(() => vi.restoreAllMocks());

function metrics(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"], sheet: Sheet) {
  return (wrapper.vm as unknown as {
    getShapeFrameContext(sheet: Sheet): { metrics: PictureSheetMetrics };
  }).getShapeFrameContext(sheet).metrics;
}

test("drawing revision and equivalent evaluator refresh retain the current geometry metrics", async () => {
  const { wrapper, sheet } = mountSheetGrid({
    beforeMount(sheet) {
      setCellValue(sheet, { row: 0, column: 0 }, "Name");
      setCellValue(sheet, { row: 1, column: 0 }, "Geometry");
      setCellValue(sheet, { row: 1, column: 1 }, 12);
      setCellValue(sheet, { row: 2, column: 2 }, 34);
    },
  });
  try {
    await nextTick();
    const initial = metrics(wrapper, sheet);
    await wrapper.setProps({ workbookRevision: 1 });
    expect(metrics(wrapper, sheet)).toBe(initial);
    await wrapper.setProps({ evaluator: createSheetEvaluator(sheet), workbookRevision: 2 });
    expect(metrics(wrapper, sheet)).toBe(initial);
    await wrapper.setProps({ pictureOwnerGeneration: 1 });
    expect(metrics(wrapper, sheet)).not.toBe(initial);
  } finally {
    wrapper.unmount();
  }
});

test("effective row heights, columns and filtered visibility still invalidate geometry metrics", async () => {
  const { wrapper, sheet } = mountSheetGrid();
  try {
    await nextTick();
    let previous = metrics(wrapper, sheet);
    setRowHeight(sheet, 3, 40);
    await nextTick();
    let current = metrics(wrapper, sheet);
    expect(current).not.toBe(previous);
    expect(current.rows.visibleSize(3)).toBe(40);
    previous = current;
    setCellValue(sheet, { row: 0, column: 0 }, "wrapped\ncontent\ncontent\ncontent");
    setCellStyle(sheet, { row: 0, column: 0 }, { wrapText: true, fontSize: 30 });
    await wrapper.setProps({ evaluator: createSheetEvaluator(sheet), workbookRevision: 1 });
    current = metrics(wrapper, sheet);
    expect(current).not.toBe(previous);
    expect(current.rows.visibleSize(0)).toBeGreaterThan(24);
    const automaticHeight = current.rows.visibleSize(0);
    previous = current;
    setCellStyle(sheet, { row: 0, column: 0 }, { fontSize: 42 });
    await wrapper.setProps({ evaluator: createSheetEvaluator(sheet), workbookRevision: 2 });
    current = metrics(wrapper, sheet);
    expect(current).not.toBe(previous);
    expect(current.rows.visibleSize(0)).toBeGreaterThan(automaticHeight);
    previous = current;
    setColumnWidth(sheet, 1, 170);
    await nextTick();
    current = metrics(wrapper, sheet);
    expect(current).not.toBe(previous);
    expect(current.columns.visibleSize(1)).toBe(170);
    previous = current;
    setCellValue(sheet, { row: 1, column: 0 }, "hidden");
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      columns: [{ column: 0, allowedValues: [{ kind: "string", value: "keep" }] }],
    };
    await nextTick();
    current = metrics(wrapper, sheet);
    expect(current).not.toBe(previous);
    expect(current.rows.visibleSize(1)).toBe(0);
    previous = current;
    sheet.filter = null;
    await nextTick();
    expect(metrics(wrapper, sheet)).not.toBe(previous);
    expect(metrics(wrapper, sheet).rows.visibleSize(1)).toBe(24);
  } finally {
    wrapper.unmount();
  }
});
