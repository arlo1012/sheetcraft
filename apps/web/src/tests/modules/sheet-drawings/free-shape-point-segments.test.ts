// @vitest-environment node
import { describe, expect, test } from "vitest";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { createSheet } from "@sheetcraft/core/workbook";
import {
  MAX_SHAPE_FREE_PATH_COMMANDS,
  type ShapeFreePath,
  type ShapeFreePathCommand,
} from "@sheetcraft/core/shape-free-path";
import type { ShapeGroupDrawing, SheetGroupedGraphicDrawing } from "@sheetcraft/core/shape-group";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { getFloatingImageSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  createSheetViewportLayout,
  type SheetViewportLayout,
} from "@sheetcraft/sheet-engine/viewport-layout";
import { getFreeShapeGeometry } from "../../../modules/sheet-drawings/free-shape-geometry";
import {
  getFreeShapeSegmentType,
  setFreeShapeSegmentType,
} from "../../../modules/sheet-drawings/free-shape-point-operations";
import {
  listFreeShapePoints,
  type FreeShapePointPosition,
} from "../../../modules/sheet-drawings/free-shape-point-layout";
import { frameShapeView, shapeViewLayout } from "../../../modules/sheet-drawings/shape-view-layout";
import {
  resolveShapeDrawing,
  updateResolvedShapeDrawing,
} from "../../../modules/sheet-drawings/resolved-shape-drawing";
import {
  resolveShapeGroupProjection,
  updateResolvedShapeGroupLeaf,
} from "../../../modules/sheet-drawings/resolved-shape-group";

