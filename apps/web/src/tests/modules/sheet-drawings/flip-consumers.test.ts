import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  getStandardShapeGeometry,
  getStandardShapeWorldBounds,
  standardShapeContainsWorldPoint,
  standardShapeFlipPoint,
  standardShapeSvgTransform,
} from "../../../modules/sheet-drawings/shape-geometry";
import {
  shapeDrawingContainsWorldPoint,
  getShapeEndPaint,
} from "../../../modules/sheet-drawings/shape-line-paint";
import { getStandardShapeViewportFragments } from "../../../modules/sheet-drawings/standard-shape-layout";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import StandardShapeSelection from "../../../modules/sheet-drawings/components/StandardShapeSelection.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createAppI18n } from "../../../shared/i18n";
const base: SheetGraphicDrawing = {
  ...createGraphicDrawing("shape", "shape", "Shape", { row: 2, column: 2 }),
  offsetX: 4,
  offsetY: 4,
  width: 180,
  height: 90,
  rotation: 37,
  shapeGeometry: { preset: "wedgeRectCallout" },
};
const rect = { x: 164, y: 52, width: 180, height: 90 };
const layout = createSheetViewportLayout({
  geometry: createSheetGeometry({ rowCount: 50, columnCount: 20, rowHeight: 24, columnWidth: 80 }),
  rows: createRowVisibilityIndex({ rowCount: 50, defaultRowHeight: 24 }),
  viewportSize: { width: 800, height: 600 },
});
describe("standard shape flip consumers", () => {
  test.each([
    [true, false],
    [false, true],
    [true, true],
  ] as const)(
    "reflects numeric paths, bounds, hit and yellow control consistently X%s Y%s",
    (x, y) => {
      const drawing = {
          ...base,
          ...(x ? { shapeFlipX: true as const } : {}),
          ...(y ? { shapeFlipY: true as const } : {}),
        },
        geometry = getStandardShapeGeometry(drawing.shapeGeometry, 180, 90)!;
      const handle = geometry.handles[0]!.position,
        flipped = standardShapeFlipPoint(drawing, handle),
        world = pictureFrameLocalToWorld(rect, 37, flipped);
      const inverse = standardShapeFlipPoint(drawing, flipped);
      expect(inverse.x).toBeCloseTo(handle.x, 10);
      expect(inverse.y).toBeCloseTo(handle.y, 10);
      const content = mount(DrawingContent, {
        props: { drawing },
        global: { plugins: [createAppI18n("en-US")] },
      });
      expect(content.get("svg g").attributes("transform")).toBe(standardShapeSvgTransform(drawing));
      content.unmount();
      const fragment = getStandardShapeViewportFragments(drawing, layout, true).find(
        (f) => f.paneId === "body",
      )!;
      const bounds = getStandardShapeWorldBounds(geometry, drawing, rect, 37)!;
      expect(fragment.clippedRect.x).toBeLessThanOrEqual(Math.max(0, bounds.x));
      const selection = mount(StandardShapeSelection, {
        props: { drawing, fragment, paneClip: layout.panes.body.clip },
        global: { plugins: [createAppI18n("en-US")] },
      });
      const element = selection.get('[data-shape-adjustment="0"]').element as HTMLElement;
      expect(parseFloat(element.style.left)).toBeCloseTo(world.x - fragment.clippedRect.x, 4);
      expect(parseFloat(element.style.top)).toBeCloseTo(world.y - fragment.clippedRect.y, 4);
      selection.unmount();
      const center = pictureFrameLocalToWorld(
        rect,
        37,
        standardShapeFlipPoint(drawing, { x: 90, y: 45 }),
      );
      expect(standardShapeContainsWorldPoint(geometry, drawing, rect, 37, center)).toBe(true);
      expect(shapeDrawingContainsWorldPoint(drawing, geometry, rect, center)).toBe(true);
    },
  );
  test("flipped one-sided arrow marker is painted/hit at dragged end, not the old end", () => {
    const drawing = {
      ...base,
      shapeGeometry: { preset: "line" as const },
      shapeLineEnds: { end: { kind: "triangle" as const } },
      shapeFlipX: true as const,
      shapeFlipY: true as const,
      fill: "transparent",
      rotation: 0,
    };
    const geometry = getStandardShapeGeometry(drawing.shapeGeometry, 180, 90)!,
      marker = getShapeEndPaint(drawing, geometry)[0]!;
    const local = standardShapeFlipPoint(drawing, {
      x: marker.bounds.x + marker.bounds.width / 2,
      y: marker.bounds.y + marker.bounds.height / 2,
    });
    expect(
      shapeDrawingContainsWorldPoint(drawing, geometry, rect, {
        x: rect.x + local.x,
        y: rect.y + local.y,
      }),
    ).toBe(true);
    const w = mount(DrawingContent, {
      props: { drawing },
      global: { plugins: [createAppI18n("en-US")] },
    });
    expect(w.get("[data-shape-line-end]").element.parentElement?.getAttribute("transform")).toBe(
      "translate(180 90) scale(-1 -1)",
    );
    w.unmount();
  });
  test("text rect follows reflected location while glyphs stay unmirrored", () => {
    const drawing = {
      ...base,
      text: "Readable Ω",
      shapeFlipX: true as const,
      shapeFlipY: true as const,
    };
    const geometry = getStandardShapeGeometry(drawing.shapeGeometry, 180, 90)!,
      textRect = geometry.textRect!;
    const w = mount(DrawingContent, {
      props: { drawing },
      global: { plugins: [createAppI18n("en-US")] },
    });
    const text = w.get("[data-standard-shape-text]");
    expect(text.text()).toBe("Readable Ω");
    expect(text.attributes("style")).toContain(`left: ${((180 - textRect.right) / 180) * 100}%`);
    expect(text.element.closest("svg")).toBeNull();
    expect(text.attributes("style")).not.toContain("scale");
    w.unmount();
  });
});
