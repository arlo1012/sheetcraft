// @vitest-environment node
import { describe, expect, test } from "vitest";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { ShapeFreePath, ShapeFreePathCommand } from "@sheetcraft/core/shape-free-path";
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
  addFreeShapePoint,
  deleteFreeShapePoint,
  nearestFreeShapeSegment,
} from "../../../modules/sheet-drawings/free-shape-point-operations";
import {
  listFreeShapePoints,
  type FreeShapePointPosition,
} from "../../../modules/sheet-drawings/free-shape-point-layout";

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
const ordinaryViewport = viewport();
function path(): ShapeFreePath {
  return {
    tool: "curve",
    viewBox: { width: 100, height: 80 },
    commands: [
      ["M", 10, 15],
      ["L", 35, 20],
      ["Q", 40, 5, 55, 30],
      ["C", 62, 52, 77, 65, 90, 75],
      ["C", 93, 77, 96, 78, 100, 80],
    ],
    pointTypes: { 0: "straight", 2: "smooth", 3: "straight", 4: "smooth" },
  };
}
function drawing(overrides: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  return {
    id: "free-operation",
    kind: "shape",
    italic: false,
    name: "Curve",
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
function at(value: SheetGraphicDrawing, index: number, t: number): Point {
  const contour = commands(value),
    command = contour[index]!;
  let points = [end(contour[index - 1]!)];
  if (command[0] === "Z") points.push(end(contour[0]!));
  else
    for (let field = 1; field < command.length; field += 2)
      points.push({ x: command[field] as number, y: command[field + 1] as number });
  while (points.length > 1)
    points = points.slice(0, -1).map((point, position) => ({
      x: point.x + (points[position + 1]!.x - point.x) * t,
      y: point.y + (points[position + 1]!.y - point.y) * t,
    }));
  return points[0]!;
}
function world(value: SheetGraphicDrawing, point: Point, layout = ordinaryViewport): Point {
  return pictureFrameLocalToWorld(getFloatingImageSheetRect(value, layout)!, value.rotation, {
    x: value.shapeFlipX ? value.width - point.x : point.x,
    y: value.shapeFlipY ? value.height - point.y : point.y,
  });
}
function worldField(
  value: SheetGraphicDrawing,
  index: number,
  field: number,
  layout = ordinaryViewport,
): Point {
  const command = commands(value)[index]!;
  return world(value, { x: command[field] as number, y: command[field + 1] as number }, layout);
}
function expectPoint(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 7);
  expect(actual.y).toBeCloseTo(expected.y, 7);
}
function expectUnrelatedFields(next: SheetGraphicDrawing, source: SheetGraphicDrawing): void {
  for (const key of [
    "rotation",
    "shapeFlipX",
    "shapeFlipY",
    "text",
    "fill",
    "stroke",
    "shapeLineEnds",
    "bold",
    "name",
    "id",
  ] as const)
    expect(next[key]).toBe(source[key]);
  expect(next.shapePath!.tool).toBe(source.shapePath!.tool);
  expect(next.shapePath!.viewBox).toEqual({ width: next.width, height: next.height });
}

describe("exact authored free point insertion", () => {
  test.each([1, 2, 3])(
    "splits segment %d without any world-space line/curve jump",
    (commandIndex) => {
      for (const rotation of [0, 37, -90])
        for (const flipX of [false, true])
          for (const flipY of [false, true])
            for (const splitT of [0.25, 0.5, 0.75]) {
              const source = drawing({
                rotation,
                ...(flipX ? { shapeFlipX: true } : {}),
                ...(flipY ? { shapeFlipY: true } : {}),
              });
              const snapshot = structuredClone(source),
                next = addFreeShapePoint(source, commandIndex, viewport(), splitT)!;
              expect(next).toBeDefined();
              for (const t of [0, 0.1, 0.25, 0.4, 0.5, 0.75, 0.9, 1]) {
                const point =
                  t <= splitT
                    ? at(next, commandIndex, t / splitT)
                    : at(next, commandIndex + 1, (t - splitT) / (1 - splitT));
                expectPoint(world(next, point), world(source, at(source, commandIndex, t)));
              }
              for (const point of listFreeShapePoints(source).filter(
                (point) => point.role === "vertex",
              )) {
                const index =
                  point.commandIndex < commandIndex ? point.commandIndex : point.commandIndex + 1;
                expectPoint(
                  world(next, end(commands(next)[index]!)),
                  world(source, point.position),
                );
              }
              const types = source.shapePath!.pointTypes!;
              expect(next.shapePath!.pointTypes).toEqual(
                Object.fromEntries(
                  Object.entries(types).map(([index, type]) => [
                    Number(index) < commandIndex ? index : String(Number(index) + 1),
                    type,
                  ]),
                ),
              );
              expect(next.shapePath!.pointTypes?.[commandIndex]).toBeUndefined();
              expect(commands(next)).toHaveLength(commands(source).length + 1);
              expectUnrelatedFields(next, source);
              expect(source).toEqual(snapshot);
            }
    },
  );

  test("adds on the actual implicit closing edge and keeps its second half as Z", () => {
    const source = drawing({
      shapePath: {
        tool: "freeform",
        viewBox: { width: 100, height: 80 },
        commands: [["M", 10, 10], ["L", 90, 10], ["L", 50, 70], ["Z"]],
        pointTypes: { 0: "straight", 2: "smooth" },
      },
      shapeLineEnds: undefined,
      rotation: 37,
      shapeFlipX: true,
    });
    const next = addFreeShapePoint(source, 3, viewport())!;
    expect(next.shapePath!.commands.map((command) => command[0])).toEqual([
      "M",
      "L",
      "L",
      "L",
      "Z",
    ]);
    expect(listFreeShapePoints(next).filter((point) => point.role === "vertex")).toHaveLength(4);
    for (const t of [0, 0.25, 0.5, 0.75, 1])
      expectPoint(
        world(next, t <= 0.5 ? at(next, 3, t * 2) : at(next, 4, (t - 0.5) * 2)),
        world(source, at(source, 3, t)),
      );
    expect(next.shapePath!.pointTypes).toEqual(source.shapePath!.pointTypes);
  });

  test("splits an explicit cubic seam without adding its duplicate endpoint as a vertex", () => {
    const source = drawing({
      shapePath: {
        tool: "curve",
        viewBox: { width: 100, height: 80 },
        commands: [
          ["M", 10, 10],
          ["C", 30, 0, 60, 40, 90, 70],
          ["C", 70, 80, 5, 40, 10, 10],
          ["Z"],
        ],
        pointTypes: { 0: "smooth", 1: "straight" },
      },
      shapeLineEnds: undefined,
    });
    const next = addFreeShapePoint(source, 2, viewport())!;
    expect(listFreeShapePoints(next).filter((point) => point.role === "vertex")).toHaveLength(3);
    expect(next.shapePath!.pointTypes).toEqual({ 0: "smooth", 1: "straight" });
    expect(addFreeShapePoint(source, 3, viewport())).toBeUndefined();
  });
});

describe("deterministic free vertex deletion", () => {
  test("C→C preserves both surviving-node attached handles and remaps endpoint types", () => {
    const source = drawing({ rotation: 37, shapeFlipX: true, shapeFlipY: true });
    const snapshot = structuredClone(source),
      next = deleteFreeShapePoint(source, 3, viewport())!;
    expect(next).toBeDefined();
    expect(commands(next).map((command) => command[0])).toEqual(["M", "L", "Q", "C"]);
    expectPoint(worldField(next, 3, 1), worldField(source, 3, 1));
    expectPoint(worldField(next, 3, 3), worldField(source, 4, 3));
    expectPoint(worldField(next, 3, 5), worldField(source, 4, 5));
    for (const index of [0, 1, 2])
      expectPoint(
        world(next, end(commands(next)[index]!)),
        world(source, end(commands(source)[index]!)),
      );
    expect(next.shapePath!.pointTypes).toEqual({ 0: "straight", 2: "smooth", 3: "smooth" });
    expectUnrelatedFields(next, source);
    expect(source).toEqual(snapshot);
  });

  test("mixed segments keep the following authored controls and surviving vertices", () => {
    const source = drawing({ rotation: -90, shapeFlipY: true }),
      next = deleteFreeShapePoint(source, 2, viewport())!;
    expect(commands(next).map((command) => command[0])).toEqual(["M", "L", "C", "C"]);
    for (const field of [1, 3, 5])
      expectPoint(worldField(next, 2, field), worldField(source, 3, field));
    expectPoint(world(next, end(commands(next)[0]!)), world(source, end(commands(source)[0]!)));
    expectPoint(world(next, end(commands(next)[1]!)), world(source, end(commands(source)[1]!)));
    expectPoint(world(next, end(commands(next)[3]!)), world(source, end(commands(source)[4]!)));
    expect(next.shapePath!.pointTypes).toEqual({ 0: "straight", 2: "straight", 3: "smooth" });
  });

  test.each([0, 4])(
    "deletes open endpoint %d while keeping all other authored endpoints fixed",
    (vertexIndex) => {
      const source = drawing({ rotation: 37, shapeFlipX: true }),
        next = deleteFreeShapePoint(source, vertexIndex, viewport())!;
      const before = listFreeShapePoints(source).filter(
        (point) => point.role === "vertex" && point.vertexIndex !== vertexIndex,
      );
      const after = listFreeShapePoints(next).filter((point) => point.role === "vertex");
      expect(after).toHaveLength(before.length);
      after.forEach((point, index) =>
        expectPoint(world(next, point.position), world(source, before[index]!.position)),
      );
      expect(next.shapePath!.pointTypes).toEqual(
        vertexIndex === 0
          ? { 1: "smooth", 2: "straight", 3: "smooth" }
          : { 0: "straight", 2: "smooth", 3: "straight" },
      );
    },
  );

  test("deletes the one closed cubic seam and preserves both remaining vertices and their handles", () => {
    const source = drawing({
      shapePath: {
        tool: "curve",
        viewBox: { width: 100, height: 80 },
        commands: [
          ["M", 10, 10],
          ["C", 20, 0, 40, 0, 50, 10],
          ["C", 60, 20, 75, 50, 90, 70],
          ["C", 80, 80, 5, 40, 10, 10],
          ["Z"],
        ],
        pointTypes: { 0: "straight", 1: "smooth", 2: "straight" },
      },
      shapeLineEnds: undefined,
      rotation: 37,
      shapeFlipX: true,
      shapeFlipY: true,
    });
    const snapshot = structuredClone(source),
      next = deleteFreeShapePoint(source, 0, viewport())!;
    expect(commands(next).map((command) => command[0])).toEqual(["M", "C", "C", "Z"]);
    expect(listFreeShapePoints(next).filter((point) => point.role === "vertex")).toHaveLength(2);
    expectPoint(world(next, end(commands(next)[0]!)), world(source, end(commands(source)[1]!)));
    expectPoint(world(next, end(commands(next)[1]!)), world(source, end(commands(source)[2]!)));
    expectPoint(worldField(next, 2, 1), worldField(source, 3, 1));
    expectPoint(worldField(next, 2, 3), worldField(source, 1, 3));
    expect(next.shapePath!.pointTypes).toEqual({ 0: "smooth", 1: "straight" });
    expect(source).toEqual(snapshot);
  });

  test("deletes the implicit closing seam cyclically without creating another logical vertex", () => {
    const source = drawing({
      shapePath: {
        tool: "freeform",
        viewBox: { width: 100, height: 80 },
        commands: [["M", 10, 10], ["L", 90, 10], ["L", 50, 70], ["Z"]],
        pointTypes: { 1: "smooth", 2: "straight" },
      },
      shapeLineEnds: undefined,
    });
    const next = deleteFreeShapePoint(source, 0, viewport())!;
    expect(commands(next).map((command) => command[0])).toEqual(["M", "L", "L", "Z"]);
    expect(listFreeShapePoints(next).filter((point) => point.role === "vertex")).toHaveLength(2);
    expectPoint(world(next, end(commands(next)[0]!)), world(source, end(commands(source)[1]!)));
    expectPoint(world(next, end(commands(next)[1]!)), world(source, end(commands(source)[2]!)));
    expect(next.shapePath!.pointTypes).toEqual({ 0: "smooth", 1: "straight" });
  });

  test("coincident open endpoints remain independently deletable", () => {
    const source = drawing({
      shapePath: {
        tool: "curve",
        viewBox: { width: 100, height: 80 },
        commands: [
          ["M", 10, 10],
          ["C", 30, 0, 60, 40, 90, 70],
          ["C", 70, 80, 5, 40, 10, 10],
        ],
        pointTypes: { 0: "smooth", 1: "straight", 2: "smooth" },
      },
    });
    for (const index of [0, 2]) {
      const next = deleteFreeShapePoint(source, index, viewport())!;
      expect(next).toBeDefined();
      expect(listFreeShapePoints(next).filter((point) => point.role === "vertex")).toHaveLength(2);
      expect(next.shapePath!.commands.at(-1)?.[0]).toBe("C");
      expect(next.shapePath!.pointTypes).toEqual(
        index === 0 ? { 0: "straight", 1: "smooth" } : { 0: "smooth", 1: "straight" },
      );
    }
  });

  test("reanchors Add and Delete into merged cells without viewport or transform drift", () => {
    const source = drawing({ rotation: 37, shapeFlipY: true });
    for (const operation of [
      (layout: SheetViewportLayout) => addFreeShapePoint(source, 3, layout),
      (layout: SheetViewportLayout) => deleteFreeShapePoint(source, 3, layout),
    ]) {
      const ordinary = operation(viewport())!,
        merged = operation(viewport(true))!;
      expect(merged.anchor).toEqual({ row: 15, column: 6 });
      const before = listFreeShapePoints(ordinary),
        after = listFreeShapePoints(merged);
      expect(after).toHaveLength(before.length);
      after.forEach((point, index) =>
        expectPoint(
          world(merged, point.position, viewport(true)),
          world(ordinary, before[index]!.position),
        ),
      );
    }
  });
});

describe("bounded actual-path nearest segment lookup", () => {
  test("finds exact L and sampled/refined Q/C locations under rotation and both flips", () => {
    for (const rotation of [0, 37, -90])
      for (const flipX of [false, true])
        for (const flipY of [false, true])
          for (const index of [1, 2, 3]) {
            const source = drawing({
              rotation,
              ...(flipX ? { shapeFlipX: true } : {}),
              ...(flipY ? { shapeFlipY: true } : {}),
            });
            const result = nearestFreeShapeSegment(
              source,
              world(source, at(source, index, 0.37)),
              viewport(),
            )!;
            expect(result.commandIndex).toBe(index);
            expect(result.t).toBeCloseTo(0.37, 6);
            expect(result.distance).toBeLessThan(0.00001);
          }
  });

  test("returns the implicit closing edge and allows endpoint hits without adding an endpoint", () => {
    const source = drawing({
      shapePath: {
        tool: "freeform",
        viewBox: { width: 100, height: 80 },
        commands: [["M", 10, 10], ["L", 90, 10], ["L", 50, 70], ["Z"]],
      },
      shapeLineEnds: undefined,
      rotation: 37,
      shapeFlipX: true,
    });
    const result = nearestFreeShapeSegment(source, world(source, at(source, 3, 0.3)), viewport())!;
    expect(result.commandIndex).toBe(3);
    expect(result.t).toBeCloseTo(0.3, 8);
    expect(result.distance).toBeCloseTo(0, 8);
    const open = drawing(),
      endpointHit = nearestFreeShapeSegment(open, world(open, at(open, 1, 0)), viewport())!;
    expect(endpointHit.t).toBe(0);
    expect(
      addFreeShapePoint(open, endpointHit.commandIndex, viewport(), endpointHit.t),
    ).toBeUndefined();
  });
});

describe("free point operation rejection and command budgets", () => {
  test("rejects invalid parameters and non-editable geometry without mutating the source", () => {
    const source = drawing(),
      snapshot = structuredClone(source),
      layout = viewport();
    for (const t of [NaN, Infinity, -0.1, 0, 1, 1.1])
      expect(addFreeShapePoint(source, 3, layout, t)).toBeUndefined();
    expect(addFreeShapePoint(source, 1, layout, Number.MIN_VALUE)).toBeUndefined();
    for (const index of [-1, 0, 0.5, 99, NaN])
      expect(addFreeShapePoint(source, index, layout)).toBeUndefined();
    for (const index of [-1, 0.5, 99, NaN])
      expect(deleteFreeShapePoint(source, index, layout)).toBeUndefined();
    for (const invalid of [
      drawing({ kind: "textBox" }),
      drawing({ shapePath: undefined }),
      drawing({ shapeGeometry: { preset: "line" } }),
      drawing({ width: 0 }),
      drawing({ rotation: Infinity }),
      drawing({ height: 16_385 }),
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
    ]) {
      expect(addFreeShapePoint(invalid, 1, layout)).toBeUndefined();
      expect(deleteFreeShapePoint(invalid, 0, layout)).toBeUndefined();
      expect(nearestFreeShapeSegment(invalid, { x: 900, y: 600 }, layout)).toBeUndefined();
    }
    for (const invalid of [
      { x: NaN, y: 600 },
      { x: 900, y: Infinity },
      { x: 10_000_001, y: 600 },
    ])
      expect(nearestFreeShapeSegment(source, invalid, layout)).toBeUndefined();
    expect(source).toEqual(snapshot);
  });

  test("never removes the last two logical vertices or inserts into a zero-length edge", () => {
    const two = drawing({
      shapePath: {
        tool: "freeform",
        viewBox: { width: 100, height: 80 },
        commands: [
          ["M", 0, 0],
          ["L", 100, 80],
        ],
      },
    });
    for (const index of [0, 1])
      expect(deleteFreeShapePoint(two, index, viewport())).toBeUndefined();
    const seam = drawing({
      shapePath: {
        tool: "curve",
        viewBox: { width: 100, height: 80 },
        commands: [["M", 0, 0], ["C", 20, 0, 70, 40, 100, 80], ["C", 70, 80, 0, 40, 0, 0], ["Z"]],
      },
      shapeLineEnds: undefined,
    });
    for (const index of [0, 1])
      expect(deleteFreeShapePoint(seam, index, viewport())).toBeUndefined();
    const duplicate = drawing({
      shapePath: {
        tool: "freeform",
        viewBox: { width: 100, height: 80 },
        commands: [
          ["M", 0, 0],
          ["L", 0, 0],
          ["L", 100, 80],
        ],
      },
    });
    expect(addFreeShapePoint(duplicate, 1, viewport())).toBeUndefined();
  });

  test("subnormal-length authored lines still yield finite nearest-segment results", () => {
    const source = drawing({
      shapePath: {
        tool: "freeform",
        viewBox: { width: 100, height: 80 },
        commands: [
          ["M", 0, 0],
          ["L", Number.MIN_VALUE, 0],
          ["L", 100, 80],
        ],
      },
    });
    const result = nearestFreeShapeSegment(source, world(source, { x: 0, y: 0 }), viewport())!;
    expect(Number.isFinite(result.t)).toBe(true);
    expect(Number.isFinite(result.distance)).toBe(true);
  });

  test("rejects Add at the 2048-command limit while still permitting a bounded Delete", () => {
    const contour: ShapeFreePathCommand[] = [["M", 0, 0]];
    for (let index = 1; index < 2048; index++)
      contour.push(["L", index % 2 ? 100 : 0, index % 2 ? 80 : 0]);
    const source = drawing({
      shapePath: { tool: "scribble", viewBox: { width: 100, height: 80 }, commands: contour },
    });
    expect(addFreeShapePoint(source, 1, viewport())).toBeUndefined();
    expect(deleteFreeShapePoint(source, 1, viewport())!.shapePath!.commands).toHaveLength(2047);
    expect(source.shapePath!.commands).toHaveLength(2048);
  });
});