type Point = FreeShapePointPosition;
function viewport(merge = false): SheetViewportLayout {
  return createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 4096,
      columnCount: 1024,
      rowHeight: 24,
      columnWidth: 80,
    }),
    rows: createRowVisibilityIndex({ rowCount: 4096, defaultRowHeight: 24 }),
    viewportSize: { width: 600, height: 500 },
    freeze: { rows: 2, columns: 2 },
    bodyScrollPosition: { x: 40, y: 24 },
    ...(merge
      ? {
          mergeResolver: {
            getRangeAt: ({ row, column }: { row: number; column: number }) =>
              row >= 15 && row <= 30 && column >= 6 && column <= 15
                ? { start: { row: 15, column: 6 }, end: { row: 30, column: 15 } }
                : null,
          },
        }
      : {}),
  });
}
const layout = viewport();
function path(): ShapeFreePath {
  return {
    tool: "curve",
    viewBox: { width: 100, height: 80 },
    commands: [
      ["M", 10, 15],
      ["C", 15, 5, 25, 10, 35, 20],
      ["Q", 40, 5, 55, 30],
      ["C", 62, 52, 77, 65, 90, 75],
      ["C", 93, 77, 96, 78, 100, 80],
    ],
    pointTypes: { 0: "straight", 2: "smooth", 3: "straight", 4: "smooth" },
  };
}
function drawing(overrides: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  return {
    id: "segment-conversion",
    kind: "shape",
    name: "Curve",
    italic: false,
    anchor: { row: 20, column: 10 },
    offsetX: 10.25,
    offsetY: 10.75,
    width: 200,
    height: 160,
    rotation: 0,
    shape: "line",
    shapePath: path(),
    text: "Keep text",
    fill: "#dbeafe",
    stroke: "#2563eb",
    strokeWidth: 2,
    color: "#1e3a8a",
    fontSize: 20,
    bold: true,
    shapeLineEnds: { begin: { kind: "open" }, end: { kind: "triangle", length: "large" } },
    shapeStyle: {
      fill: {
        kind: "value",
        value: { kind: "solid", color: { kind: "rgb", rgb: "#dbeafe" }, opacity: 0.7 },
      },
    },
    ...overrides,
  };
}
function commands(value: SheetGraphicDrawing): readonly ShapeFreePathCommand[] {
  return getFreeShapeGeometry(value.shapePath, value.width, value.height)!.paths[0]!
    .commands as readonly ShapeFreePathCommand[];
}
function end(command: ShapeFreePathCommand): Point {
  return { x: command[command.length - 2] as number, y: command[command.length - 1] as number };
}
function world(value: SheetGraphicDrawing, point: Point, view = layout): Point {
  return pictureFrameLocalToWorld(getFloatingImageSheetRect(value, view)!, value.rotation, {
    x: value.shapeFlipX ? value.width - point.x : point.x,
    y: value.shapeFlipY ? value.height - point.y : point.y,
  });
}
function field(
  value: SheetGraphicDrawing,
  index: number,
  coordinate: number,
  view = layout,
): Point {
  const command = commands(value)[index]!;
  return world(
    value,
    { x: command[coordinate] as number, y: command[coordinate + 1] as number },
    view,
  );
}
function expectPoint(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 7);
  expect(actual.y).toBeCloseTo(expected.y, 7);
}
function expectPreserved(
  next: SheetGraphicDrawing,
  source: SheetGraphicDrawing,
  selected: number,
  view = layout,
): void {
  commands(source).forEach((command, index) => {
    if (command[0] === "Z") return;
    expectPoint(world(next, end(commands(next)[index]!), view), world(source, end(command), view));
    if (index === selected) return;
    expect(commands(next)[index]![0]).toBe(command[0]);
    for (let coordinate = 1; coordinate < command.length; coordinate += 2)
      expectPoint(field(next, index, coordinate, view), field(source, index, coordinate, view));
  });
  for (const key of [
    "id",
    "name",
    "rotation",
    "shapeFlipX",
    "shapeFlipY",
    "text",
    "fill",
    "stroke",
    "strokeWidth",
    "color",
    "fontSize",
    "bold",
    "italic",
    "shapeLineEnds",
    "shapeStyle",
  ] as const)
    expect(next[key]).toEqual(source[key]);
  expect(next.shapePath!.tool).toBe(source.shapePath!.tool);
  expect(next.shapePath!.viewBox).toEqual({ width: next.width, height: next.height });
}
function cubicSample(value: SheetGraphicDrawing, index: number, t: number, view = layout): Point {
  const contour = commands(value),
    command = contour[index]!;
  let points = [end(contour[index - 1]!)];
  for (let coordinate = 1; coordinate < command.length; coordinate += 2)
    points.push({ x: command[coordinate] as number, y: command[coordinate + 1] as number });
  while (points.length > 1)
    points = points.slice(0, -1).map((point, position) => ({
      x: point.x + (points[position + 1]!.x - point.x) * t,
      y: point.y + (points[position + 1]!.y - point.y) * t,
    }));
  return world(value, points[0]!, view);
}
function tangentPath(): ShapeFreePath {
  return {
    tool: "freeform",
    viewBox: { width: 150, height: 80 },
    commands: [
      ["M", 0, 30],
      ["C", 10, 10, 20, 30, 30, 30],
      ["L", 90, 30],
      ["C", 110, 30, 130, 70, 150, 80],
    ],
    pointTypes: { 0: "smooth", 1: "smooth", 2: "smooth", 3: "straight" },
  };
}

