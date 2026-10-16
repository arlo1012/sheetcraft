import { describe, expect, test } from "vitest";
import {
  MAX_SHEET_ROWS,
  createSheet,
  createSheetSparseState,
  getDefaultRowHeight,
  getRowHeight,
  normalizeSheetSparseState,
  replaceSheetSparseState,
  setRowHeight,
  setSheetDimensionHidden,
} from "../../workbook.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { cloneSparseState } from "../../commands/helpers.js";

function source(height = 20) {
  return { ...createSheetSparseState(createSheet("Rows", "rows")), defaultRowHeight: height };
}

describe("sparse sheet default row heights", () => {
  test("keeps the legacy baseline absent and preserves a non-24 baseline without expanding rows", () => {
    const sheet = createSheet("Rows", "rows");
    expect(getDefaultRowHeight(sheet)).toBe(24);
    expect(createSheetSparseState(sheet)).not.toHaveProperty("defaultRowHeight");
    replaceSheetSparseState(sheet, source());
    expect(getDefaultRowHeight(sheet)).toBe(20);
    expect(getRowHeight(sheet, MAX_SHEET_ROWS - 1)).toBe(20);
    expect(sheet.rowHeights.size).toBe(0);
    const copied = cloneSparseState(createSheetSparseState(sheet));
    expect(copied.defaultRowHeight).toBe(20);
    expect(replaceSheetSparseState(sheet, copied)).toBe(false);
    expect(replaceSheetSparseState(sheet, source(24))).toBe(true);
    expect(createSheetSparseState(sheet)).not.toHaveProperty("defaultRowHeight");
  });

  test("preserves explicit 24px rows and hidden nominal sizes on a 20px sheet", () => {
    const sheet = createSheet("Rows", "rows");
    replaceSheetSparseState(sheet, source());
    expect(setRowHeight(sheet, 3, 24)).toBe(true);
    expect(setRowHeight(sheet, 4, 20)).toBe(false);
    setSheetDimensionHidden(sheet, "row", 3, true);
    setSheetDimensionHidden(sheet, "row", 4, true);
    expect(getRowHeight(sheet, 3)).toBe(0);
    expect(getRowHeight(sheet, 4)).toBe(0);
    const metrics = createPictureSheetMetrics(sheet).rows;
    expect(metrics.nominalSize(3)).toBe(24);
    expect(metrics.nominalSize(4)).toBe(20);
    expect(metrics.nominalPrefix(5)).toBe(104);
    expect(metrics.visiblePrefix(5)).toBe(60);
    expect(metrics.nominalPrefix(MAX_SHEET_ROWS)).toBe(MAX_SHEET_ROWS * 20 + 4);
    expect(metrics.visiblePrefix(MAX_SHEET_ROWS)).toBe(MAX_SHEET_ROWS * 20 - 40);
    setSheetDimensionHidden(sheet, "row", 3, false);
    expect(getRowHeight(sheet, 3)).toBe(24);
    expect(setRowHeight(sheet, 3, 20)).toBe(true);
    expect(sheet.rowHeights.size).toBe(0);
  });

  test.each([16, 20, 24, 512])("accepts the existing integer pixel domain: %s", (height) => {
    expect(normalizeSheetSparseState(source(height)).defaultRowHeight).toBe(
      height === 24 ? undefined : height,
    );
  });

  test.each([0, 15, 513, 20.5, NaN, Infinity, -Infinity, null, "20"])(
    "rejects invalid default %s atomically",
    (height) => {
      const sheet = createSheet("Rows", "rows");
      const before = createSheetSparseState(sheet);
      expect(() => replaceSheetSparseState(sheet, source(height as number))).toThrow();
      expect(createSheetSparseState(sheet)).toEqual(before);
    },
  );

  test("rejects only overrides redundant against the actual sheet baseline", () => {
    expect(() =>
      normalizeSheetSparseState({ ...source(), rowHeights: [{ index: 1, size: 20 }] }),
    ).toThrow();
    expect(
      normalizeSheetSparseState({ ...source(), rowHeights: [{ index: 1, size: 24 }] }).rowHeights,
    ).toEqual([{ index: 1, size: 24 }]);
  });
});
