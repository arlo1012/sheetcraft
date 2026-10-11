import { describe, expect, test } from "vitest";
import {
  createSheet,
  setRowHeight,
  setColumnWidth,
  setSheetDimensionHidden,
} from "@sheetcraft/core/workbook";
import {
  anchorPictureFrameRect,
  resolvePictureFrame,
  type PictureFrame,
} from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { createSheetGeometry } from "../../geometry.js";
import { createRowVisibilityIndex } from "../../visibility.js";
import { createSheetViewportLayout } from "../../viewport-layout.js";
import {
  createPictureViewMetrics,
  getFramedPictureViewportFragments,
  getPicturePaneTranslation,
  projectPictureFrameIntoPane,
  pictureViewportPointToSheet,
  framedPictureContainsViewportPoint,
  moveFramedPictureBy,
} from "../../picture-frame-layout.js";
function fixture(
  options: { hiddenRows?: number[]; freeze?: boolean; derivedHidden?: boolean } = {},
) {
  const sheet = createSheet("Synthetic", "s");
  setRowHeight(sheet, 3, 40);
  setColumnWidth(sheet, 2, 120);
  for (const row of options.hiddenRows ?? []) setSheetDimensionHidden(sheet, "row", row, true);
  const geometry = createSheetGeometry({
    rowCount: 20,
    columnCount: 20,
    rowHeights: sheet.rowHeights,
    columnWidths: sheet.columnWidths,
    hiddenRows: sheet.hiddenRows,
    hiddenColumns: sheet.hiddenColumns,
  });
  const rows = createRowVisibilityIndex({
    rowCount: 20,
    defaultRowHeight: 24,
    rowHeights: sheet.rowHeights,
    hiddenRows: sheet.hiddenRows,
    hiddenIntervals: options.derivedHidden ? [{ start: 4, end: 6 }] : [],
  });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    viewportSize: { width: 400, height: 300 },
    freeze: options.freeze ? { rows: 2, columns: 2 } : undefined,
    bodyScrollPosition: options.freeze ? { x: 60, y: 50 } : undefined,
  });
  return {
    sheet,
    geometry,
    rows,
    layout,
    metrics: createPictureViewMetrics(sheet, geometry, rows),
  };
}
function image(frame?: PictureFrame): FramedFloatingImage {
  return {
    id: "picture",
    assetId: "asset",
    altText: "Synthetic",
    frame: frame ?? {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 160, y: 28, size: { width: 100, height: 100 } },
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 37,
    },
  };
}
describe("prepared picture frame viewport geometry", () => {
  test("does not treat unrelated default dimensions as a safe worksheet projection", () => {
    const f = fixture();
    const badGeometry = createSheetGeometry({ rowCount: 20, columnCount: 20, rowHeight: 20 });
    expect(() => createPictureViewMetrics(f.sheet, badGeometry, f.rows)).toThrow(/unscaled/);
    const badRows = createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 20 });
    expect(() => createPictureViewMetrics(f.sheet, f.geometry, badRows)).toThrow(/default height/);
  });
  test("uses real hidden boundary origins without losing nominal sizes", () => {
    const f = fixture({ hiddenRows: [4], derivedHidden: true });
    expect(f.layout.getCellRect({ row: 4, column: 2 })).toBeNull();
    expect(f.metrics.rows.nominalSize(4)).toBe(24);
    expect(f.metrics.rows.visibleSize(4)).toBe(0);
    expect(f.metrics.rows.visiblePrefix(4)).toBe(112);
    expect(f.metrics.rows.visiblePrefix(7)).toBe(112);
    expect(f.metrics.rows.visiblePrefix(20)).toBe(f.rows.getTotalHeight());
    expect(f.metrics.rows.visiblePrefix(21)).toBe(f.rows.getTotalHeight() + 24);
    expect(f.metrics.columns.visiblePrefix(20)).toBe(f.geometry.getTotalSize().width);
    expect(f.metrics.columns.visiblePrefix(21)).toBe(f.geometry.getTotalSize().width + 96);
    expect(() => f.metrics.rows.visiblePrefix(-1)).toThrow();
  });
  test("projects the complete rotated quadrilateral through all four frozen panes", () => {
    const f = fixture({ freeze: true }),
      original = image();
    const resolved = resolvePictureFrame(original.frame, f.metrics);
    const fragments = getFramedPictureViewportFragments(original, f);
    expect(new Set(fragments.map((fragment) => fragment.paneId))).toEqual(
      new Set(["topLeft", "top", "left", "body"]),
    );
    for (const fragment of fragments) {
      const delta = getPicturePaneTranslation(fragment.paneId, f.layout);
      expect(fragment.geometry.rect.x).toBe(resolved.rect.x + delta.x);
      expect(fragment.geometry.rect.y).toBe(resolved.rect.y + delta.y);
      for (let i = 0; i < 4; i++) {
        const projected = fragment.geometry.corners[i]!;
        const point = pictureViewportPointToSheet(projected, fragment.paneId, f.layout);
        expect(point.x).toBeCloseTo(resolved.corners[i]!.x, 9);
        expect(point.y).toBeCloseTo(resolved.corners[i]!.y, 9);
      }
    }
    expect(projectPictureFrameIntoPane(resolved, "body", f.layout).bounds.width).toBe(
      resolved.bounds.width,
    );
  });
  test("a rotated corner may be visible while the unrotated local frame is entirely outside", () => {
    const f = fixture(),
      original = image();
    original.frame.anchor = { mode: "fixed", x: -110, y: 50, size: { width: 100, height: 200 } };
    original.frame.angleDeg = 90;
    expect(getFramedPictureViewportFragments(original, f)).toHaveLength(1);
    expect(framedPictureContainsViewportPoint(original, { x: 10, y: 150 }, f)).toBe(true);
    expect(framedPictureContainsViewportPoint(original, { x: 50, y: 150 }, f)).toBe(false);
  });
  test("AABB-only corners and points outside the pane do not hit", () => {
    const f = fixture(),
      original = image();
    const resolved = resolvePictureFrame(original.frame, f.metrics);
    expect(
      framedPictureContainsViewportPoint(
        original,
        { x: resolved.bounds.x, y: resolved.bounds.y },
        f,
      ),
    ).toBe(false);
    expect(framedPictureContainsViewportPoint(original, { x: 210, y: 78 }, f)).toBe(true);
    expect(framedPictureContainsViewportPoint(original, { x: -1, y: 78 }, f)).toBe(false);
    original.hidden = true;
    expect(getFramedPictureViewportFragments(original, f)).toEqual([]);
  });
  test.each(["fixed", "move-only", "move-and-size"] as const)(
    "moves %s without changing source or angle",
    (mode) => {
      const f = fixture(),
        original = image();
      original.frame.anchor = anchorPictureFrameRect(
        mode,
        { x: 194, y: 114, width: 120, height: 80 },
        f.metrics,
      );
      original.frame.source.offsetXRatio = 0.5;
      const before = structuredClone(original),
        moved = moveFramedPictureBy(original, { x: 42, y: -20 }, f.metrics)!;
      const next = resolvePictureFrame(moved.frame, f.metrics);
      expect(next.rect).toEqual({ x: 236, y: 94, width: 120, height: 80 });
      expect(moved.frame.anchor.mode).toBe(mode);
      expect(moved.frame.source).toEqual(before.frame.source);
      expect(moved.frame.angleDeg).toBe(37);
      expect(original).toEqual(before);
    },
  );
  test("collapsed frames remain noninteractive rather than acquiring a guessed size", () => {
    const f = fixture({ hiddenRows: [4, 5, 6] }),
      original = image();
    original.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 2, offset: 2 }, row: { index: 4, offset: 2 } },
      end: { column: { index: 3, offset: 2 }, row: { index: 6, offset: 8 } },
    };
    expect(getFramedPictureViewportFragments(original, f)).toEqual([]);
    expect(moveFramedPictureBy(original, { x: 10, y: 10 }, f.metrics)).toBeNull();
    expect(() => moveFramedPictureBy(original, { x: NaN, y: 0 }, f.metrics)).toThrow();
  });
  test("moves a derived stretch larger than the manual edit budget without flattening", () => {
    const f = fixture(),
      original = image();
    original.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 200, offset: 0 }, row: { index: 600, offset: 0 } },
    };
    const before = resolvePictureFrame(original.frame, f.metrics);
    const moved = moveFramedPictureBy(original, { x: 10, y: 5 }, f.metrics)!;
    expect(resolvePictureFrame(moved.frame, f.metrics).rect).toEqual({
      ...before.rect,
      x: 10,
      y: 5,
    });
  });
  test("rejects an overflowing moved source before returning an unrenderable object", () => {
    const f = fixture(),
      original = image();
    original.frame = {
      kind: "object-frame-v1",
      anchor: {
        mode: "move-and-size",
        start: { column: { index: 0, offset: -1e308 }, row: { index: 0, offset: 0 } },
        end: { column: { index: 0, offset: 0 }, row: { index: 10, offset: 0 } },
      },
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 1, offsetYRatio: 0 },
      angleDeg: 0,
    };
    const before = structuredClone(original);
    expect(resolvePictureFrame(original.frame, f.metrics).sourceRect).not.toBeNull();
    expect(() => moveFramedPictureBy(original, { x: 1e308, y: 0 }, f.metrics)).toThrow();
    expect(original).toEqual(before);
  });
});