describe("selected authored segment conversion", () => {
  test("classifies actual L/Q/C and closing Z without treating M as an edge", () => {
    const source = drawing({
      shapePath: {
        ...path(),
        commands: [["M", 10, 15], ["L", 35, 20], ...path().commands.slice(2), ["Z"]],
      },
    });
    expect([0, 1, 2, 3, 4, 5].map((index) => getFreeShapeSegmentType(source, index))).toEqual([
      undefined,
      "straight",
      "curved",
      "curved",
      "curved",
      "straight",
    ]);
    for (const index of [-1, 0.5, NaN, Infinity, 99])
      expect(getFreeShapeSegmentType(source, index)).toBeUndefined();
  });

  test.each([2, 3])(
    "Q/C edge %d becomes its chord, with every old vertex and true neighboring control fixed",
    (selected) => {
      for (const rotation of [0, 37])
        for (const shapeFlipX of [undefined, true] as const)
          for (const shapeFlipY of [undefined, true] as const) {
            const source = drawing({ rotation, shapeFlipX, shapeFlipY }),
              snapshot = structuredClone(source);
            const next = setFreeShapeSegmentType(source, selected, "straight", layout)!;
            expect(next).toBeDefined();
            expect(commands(next)[selected]![0]).toBe("L");
            expect(commands(next)).toHaveLength(commands(source).length);
            expect(next.width).not.toBe(source.width);
            expectPreserved(next, source, selected);
            const beforeStart = world(source, end(commands(source)[selected - 1]!)),
              beforeEnd = world(source, end(commands(source)[selected]!));
            for (const t of [0, 0.25, 0.5, 0.75, 1])
              expectPoint(cubicSample(next, selected, t), {
                x: beforeStart.x + (beforeEnd.x - beforeStart.x) * t,
                y: beforeStart.y + (beforeEnd.y - beforeStart.y) * t,
              });
            expect(source).toEqual(snapshot);
          }
    },
  );

  test("line uses adjacent cubic tangent directions and chord/3 lengths without borrowing or moving controls", () => {
    const source = drawing({
      width: 150,
      height: 80,
      shapePath: {
        ...tangentPath(),
        commands: [
          ["M", 0, 30],
          ["C", 10, 10, 20, 10, 30, 30],
          ["L", 90, 30],
          ["C", 110, 50, 130, 70, 150, 80],
        ],
      },
    });
    const next = setFreeShapeSegmentType(source, 2, "curved", layout)!;
    expectPreserved(next, source, 2);
    const first = { x: 30 + 20 / Math.sqrt(5), y: 30 + 40 / Math.sqrt(5) };
    const second = { x: 90 - 20 / Math.sqrt(2), y: 30 - 20 / Math.sqrt(2) };
    expectPoint(field(next, 2, 1), world(source, first));
    expectPoint(field(next, 2, 3), world(source, second));
    expect(next.shapePath!.pointTypes).toEqual({ 0: "smooth", 3: "straight" });
  });

  test("quadratic neighbors supply degree-independent endpoint tangent directions", () => {
    const source = drawing({
      width: 150,
      height: 80,
      shapePath: {
        ...tangentPath(),
        commands: [
          ["M", 0, 30],
          ["Q", 20, 10, 30, 30],
          ["L", 90, 30],
          ["Q", 110, 50, 150, 80],
        ],
      },
    });
    const next = setFreeShapeSegmentType(source, 2, "curved", layout)!;
    expectPreserved(next, source, 2);
    expectPoint(
      field(next, 2, 1),
      world(source, { x: 30 + 20 / Math.sqrt(5), y: 30 + 40 / Math.sqrt(5) }),
    );
    expectPoint(
      field(next, 2, 3),
      world(source, { x: 90 - 20 / Math.sqrt(2), y: 30 - 20 / Math.sqrt(2) }),
    );
  });

  test("collapsed adjacent endpoint control falls back to its next distinct control/node", () => {
    const source = drawing({
      width: 150,
      height: 80,
      shapePath: {
        ...tangentPath(),
        commands: [
          ["M", 0, 30],
          ["C", 10, 10, 30, 30, 30, 30],
          ["L", 90, 30],
          ["C", 90, 30, 110, 50, 150, 80],
        ],
      },
    });
    const next = setFreeShapeSegmentType(source, 2, "curved", layout)!;
    expectPreserved(next, source, 2);
    expectPoint(
      field(next, 2, 1),
      world(source, { x: 30 + 20 / Math.sqrt(2), y: 30 + 20 / Math.sqrt(2) }),
    );
    expectPoint(
      field(next, 2, 3),
      world(source, { x: 90 - 20 / Math.sqrt(2), y: 30 - 20 / Math.sqrt(2) }),
    );
  });

  test.each([1, 2])(
    "open endpoint edge %d uses its chord where the adjacent segment is missing",
    (selected) => {
      const source = drawing({
        width: 120,
        height: 80,
        shapePath: {
          tool: "freeform",
          viewBox: { width: 120, height: 80 },
          commands: [
            ["M", 10, 20],
            ["L", 50, 20],
            ["L", 80, 60],
          ],
        },
      });
      const next = setFreeShapeSegmentType(source, selected, "curved", layout)!;
      expectPreserved(next, source, selected);
      const start = end(commands(source)[selected - 1]!),
        finish = end(commands(source)[selected]!);
      const handle = selected === 1 ? 1 : 3;
      expectPoint(
        field(next, selected, handle),
        world(source, {
          x:
            selected === 1
              ? start.x + (finish.x - start.x) / 3
              : finish.x - (finish.x - start.x) / 3,
          y:
            selected === 1
              ? start.y + (finish.y - start.y) / 3
              : finish.y - (finish.y - start.y) / 3,
        }),
      );
    },
  );

  test("a two-node path becomes an editable collinear cubic with exactly the same outline", () => {
    const source = drawing({
      rotation: 37,
      shapeFlipX: true,
      shapeFlipY: true,
      shapePath: {
        tool: "freeform",
        viewBox: { width: 100, height: 80 },
        commands: [
          ["M", 10, 15],
          ["L", 90, 70],
        ],
        pointTypes: { 0: "smooth", 1: "straight" },
      },
    });
    const next = setFreeShapeSegmentType(source, 1, "curved", layout)!;
    expect(commands(next)[1]![0]).toBe("C");
    expect(listFreeShapePoints(next).filter((p) => p.role !== "vertex")).toHaveLength(2);
    expect(next.shapePath!.pointTypes).toEqual(source.shapePath!.pointTypes);
    for (const t of [0, 0.2, 0.5, 0.8, 1])
      expectPoint(cubicSample(next, 1, t), cubicSample(source, 1, t));
    expectPreserved(next, source, 1);
  });

  test("clears only conflicting endpoint constraints and retains compatible smooth/straight plus unrelated types", () => {
    const source = drawing({ width: 150, height: 80, shapePath: tangentPath() });
    const next = setFreeShapeSegmentType(source, 2, "curved", layout)!;
    expect(next.shapePath!.pointTypes).toEqual({ 0: "smooth", 2: "smooth", 3: "straight" });
    const straight = setFreeShapeSegmentType(next, 2, "straight", layout)!;
    expect(straight.shapePath!.pointTypes).toEqual(next.shapePath!.pointTypes);
    expectPreserved(straight, next, 2);
    const unequal = drawing({
      width: 150,
      height: 80,
      shapePath: { ...tangentPath(), pointTypes: { 1: "straight", 2: "smooth", 3: "straight" } },
    });
    expect(setFreeShapeSegmentType(unequal, 2, "curved", layout)!.shapePath!.pointTypes).toEqual(
      unequal.shapePath!.pointTypes,
    );
  });

  test("curve → chord clears incompatible endpoint types while leaving neighboring curves exactly unchanged", () => {
    const source = drawing({
      width: 150,
      height: 80,
      shapePath: {
        ...tangentPath(),
        commands: [
          ["M", 0, 30],
          ["C", 10, 10, 20, 10, 30, 30],
          ["C", 45, 60, 80, 0, 90, 30],
          ["C", 110, 50, 130, 70, 150, 80],
        ],
        pointTypes: { 0: "smooth", 1: "straight", 2: "smooth", 3: "straight" },
      },
    });
    const next = setFreeShapeSegmentType(source, 2, "straight", layout)!;
    expect(next.shapePath!.pointTypes).toEqual({ 0: "smooth", 3: "straight" });
    expectPreserved(next, source, 2);
    for (const index of [1, 3])
      for (const t of [0, 0.17, 0.5, 0.81, 1])
        expectPoint(cubicSample(next, index, t), cubicSample(source, index, t));
  });

  test("matching type requests are exact identity no-ops, preserving source frames and sparse point types", () => {
    const source = drawing({
      shapePath: {
        ...path(),
        commands: [["M", 10, 15], ["L", 35, 20], ...path().commands.slice(2), ["Z"]],
      },
    });
    for (const [index, type] of [
      [1, "straight"],
      [2, "curved"],
      [3, "curved"],
      [5, "straight"],
    ] as const)
      expect(setFreeShapeSegmentType(source, index, type, layout)).toBe(source);
  });

  test("curve after straight is deterministic authored reconstruction without a hidden old-curve cache", () => {
    const source = drawing(),
      chord = setFreeShapeSegmentType(source, 3, "straight", layout)!;
    const next = setFreeShapeSegmentType(chord, 3, "curved", layout)!;
    expectPreserved(next, chord, 3);
    expect(commands(next)[3]![0]).toBe("C");
    expect(cubicSample(next, 3, 0.5)).not.toEqual(cubicSample(source, 3, 0.5));
    expect(setFreeShapeSegmentType(chord, 3, "curved", layout)).toEqual(next);
  });
});

