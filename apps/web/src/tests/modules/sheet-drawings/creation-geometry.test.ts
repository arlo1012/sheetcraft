// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { evaluateShapePreset, flattenShapePath } from "@sheetcraft/core/shape-presets";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import {
  createSheetViewportLayout,
  type SheetViewportLayout,
} from "@sheetcraft/sheet-engine/viewport-layout";
import { getFloatingImageSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import {
  createShapeDrawingFromChoice,
  shapeCreationPointFromViewport,
  SHAPE_CREATION_LIMITS,
  type ShapeCreationPoint,
  type ShapeDrawingCreationRequest,
} from "../../../modules/sheet-drawings/shape-creation-geometry";
import {
  SHAPE_GALLERY,
  type ShapeGalleryChoice,
} from "../../../modules/sheet-drawings/shape-gallery";

const choices = SHAPE_GALLERY.flatMap((group) => group.items);
function choice(id: string): ShapeGalleryChoice {
  const result = choices.find((item) => item.id === id);
  if (!result) throw new Error(`Missing gallery choice ${id}`);
  return result;
}
const base: SheetGraphicDrawing = {
  id: "fresh-shape",
  kind: "shape",
  name: "Shape",
  anchor: { row: 0, column: 0 },
  offsetX: 8,
  offsetY: 8,
  width: 240,
  height: 120,
  text: "",
  shape: "rectangle",
  shapeGeometry: { preset: "rect" },
  fill: "#dbeafe",
  stroke: "#2563eb",
  strokeWidth: 1,
  color: "#1e3a8a",
  fontSize: 20,
  bold: false,
  italic: false,
  rotation: 37,
};
function viewport(
  options: {
    freeze?: { rows: number; columns: number };
    scroll?: ShapeCreationPoint;
    large?: boolean;
    merge?: boolean;
  } = {},
): SheetViewportLayout {
  const rowCount = options.large ? 4096 : 40,
    columnCount = options.large ? 1024 : 20;
  return createSheetViewportLayout({
    geometry: createSheetGeometry({ rowCount, columnCount, rowHeight: 24, columnWidth: 80 }),
    rows: createRowVisibilityIndex({ rowCount, defaultRowHeight: 24 }),
    viewportSize: { width: 600, height: 500 },
    freeze: options.freeze ?? { rows: 2, columns: 2 },
    bodyScrollPosition: options.scroll ?? { x: 40, y: 24 },
    ...(options.merge
      ? {
          mergeResolver: {
            getRangeAt: ({ row, column }: { row: number; column: number }) =>
              row >= 4 && row <= 5 && column >= 3 && column <= 4
                ? { start: { row: 4, column: 3 }, end: { row: 5, column: 4 } }
                : null,
          },
        }
      : {}),
  });
}
function create(
  id: string,
  start: ShapeCreationPoint = { x: 300.25, y: 250.75 },
  end: ShapeCreationPoint = { x: 430.75, y: 340.25 },
  options: Partial<ShapeDrawingCreationRequest> = {},
): SheetGraphicDrawing | null {
  return createShapeDrawingFromChoice({
    base,
    choice: choice(id),
    start,
    end,
    layout: viewport(),
    mode: "drag",
    ...options,
  });
}
function pathEnds(drawing: SheetGraphicDrawing, layout: SheetViewportLayout) {
  const rect = getFloatingImageSheetRect(drawing, layout)!;
  const path = evaluateShapePreset(drawing.shapeGeometry!, drawing.width, drawing.height);
  const points = path.paths
    .flatMap((entry) => flattenShapePath(entry))
    .find((p) => p.points.length > 1)!.points;
  const world = (p: ShapeCreationPoint): ShapeCreationPoint => ({
    x: rect.x + (drawing.shapeFlipX ? drawing.width - p.x : p.x),
    y: rect.y + (drawing.shapeFlipY ? drawing.height - p.y : p.y),
  });
  return { begin: world(points[0]!), end: world(points.at(-1)!) };
}
function expectPoint(actual: ShapeCreationPoint, expected: ShapeCreationPoint) {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
}

const quadrants = [
  { dx: 130.5, dy: 89.5, flipX: undefined, flipY: undefined },
  { dx: -130.5, dy: 89.5, flipX: true, flipY: undefined },
  { dx: 130.5, dy: -89.5, flipX: undefined, flipY: true },
  { dx: -130.5, dy: -89.5, flipX: true, flipY: true },
] as const;

describe("choice-to-drawing creation", () => {
  test("all 147 presets retain explicit standard identity and ordinary reverse bounding boxes", () => {
    const layout = viewport();
    for (const item of choices.filter((item) => item.kind === "preset")) {
      const drawing = create(
        item.id,
        { x: 430.75, y: 340.25 },
        { x: 300.25, y: 250.75 },
        { layout },
      )!;
      expect(drawing.kind).toBe("shape");
      expect(drawing.shapeGeometry).toEqual({ preset: item.preset });
      expect(drawing.shapeFlipX).toBeUndefined();
      expect(drawing.shapeFlipY).toBeUndefined();
      expect(drawing.shapeLineEnds).toBeUndefined();
      expect(drawing.rotation).toBe(0);
      expect(getFloatingImageSheetRect(drawing, layout)).toEqual({
        x: 300.25,
        y: 250.75,
        width: 130.5,
        height: 89.5,
      });
    }
  });

  test.each(quadrants)(
    "nine line intents preserve begin→end orientation for $dx,$dy",
    (quadrant) => {
      const layout = viewport(),
        start = { x: 300.25, y: 250.75 },
        end = { x: start.x + quadrant.dx, y: start.y + quadrant.dy };
      for (const item of choices.filter((item) => item.kind === "line")) {
        const drawing = create(item.id, start, end, { layout })!;
        expect(drawing).not.toBeNull();
        expect(drawing.shapeGeometry).toEqual({ preset: item.preset });
        expect(drawing.shapeFlipX).toBe(quadrant.flipX);
        expect(drawing.shapeFlipY).toBe(quadrant.flipY);
        expect(drawing.shapeLineEnds).toEqual(
          item.beginArrow === "triangle" || item.endArrow === "triangle"
            ? {
                ...(item.beginArrow === "triangle" ? { begin: { kind: "triangle" } } : {}),
                ...(item.endArrow === "triangle" ? { end: { kind: "triangle" } } : {}),
              }
            : undefined,
        );
        expect(drawing.fill).toBe("transparent");
        const ends = pathEnds(drawing, layout);
        expectPoint(ends.begin, start);
        expectPoint(ends.end, end);
      }
    },
  );

  test("choice transition removes incompatible feature fields without mutating its base", () => {
    const stale = {
      ...base,
      kind: "textBox" as const,
      shapeGeometry: { preset: "line" as const, adjustments: { adj: 50000 } },
      shapeLineEnds: { begin: { kind: "triangle" as const }, end: { kind: "triangle" as const } },
      textDirection: "vertical" as const,
      shapeFlipX: true as const,
      shapeFlipY: true as const,
    };
    const before = structuredClone(stale);
    for (const id of ["ellipse", "line", "textBox", "verticalTextBox"]) {
      const drawing = create(id, undefined, undefined, { base: stale })!;
      expect(drawing).not.toBe(stale);
      expect(drawing.anchor).not.toBe(stale.anchor);
      expect(drawing.id).toBe(stale.id);
      expect(drawing.shapeFlipX).toBeUndefined();
      expect(drawing.shapeFlipY).toBeUndefined();
      expect(drawing.shapeLineEnds).toBeUndefined();
      if (drawing.kind === "textBox") {
        expect(drawing.shapeGeometry).toBeUndefined();
        expect(drawing.fill).toBe("transparent");
        expect(drawing.strokeWidth).toBe(0);
        expect(drawing.textDirection).toBe(id === "verticalTextBox" ? "vertical" : undefined);
      } else expect(drawing.textDirection).toBeUndefined();
    }
    expect(stale).toEqual(before);
  });

  test.each([
    ["ellipse", 240, 120],
    ["textBox", 240, 120],
    ["verticalTextBox", 120, 240],
    ["arrow", 120, 1],
    ["elbowArrowConnector", 120, 80],
    ["curvedDoubleArrowConnector", 120, 80],
  ] as const)(
    "%s clicks use safe default %d×%d extents, including at the origin",
    (id, width, height) => {
      const layout = viewport();
      const drawing = create(
        id,
        { x: 0, y: 0 },
        { x: Number.NaN, y: 0 },
        { layout, mode: "click" },
      )!;
      expect(getFloatingImageSheetRect(drawing, layout)).toEqual({ x: 0, y: 0, width, height });
      expect(drawing.shapeFlipX).toBeUndefined();
      expect(drawing.shapeFlipY).toBeUndefined();
    },
  );

  test("merged-cell reanchoring keeps the fractional gesture origin", () => {
    const layout = viewport({ merge: true });
    const drawing = create("ellipse", { x: 330.5, y: 130.75 }, { x: 510, y: 260 }, { layout })!;
    expect(drawing.anchor).toEqual({ row: 4, column: 3 });
    expect(drawing.offsetX).toBe(90.5);
    expect(drawing.offsetY).toBe(34.75);
    expect(getFloatingImageSheetRect(drawing, layout)).toEqual({
      x: 330.5,
      y: 130.75,
      width: 179.5,
      height: 129.25,
    });
  });
});

describe("thin-axis and bounds contracts", () => {
  test.each([
    [
      { x: 300, y: 250 },
      { x: 430, y: 250 },
    ],
    [
      { x: 430, y: 250 },
      { x: 300, y: 250 },
    ],
    [
      { x: 300, y: 250 },
      { x: 300, y: 340 },
    ],
    [
      { x: 300, y: 340 },
      { x: 300, y: 250 },
    ],
    [
      { x: 300, y: 250 },
      { x: 430, y: 250.2 },
    ],
    [
      { x: 300, y: 250 },
      { x: 299.8, y: 340 },
    ],
  ] as const)("minimum axes keep both cursor endpoints within 0.5px: %o → %o", (start, end) => {
    const layout = viewport();
    for (const item of choices.filter((item) => item.kind === "line")) {
      const drawing = create(item.id, start, end, { layout })!;
      expect(drawing).not.toBeNull();
      expect(drawing.width).toBeGreaterThanOrEqual(1);
      expect(drawing.height).toBeGreaterThanOrEqual(1);
      const ends = pathEnds(drawing, layout);
      expect(Math.hypot(ends.begin.x - start.x, ends.begin.y - start.y)).toBeLessThanOrEqual(0.5);
      expect(Math.hypot(ends.end.x - end.x, ends.end.y - end.y)).toBeLessThanOrEqual(0.5);
    }
  });

  test("degenerate thin borders and too-small line drags reject instead of moving endpoints", () => {
    expect(create("arrow", { x: 0, y: 0 }, { x: 120, y: 0 })).toBeNull();
    expect(create("arrow", { x: 0, y: 0 }, { x: 0, y: 120 })).toBeNull();
    expect(create("arrow", { x: 300, y: 250 }, { x: 300, y: 250 })).toBeNull();
    expect(create("arrow", { x: 300, y: 250 }, { x: 300.1, y: 250 })).toBeNull();
    expect(create("arrow", { x: 300, y: 250 }, { x: 300.8, y: 250.8 })).not.toBeNull();
    expect(create("ellipse", { x: 300, y: 250 }, { x: 300, y: 250 })).toBeNull();
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1])(
    "rejects invalid coordinate %s in either endpoint/axis",
    (invalid) => {
      for (const id of ["ellipse", "arrow", "textBox"]) {
        for (const axis of ["x", "y"] as const) {
          expect(create(id, { x: 300, y: 250, [axis]: invalid })).toBeNull();
          expect(create(id, undefined, { x: 400, y: 350, [axis]: invalid })).toBeNull();
        }
      }
    },
  );

  test("rejects unavailable freehand choices and missing drag endpoint", () => {
    for (const id of ["curve", "freeform", "scribble"])
      for (const mode of ["click", "drag"] as const)
        expect(create(id, undefined, undefined, { mode })).toBeNull();
    expect(create("ellipse", undefined, undefined, { end: undefined })).toBeNull();
  });

  test("rejects outside-sheet points, default rectangles and coordinate budget overflow", () => {
    const layout = viewport();
    expect(create("ellipse", { x: 1600, y: 950 }, { x: 1601, y: 955 }, { layout })).toBeNull();
    expect(create("ellipse", { x: 1599, y: 959 }, undefined, { layout, mode: "click" })).toBeNull();
    const huge = { ...layout, getTotalSize: () => ({ width: 20_000_000, height: 20_000_000 }) };
    expect(
      create("ellipse", { x: SHAPE_CREATION_LIMITS.coordinate + 1, y: 300 }, undefined, {
        layout: huge,
        mode: "click",
      }),
    ).toBeNull();
    expect(
      create("ellipse", { x: SHAPE_CREATION_LIMITS.coordinate - 1, y: 300 }, undefined, {
        layout: huge,
        mode: "click",
      }),
    ).toBeNull();
  });

  test("extent maximum is inclusive; an excessive raw gesture is never silently clamped", () => {
    const layout = viewport({ large: true });
    for (const id of ["ellipse", "arrow", "textBox"]) {
      expect(create(id, { x: 300, y: 250 }, { x: 16684, y: 340 }, { layout })!.width).toBe(16384);
      expect(create(id, { x: 300, y: 250 }, { x: 16684.01, y: 340 }, { layout })).toBeNull();
      expect(
        create(id, { x: 300, y: 250 }, { x: 16684.01, y: 340 }, { layout, shiftKey: true }),
      ).toBeNull();
    }
  });
});

describe("Shift constraint", () => {
  test.each(quadrants)(
    "presets and text boxes pin the start and form a square for $dx,$dy",
    (q) => {
      const layout = viewport(),
        start = { x: 300, y: 250 };
      for (const id of ["ellipse", "textBox", "verticalTextBox"]) {
        const drawing = create(
          id,
          start,
          { x: start.x + q.dx, y: start.y + q.dy },
          { layout, shiftKey: true },
        )!;
        expect(getFloatingImageSheetRect(drawing, layout)).toEqual({
          x: q.dx < 0 ? 169.5 : 300,
          y: q.dy < 0 ? 119.5 : 250,
          width: 130.5,
          height: 130.5,
        });
        expect(drawing.shapeFlipX).toBeUndefined();
        expect(drawing.shapeFlipY).toBeUndefined();
      }
    },
  );

  test.each([
    [100, 2, 1, 0],
    [100, 90, Math.SQRT1_2, Math.SQRT1_2],
    [2, 100, 0, 1],
    [-100, 90, -Math.SQRT1_2, Math.SQRT1_2],
    [-100, 2, -1, 0],
    [-100, -90, -Math.SQRT1_2, -Math.SQRT1_2],
    [2, -100, 0, -1],
    [100, -90, Math.SQRT1_2, -Math.SQRT1_2],
  ] as const)("lines snap (%d,%d) to their nearest 45-degree direction", (dx, dy, sx, sy) => {
    const layout = viewport(),
      start = { x: 300, y: 250 },
      length = Math.hypot(dx, dy);
    const snapped = { x: start.x + length * sx, y: start.y + length * sy };
    for (const id of ["arrow", "elbowArrowConnector", "curvedArrowConnector"]) {
      const drawing = create(
        id,
        start,
        { x: start.x + dx, y: start.y + dy },
        { layout, shiftKey: true },
      )!;
      const ends = pathEnds(drawing, layout);
      expect(Math.hypot(ends.begin.x - start.x, ends.begin.y - start.y)).toBeLessThanOrEqual(0.5);
      expect(Math.hypot(ends.end.x - snapped.x, ends.end.y - snapped.y)).toBeLessThanOrEqual(
        0.50000001,
      );
      expect(drawing.shapeFlipX).toBe(sx < 0 ? true : undefined);
      expect(drawing.shapeFlipY).toBe(sy < 0 ? true : undefined);
    }
  });

  test("rejects a constrained negative origin instead of overriding the start pin", () => {
    expect(create("ellipse", { x: 10, y: 10 }, { x: 0, y: 60 }, { shiftKey: true })).toBeNull();
    expect(create("arrow", { x: 5, y: 5 }, { x: 0, y: 0 }, { shiftKey: true })).not.toBeNull();
  });
});

describe("viewport-to-continuous-sheet capture", () => {
  test.each([
    ["topLeft", { x: 20.25, y: 10.5 }, { x: 20.25, y: 10.5 }],
    ["top", { x: 200.25, y: 10.5 }, { x: 240.25, y: 10.5 }],
    ["left", { x: 20.25, y: 100.5 }, { x: 20.25, y: 124.5 }],
    ["body", { x: 200.25, y: 100.5 }, { x: 240.25, y: 124.5 }],
  ] as const)("%s reverses exactly its frozen/scroll translation", (paneId, point, expected) => {
    const layout = viewport();
    const mapped = shapeCreationPointFromViewport(point, layout)!;
    expect(mapped).toEqual({ paneId, point: expected });
    const delta = getPicturePaneTranslation(paneId, layout);
    expectPoint({ x: mapped.point.x + delta.x, y: mapped.point.y + delta.y }, point);
  });

  test("frozen boundaries are half-open and fractional clicks are never cell-snapped", () => {
    const layout = viewport();
    expect(shapeCreationPointFromViewport({ x: 159.99, y: 47.99 }, layout)!.paneId).toBe("topLeft");
    expect(shapeCreationPointFromViewport({ x: 160, y: 48 }, layout)).toEqual({
      paneId: "body",
      point: { x: 200, y: 72 },
    });
  });

  test("capture keeps its pane while moving through another pane or outside the viewport", () => {
    const layout = viewport();
    const point = { x: 140.25, y: 40.5 };
    expect(shapeCreationPointFromViewport(point, layout)).toEqual({ paneId: "topLeft", point });
    expect(shapeCreationPointFromViewport(point, layout, "body")).toEqual({
      paneId: "body",
      point: { x: 180.25, y: 64.5 },
    });
    expect(shapeCreationPointFromViewport({ x: 700, y: 550 }, layout)).toBeNull();
    expect(shapeCreationPointFromViewport({ x: 700, y: 550 }, layout, "body")).toEqual({
      paneId: "body",
      point: { x: 740, y: 574 },
    });
    expect(shapeCreationPointFromViewport({ x: -50, y: -50 }, layout, "body")).toBeNull();
    expect(shapeCreationPointFromViewport({ x: 2000, y: 2000 }, layout, "body")).toBeNull();
  });

  test("rejects headers, invalid coordinates, empty panes and non-cell page gaps", () => {
    const layout = viewport();
    for (const point of [
      { x: -1, y: 20 },
      { x: 20, y: -1 },
      { x: 600, y: 20 },
      { x: 20, y: 500 },
      { x: Number.NaN, y: 20 },
    ])
      expect(shapeCreationPointFromViewport(point, layout)).toBeNull();
    const gap = { ...layout, getCellAtViewportPoint: () => null };
    expect(shapeCreationPointFromViewport({ x: 200, y: 100 }, gap)).toBeNull();
    const misplacedHit = { ...layout, getCellAtViewportPoint: () => ({ row: 0, column: 0 }) };
    expect(shapeCreationPointFromViewport({ x: 200, y: 100 }, misplacedHit)).toBeNull();
    const plain = viewport({ freeze: { rows: 0, columns: 0 }, scroll: { x: 40, y: 24 } });
    expect(shapeCreationPointFromViewport({ x: 20, y: 20 }, plain, "topLeft")).toBeNull();
    expect(shapeCreationPointFromViewport({ x: 20.5, y: 20.25 }, plain)).toEqual({
      paneId: "body",
      point: { x: 60.5, y: 44.25 },
    });
  });

  test("a merged hit checks the whole cell range without changing continuous coordinates", () => {
    const layout = viewport({ merge: true });
    expect(shapeCreationPointFromViewport({ x: 290.5, y: 106.75 }, layout)).toEqual({
      paneId: "body",
      point: { x: 330.5, y: 130.75 },
    });
  });

  test("capture rejects an invalid pane identifier and preserves the coordinate budget", () => {
    const layout = viewport();
    expect(
      shapeCreationPointFromViewport({ x: 20, y: 20 }, layout, "missing" as FrozenPaneId),
    ).toBeNull();
    const huge = { ...layout, getTotalSize: () => ({ width: 20_000_000, height: 20_000_000 }) };
    expect(
      shapeCreationPointFromViewport({ x: SHAPE_CREATION_LIMITS.coordinate, y: 100 }, huge, "body"),
    ).toBeNull();
  });
});
