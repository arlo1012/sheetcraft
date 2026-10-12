// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  getStandardShapeViewportFragments,
  standardShapeResizeRect,
} from "../../../modules/sheet-drawings/standard-shape-layout";
const shape: SheetGraphicDrawing = {
  id: "s",
  kind: "shape",
  name: "s",
  anchor: { row: 4, column: 2 },
  offsetX: 10,
  offsetY: 10,
  width: 180,
  height: 120,
  text: "",
  shape: "rectangle",
  shapeGeometry: { preset: "wedgeRectCallout", adjustments: { adj1: -70000, adj2: 150000 } },
  fill: "#abcdef",
  stroke: "#123456",
  strokeWidth: 2,
  color: "#123456",
  fontSize: 14,
  bold: false,
  italic: false,
  rotation: 37,
};
const layout = () =>
  createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 40,
      columnCount: 20,
      rowHeight: 24,
      columnWidth: 80,
    }),
    rows: createRowVisibilityIndex({ rowCount: 40, defaultRowHeight: 24 }),
    viewportSize: { width: 600, height: 500 },
    freeze: { rows: 2, columns: 1 },
    bodyScrollPosition: { x: 40, y: 24 },
  });
describe("standard shape viewport and size", () => {
  test.each([0, 37, 90, 179, -37])(
    "resize in%d local axes fixes opposite edges and corners",
    (rotation) => {
      const rect = { x: 300, y: 250, width: 180, height: 120 };
      for (const direction of ["n", "s", "e", "w", "nw", "ne", "sw", "se"] as const) {
        const next = standardShapeResizeRect(rect, rotation, direction, { x: 20, y: 10 })!;
        expect(next).toBeDefined();
        const fx = direction.includes("w") ? 1 : direction.includes("e") ? 0 : 0.5,
          fy = direction.includes("n") ? 1 : direction.includes("s") ? 0 : 0.5;
        const before = pictureFrameLocalToWorld(rect, rotation, {
          x: rect.width * fx,
          y: rect.height * fy,
        });
        const after = pictureFrameLocalToWorld(next, rotation, {
          x: next.width * fx,
          y: next.height * fy,
        });
        expect(after.x).toBeCloseTo(before.x, 8);
        expect(after.y).toBeCloseTo(before.y, 8);
      }
    },
  );
  test("corners only obey explicit ratio and no silent origin clamp", () => {
    const rect = { x: 300, y: 250, width: 180, height: 120 };
    const side = standardShapeResizeRect(rect, 0, "e", { x: 60, y: 60 }, true)!;
    expect(side.height).toBe(120);
    expect(side.width).toBe(240);
    const free = standardShapeResizeRect(rect, 0, "se", { x: 60, y: 10 })!,
      ratio = standardShapeResizeRect(rect, 0, "se", { x: 60, y: 10 }, true)!;
    expect(free.height).toBe(130);
    expect(ratio.width / ratio.height).toBeCloseTo(1.5);
    expect(
      standardShapeResizeRect({ x: 0, y: 0, width: 180, height: 120 }, 37, "nw", {
        x: -600,
        y: -600,
      }),
    ).toBeUndefined();
  });
  test("clips rotated callout tail to panes instead of its body frame", () => {
    const v = layout(),
      fragments = getStandardShapeViewportFragments(shape, v, true);
    expect(fragments.length).toBeGreaterThan(0);
    for (const f of fragments) {
      const c = v.panes[f.paneId].clip;
      expect(f.clippedRect.x).toBeGreaterThanOrEqual(c.x);
      expect(f.clippedRect.y).toBeGreaterThanOrEqual(c.y);
      expect(f.clippedRect.x + f.clippedRect.width).toBeLessThanOrEqual(c.x + c.width);
      expect(f.clippedRect.y + f.clippedRect.height).toBeLessThanOrEqual(c.y + c.height);
    }
    expect(
      fragments.some(
        (f) =>
          f.clippedRect.x < f.rect.x ||
          f.clippedRect.y < f.rect.y ||
          f.clippedRect.width > f.rect.width ||
          f.clippedRect.height > f.rect.height,
      ),
    ).toBe(true);
  });
  test("transparent shapes are not given rectangular hit surfaces; selected controls can still show", () => {
    const v = layout(),
      none = { ...shape, text: "", fill: "transparent", stroke: "transparent" };
    expect(getStandardShapeViewportFragments(none, v)).toEqual([]);
    expect(getStandardShapeViewportFragments(none, v, true).length).toBeGreaterThan(0);
  });
});

test("side resize never grows the valid untouched thin axis", () => {
  expect(
    standardShapeResizeRect({ x: 100, y: 100, width: 240, height: 1 }, 0, "e", { x: 10, y: 0 }),
  ).toEqual({ x: 100, y: 100, width: 250, height: 1 });
  expect(
    standardShapeResizeRect({ x: 100, y: 100, width: 1, height: 240 }, 0, "s", { x: 0, y: 10 }),
  ).toEqual({ x: 100, y: 100, width: 1, height: 250 });
  expect(
    standardShapeResizeRect({ x: 100, y: 100, width: 1, height: 1 }, 37, "se", { x: 0, y: 0 }),
  ).toEqual({ x: 100, y: 100, width: 1, height: 1 });
});