describe("closing edges and canonical placement", () => {
  test("closing Z becomes C+Z to initial M, retains the same logical vertices and canonical seam types", () => {
    const source = drawing({
      rotation: 37,
      shapeFlipX: true,
      shapeFlipY: true,
      shapeLineEnds: undefined,
      shapePath: {
        tool: "freeform",
        viewBox: { width: 100, height: 80 },
        commands: [["M", 10, 30], ["L", 50, 0], ["L", 90, 30], ["Z"]],
        pointTypes: { 0: "straight", 1: "smooth", 2: "straight" },
      },
    });
    const snapshot = structuredClone(source),
      next = setFreeShapeSegmentType(source, 3, "curved", layout)!;
    expect(next.shapePath!.commands.map((c) => c[0])).toEqual(["M", "L", "L", "C", "Z"]);
    expect(listFreeShapePoints(next).filter((p) => p.role === "vertex")).toHaveLength(3);
    expectPoint(world(next, end(commands(next)[3]!)), world(source, end(commands(source)[0]!)));
    expect(next.shapePath!.pointTypes).toEqual(source.shapePath!.pointTypes);
    expect(next.shapePath!.pointTypes?.[3]).toBeUndefined();
    expect(getFreeShapeSegmentType(next, 3)).toBe("curved");
    expect(getFreeShapeSegmentType(next, 4)).toBeUndefined();
    expectPreserved(next, source, 3);
    expect(source).toEqual(snapshot);
  });

  test("explicit authored seam converts in place, aliases its type to M and never exposes degenerate Z", () => {
    const source = drawing({
      rotation: 37,
      shapeFlipX: true,
      shapeLineEnds: undefined,
      shapePath: {
        tool: "curve",
        viewBox: { width: 100, height: 80 },
        commands: [["M", 10, 10], ["C", 30, 0, 60, 40, 90, 70], ["L", 10, 10], ["Z"]],
        pointTypes: { 2: "straight", 1: "straight" },
      },
    });
    const next = setFreeShapeSegmentType(source, 2, "curved", layout)!;
    expect(commands(next).map((c) => c[0])).toEqual(["M", "C", "C", "Z"]);
    expect(next.shapePath!.pointTypes).toEqual({ 0: "straight", 1: "straight" });
    expect(listFreeShapePoints(next).filter((p) => p.role === "vertex")).toHaveLength(2);
    expect(getFreeShapeSegmentType(next, 3)).toBeUndefined();
    expect(setFreeShapeSegmentType(next, 3, "curved", layout)).toBeUndefined();
    expectPreserved(next, source, 2);
    const chord = setFreeShapeSegmentType(next, 2, "straight", layout)!;
    expect(commands(chord).map((c) => c[0])).toEqual(["M", "C", "L", "Z"]);
    expectPreserved(chord, next, 2);
  });

  test("merged-root reanchoring produces the same world geometry as an ordinary layout", () => {
    const source = drawing({ rotation: 37, shapeFlipY: true });
    const ordinary = setFreeShapeSegmentType(source, 3, "straight", layout)!;
    const merged = setFreeShapeSegmentType(source, 3, "straight", viewport(true))!;
    expect(merged.anchor).toEqual({ row: 15, column: 6 });
    listFreeShapePoints(ordinary).forEach((point, index) =>
      expectPoint(
        world(merged, listFreeShapePoints(merged)[index]!.position, viewport(true)),
        world(ordinary, point.position),
      ),
    );
  });

  test("framed negative-space views use the owned metrics snapshot and inverse without losing old world vertices or style", () => {
    const metrics = createPictureSheetMetrics(createSheet("Segments", "sheet"));
    const source = frameShapeView(
      drawing({
        anchor: { row: 0, column: 0 },
        offsetX: -80,
        offsetY: -50,
        rotation: 37,
        shapeFlipX: true,
        shapeFlipY: true,
      }),
      metrics,
      "fixed",
    );
    source.shapeProperties = { altTitle: "Synthetic curve", locked: false, printObject: false };
    const snapshot = structuredClone(source),
      resolved = resolveShapeDrawing(source, metrics);
    const view = resolved.view as SheetGraphicDrawing,
      canonicalLayout = shapeViewLayout(layout, metrics);
    expect(setFreeShapeSegmentType(view, 3, "straight", canonicalLayout)).toBeUndefined();
    const next = setFreeShapeSegmentType(view, 3, "straight", canonicalLayout, { metrics })!;
    expectPreserved(next, view, 3, canonicalLayout);
    const authored = updateResolvedShapeDrawing(resolved, next, metrics);
    const after = resolveShapeDrawing(authored, metrics).view as SheetGraphicDrawing;
    expectPreserved(after, view, 3, canonicalLayout);
    expect("shapeFrame" in authored).toBe(true);
    expect("anchor" in authored).toBe(false);
    if (!("shapeFrame" in authored)) throw new Error("Expected a canonical framed shape.");
    expect(authored.shapeProperties).toEqual(source.shapeProperties);
    expect(source).toEqual(snapshot);
  });

  test("group-owned subpixel views retain neighboring controls through inverse placement using exact metrics", () => {
    const metrics = createPictureSheetMetrics(createSheet("Owned", "sheet"));
    const {
      anchor: _a,
      offsetX: _x,
      offsetY: _y,
      width: _w,
      height: _h,
      ...appearance
    } = drawing({ shapeFlipX: true, shapeFlipY: true });
    const leaf: SheetGroupedGraphicDrawing = {
      ...appearance,
      kind: "shape",
      shapeProperties: { altTitle: "Synthetic curve", locked: false, printObject: false },
      rotation: 0,
      groupFrame: {
        kind: "shape-group-local-v1",
        rect: { xRatio: -0.25, yRatio: -0.25, widthRatio: 0.0025, heightRatio: 0.0025 },
      },
    };
    const source: ShapeGroupDrawing = {
      kind: "shapeGroup",
      id: "root",
      name: "Root",
      rotation: 37,
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: { mode: "fixed", x: -40, y: -30, size: { width: 200, height: 200 } },
      },
      members: [leaf],
    };
    const snapshot = structuredClone(source),
      resolved = resolveShapeGroupProjection(source, metrics).leaves[0]!;
    const view = resolved.view!,
      canonicalLayout = shapeViewLayout(layout, metrics);
    expect(view.width).toBe(0.5);
    const next = setFreeShapeSegmentType(view, 3, "straight", canonicalLayout, { metrics })!;
    expectPreserved(next, view, 3, canonicalLayout);
    const authored = updateResolvedShapeGroupLeaf(resolved, next, metrics),
      after = resolveShapeGroupProjection(authored, metrics).leaves[0]!.view!;
    expectPreserved(after, view, 3, canonicalLayout);
    expect(after.rotation).toBe(37);
    expect(authored.members[0]!.shapeProperties).toEqual(leaf.shapeProperties);
    expect(source).toEqual(snapshot);
  });
});

