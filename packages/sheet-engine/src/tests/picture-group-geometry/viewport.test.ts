import { describe, expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { createSheetGeometry } from "../../geometry.js";
import { createRowVisibilityIndex } from "../../visibility.js";
import { createSheetViewportLayout } from "../../viewport-layout.js";
import {
  createPictureViewMetrics,
  getPicturePaneTranslation,
  pictureViewportPointToSheet,
} from "../../picture-frame-layout.js";
import {
  getPictureGroupViewportFragments,
  pictureGroupContainsViewportPoint,
  projectPictureGroupLayoutIntoPane,
} from "../../picture-group-geometry.js";
import { group } from "./fixture.js";

function fixture(freeze = false) {
  const sheet = createSheet("Synthetic", "s");
  const geometry = createSheetGeometry({ rowCount: 20, columnCount: 20 });
  const rows = createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    viewportSize: { width: 400, height: 300 },
    freeze: freeze ? { rows: 2, columns: 2 } : undefined,
    bodyScrollPosition: freeze ? { x: 60, y: 50 } : undefined,
  });
  const value = group();
  value.frame.anchor = { mode: "fixed", x: 160, y: 28, size: { width: 100, height: 100 } };
  return { layout, metrics: createPictureViewMetrics(sheet, geometry, rows), value };
}
describe("source-free group root viewport geometry", () => {
  test("projects root corners through all frozen panes without manufacturing source geometry", () => {
    const context = fixture(true),
      resolved = resolvePictureGroup(context.value, context.metrics);
    const fragments = getPictureGroupViewportFragments(context.value, context);
    expect(new Set(fragments.map((fragment) => fragment.paneId))).toEqual(
      new Set(["topLeft", "top", "left", "body"]),
    );
    for (const fragment of fragments) {
      expect(fragment.path).toEqual(["root"]);
      expect("sourceRect" in fragment.geometry).toBe(false);
      expect("source" in fragment.geometry).toBe(false);
      expect(fragment.geometry.angleDeg).toBe(37);
      const delta = getPicturePaneTranslation(fragment.paneId, context.layout);
      expect(fragment.geometry.rect.x).toBe(resolved.layout.rect.x + delta.x);
      expect(fragment.geometry.rect.y).toBe(resolved.layout.rect.y + delta.y);
      for (const [index, corner] of fragment.geometry.corners.entries()) {
        const sheet = pictureViewportPointToSheet(corner, fragment.paneId, context.layout);
        expect(sheet.x).toBeCloseTo(resolved.layout.corners[index]!.x, 9);
        expect(sheet.y).toBeCloseTo(resolved.layout.corners[index]!.y, 9);
      }
    }
    expect(
      projectPictureGroupLayoutIntoPane(resolved.layout, "body", context.layout).bounds.width,
    ).toBe(resolved.layout.bounds.width);
  });
  test("root hit checks its polygon and viewport clip rather than AABB-only corners", () => {
    const context = fixture(),
      layout = resolvePictureGroup(context.value, context.metrics).layout;
    expect(pictureGroupContainsViewportPoint(context.value, { x: 210, y: 78 }, context)).toBe(true);
    expect(
      pictureGroupContainsViewportPoint(
        context.value,
        { x: layout.bounds.x, y: layout.bounds.y },
        context,
      ),
    ).toBe(false);
    expect(pictureGroupContainsViewportPoint(context.value, { x: -1, y: 78 }, context)).toBe(false);
    expect(() =>
      pictureGroupContainsViewportPoint(context.value, { x: NaN, y: 0 }, context),
    ).toThrow();
  });
  test("hidden containers suppress root fragments while descendants remain canonically resolved", () => {
    const context = fixture();
    context.value.hidden = true;
    expect(getPictureGroupViewportFragments(context.value, context)).toEqual([]);
    expect(pictureGroupContainsViewportPoint(context.value, { x: 210, y: 78 }, context)).toBe(
      false,
    );
    expect(resolvePictureGroup(context.value, context.metrics).members[0]!.layout).not.toBeNull();
  });
  test("hidden descendant invalidity rejects projection rather than partially returning a root", () => {
    const context = fixture();
    const leaf = context.value.members[1]!;
    if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected test leaf.");
    leaf.frame.source.widthRatio = 1e308;
    expect(() => getPictureGroupViewportFragments(context.value, context)).toThrow();
    context.value.hidden = true;
    expect(() => getPictureGroupViewportFragments(context.value, context)).toThrow();
  });
});
