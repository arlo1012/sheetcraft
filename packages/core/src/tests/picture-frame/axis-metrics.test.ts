import { describe, expect, test } from "vitest";
import {
  createSheet,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_COLUMN_WIDTH,
  setRowHeight,
  setColumnWidth,
  setSheetDimensionHidden,
  setDefaultColumnWidth,
} from "../../workbook.js";
import { MAX_SHEET_ROWS, MAX_SHEET_COLUMNS } from "../../sheet-limits.js";
import {
  createPictureAxisMetrics,
  locatePictureAxisPoint,
  normalizePictureAxisPoint,
  projectPictureAxisPoint,
  projectLegacyPictureAxisOrigin,
} from "../../picture-axis-metrics.js";
describe("sparse picture axis metrics", () => {
  test("axis points reject executable or inherited fields without reading them", () => {
    let reads = 0;
    const accessor = {
      get index() {
        reads++;
        return 1;
      },
      offset: 0,
    };
    expect(() => normalizePictureAxisPoint(accessor, 20)).toThrow(/accessors/);
    expect(() => normalizePictureAxisPoint(Object.create({ index: 1, offset: 0 }), 20)).toThrow(
      /ordinary/,
    );
    expect(() => normalizePictureAxisPoint({ index: 1, offset: 0, [Symbol("x")]: 1 }, 20)).toThrow(
      /Unknown/,
    );
    expect(reads).toBe(0);
  });
  test("separates underlying dimensions from zero-extent hidden locations", () => {
    const sheet = createSheet("Synthetic", "s");
    setRowHeight(sheet, 1, 40);
    setRowHeight(sheet, 4, 18);
    setSheetDimensionHidden(sheet, "row", 1, true);
    setSheetDimensionHidden(sheet, "row", 4, true);
    const metric = createPictureAxisMetrics(sheet, "row");
    expect(metric.nominalSize(1)).toBe(40);
    expect(metric.visibleSize(1)).toBe(0);
    expect(metric.nominalPrefix(5)).toBe(130);
    expect(metric.visiblePrefix(5)).toBe(72);
    expect(metric.visiblePrefix(2)).toBe(24);
    expect(metric.visiblePrefix(MAX_SHEET_ROWS)).toBe(DEFAULT_ROW_HEIGHT * MAX_SHEET_ROWS - 48);
    setRowHeight(sheet, 1, 80);
    setSheetDimensionHidden(sheet, "row", 1, false);
    expect(metric.nominalSize(1)).toBe(40);
    expect(metric.visibleSize(1)).toBe(0);
    expect(createPictureAxisMetrics(sheet, "row").visibleSize(1)).toBe(80);
  });
  test("default-column and nonuniform sparse adjustments remain independent", () => {
    const sheet = createSheet("Synthetic", "s");
    setDefaultColumnWidth(sheet, 88);
    setColumnWidth(sheet, 2, 120);
    const metric = createPictureAxisMetrics(sheet, "column");
    expect(metric.visiblePrefix(3)).toBe(296);
    expect(metric.nominalPrefix(MAX_SHEET_COLUMNS)).toBe(88 * MAX_SHEET_COLUMNS + 32);
    expect(locatePictureAxisPoint(178, metric)).toEqual({ index: 2, offset: 2 });
    expect(locatePictureAxisPoint(296, metric)).toEqual({ index: 3, offset: 0 });
  });
  test("durable insets clamp only the visible projection; hide/unhide restores them", () => {
    const sheet = createSheet("Synthetic", "s");
    const point = { index: 4, offset: 20 };
    setRowHeight(sheet, 4, 16);
    expect(projectPictureAxisPoint(point, createPictureAxisMetrics(sheet, "row"))).toBe(112);
    setSheetDimensionHidden(sheet, "row", 4, true);
    const hidden = createPictureAxisMetrics(sheet, "row");
    expect(projectPictureAxisPoint(point, hidden)).toBe(96);
    expect(locatePictureAxisPoint(96, hidden, point)).toEqual(point);
    setSheetDimensionHidden(sheet, "row", 4, false);
    setRowHeight(sheet, 4, 40);
    expect(projectPictureAxisPoint(point, createPictureAxisMetrics(sheet, "row"))).toBe(116);
    expect(point).toEqual({ index: 4, offset: 20 });
  });
  test("legacy large offsets keep their free pixel meaning instead of endpoint clamping", () => {
    const sheet = createSheet("Synthetic", "s");
    const metric = createPictureAxisMetrics(sheet, "column");
    expect(projectLegacyPictureAxisOrigin(2, 400, metric)).toBe(DEFAULT_COLUMN_WIDTH * 2 + 400);
    expect(projectPictureAxisPoint({ index: 2, offset: 400 }, metric)).toBe(
      DEFAULT_COLUMN_WIDTH * 3,
    );
    setSheetDimensionHidden(sheet, "column", 2, true);
    expect(projectLegacyPictureAxisOrigin(2, 400, createPictureAxisMetrics(sheet, "column"))).toBe(
      DEFAULT_COLUMN_WIDTH * 2,
    );
  });
  test("right affinity skips a collapsed hidden run without changing a preferred endpoint", () => {
    const sheet = createSheet("Synthetic", "s");
    [1, 2, 3].forEach((index) => setSheetDimensionHidden(sheet, "row", index, true));
    const metric = createPictureAxisMetrics(sheet, "row");
    expect(locatePictureAxisPoint(24, metric)).toEqual({ index: 4, offset: 0 });
    expect(locatePictureAxisPoint(24, metric, { index: 2, offset: 5 })).toEqual({
      index: 2,
      offset: 5,
    });
  });
  test("supports explicit leading negative positions and finite trailing points", () => {
    const metric = createPictureAxisMetrics(createSheet("Synthetic", "s"), "row");
    expect(locatePictureAxisPoint(-60, metric)).toEqual({ index: 0, offset: -60 });
    expect(projectPictureAxisPoint({ index: 0, offset: -60 }, metric)).toBe(-60);
    const extent = metric.visiblePrefix(metric.count);
    expect(locatePictureAxisPoint(extent + 90, metric)).toEqual({
      index: metric.count,
      offset: 90,
    });
    expect(projectPictureAxisPoint({ index: metric.count, offset: 90 }, metric)).toBe(extent + 90);
    expect(normalizePictureAxisPoint({ index: 0, offset: -0 }, metric.count).offset).toBe(0);
    expect(
      Object.is(normalizePictureAxisPoint({ index: 0, offset: -0 }, metric.count).offset, -0),
    ).toBe(false);
  });
  test.each([
    { index: -1, offset: 0 },
    { index: 1, offset: -1 },
    { index: 0.5, offset: 0 },
    { index: MAX_SHEET_ROWS + 1, offset: 0 },
    { index: 0, offset: NaN },
    { index: 0, offset: Infinity },
    { index: 0, offset: 0, guess: true },
  ])("rejects invalid point %j", (point) => {
    expect(() => normalizePictureAxisPoint(point, MAX_SHEET_ROWS)).toThrow();
  });
  test("metric boundary methods reject invalid indexes without iterating or allocating a dense axis", () => {
    const metric = createPictureAxisMetrics(createSheet("Synthetic", "s"), "row");
    expect(() => metric.nominalSize(metric.count)).toThrow();
    expect(() => metric.visiblePrefix(metric.count + 1)).toThrow();
    expect(() => locatePictureAxisPoint(Infinity, metric)).toThrow();
  });
  test("invalid sparse source metrics and axis counts fail explicitly", () => {
    const sheet = createSheet("Synthetic", "s");
    sheet.columnWidths.set(2, Infinity);
    expect(() => createPictureAxisMetrics(sheet, "column")).toThrow();
    sheet.columnWidths.set(2, Number.MAX_VALUE);
    sheet.columnWidths.set(3, Number.MAX_VALUE);
    expect(() => createPictureAxisMetrics(sheet, "column")).toThrow();
    for (const count of [NaN, Infinity, 0, -1, 2.5])
      expect(() => normalizePictureAxisPoint({ index: 0, offset: 0 }, count)).toThrow();
  });
});