describe("bounded segment conversion rejection", () => {
  test("rejects bad indices, zero chords, nonfinite paths and noneditable or invalid placement", () => {
    const source = drawing(),
      snapshot = structuredClone(source);
    for (const index of [-1, 0, 0.5, NaN, Infinity, 99])
      expect(setFreeShapeSegmentType(source, index, "straight", layout)).toBeUndefined();
    for (const invalid of [
      drawing({ kind: "textBox" }),
      drawing({ shapePath: undefined }),
      drawing({ shapeGeometry: { preset: "line" } }),
      drawing({ width: 0 }),
      drawing({ height: 16_385 }),
      drawing({ rotation: Infinity }),
      drawing({ offsetX: -1 }),
      drawing({
        shapePath: {
          ...path(),
          commands: [
            ["M", 0, 0],
            ["L", NaN, 1],
          ],
        },
      }),
      drawing({
        shapePath: {
          ...path(),
          commands: [
            ["M", 0, 0],
            ["L", Infinity, 1],
          ],
        },
      }),
      drawing({
        shapePath: {
          ...path(),
          commands: [
            ["M", 0, 0],
            ["L", 101, 1],
          ],
        },
      }),
      drawing({
        shapePath: {
          ...path(),
          commands: [
            ["M", 10, 10],
            ["C", 20, 5, 30, 5, 10, 10],
            ["L", 80, 60],
          ],
        },
      }),
    ]) {
      expect(setFreeShapeSegmentType(invalid, 1, "straight", layout)).toBeUndefined();
      expect(setFreeShapeSegmentType(invalid, 1, "curved", layout)).toBeUndefined();
    }
    const duplicate = drawing({
      shapePath: {
        ...path(),
        commands: [
          ["M", 10, 10],
          ["L", 10, 10],
          ["L", 80, 60],
        ],
      },
    });
    expect(getFreeShapeSegmentType(duplicate, 1)).toBeUndefined();
    expect(setFreeShapeSegmentType(duplicate, 1, "curved", layout)).toBeUndefined();
    expect(setFreeShapeSegmentType(source, 1, "bad" as "curved", layout)).toBeUndefined();
    expect(source).toEqual(snapshot);
  });

  test("rejects a nonrepresentable expanded bound without mutating the source or clamping controls", () => {
    const source = drawing({
      width: 16384,
      height: 16384,
      shapePath: {
        tool: "curve",
        viewBox: { width: 16384, height: 16384 },
        commands: [
          ["M", 0, 0],
          ["C", 0, 0, 16384, 0, 16384, 16384],
          ["L", 0, 16384],
          ["C", 0, 16384, 0, 0, 0, 0],
        ],
      },
    });
    const snapshot = structuredClone(source);
    expect(setFreeShapeSegmentType(source, 2, "curved", layout)).toBeUndefined();
    expect(source).toEqual(snapshot);
  });

  test("command limit permits in-place conversion and exact no-op but rejects only the extra closing C", () => {
    const contour: ShapeFreePathCommand[] = [["M", 0, 0]];
    for (let index = 1; index < MAX_SHAPE_FREE_PATH_COMMANDS - 1; index++)
      contour.push(["L", index % 2 ? 100 : 10, index % 2 ? 80 : 10]);
    contour.push(["Z"]);
    const source = drawing({
      shapePath: { tool: "scribble", viewBox: { width: 100, height: 80 }, commands: contour },
      shapeLineEnds: undefined,
    });
    expect(
      setFreeShapeSegmentType(source, MAX_SHAPE_FREE_PATH_COMMANDS - 1, "curved", layout),
    ).toBeUndefined();
    expect(
      setFreeShapeSegmentType(source, MAX_SHAPE_FREE_PATH_COMMANDS - 1, "straight", layout),
    ).toBe(source);
    expect(setFreeShapeSegmentType(source, 1, "curved", layout)!.shapePath!.commands).toHaveLength(
      MAX_SHAPE_FREE_PATH_COMMANDS,
    );
    const below = drawing({
      shapePath: { ...source.shapePath!, commands: [...contour.slice(0, -2), ["Z"]] },
      shapeLineEnds: undefined,
    });
    expect(
      setFreeShapeSegmentType(below, MAX_SHAPE_FREE_PATH_COMMANDS - 2, "curved", layout)!.shapePath!
        .commands,
    ).toHaveLength(MAX_SHAPE_FREE_PATH_COMMANDS);
    const excessive = drawing({
      shapePath: {
        ...source.shapePath!,
        commands: [...contour.slice(0, -1), ["L", 20, 20], ["Z"]],
      },
    });
    expect(getFreeShapeSegmentType(excessive, 1)).toBeUndefined();
    expect(setFreeShapeSegmentType(excessive, 1, "curved", layout)).toBeUndefined();
    expect(source.shapePath!.commands).toHaveLength(MAX_SHAPE_FREE_PATH_COMMANDS);
  });
});
