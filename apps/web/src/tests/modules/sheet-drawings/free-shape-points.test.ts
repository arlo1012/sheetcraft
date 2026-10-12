// @vitest-environment node
import { describe, expect, test } from "vitest";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { ShapeFreePath, ShapeFreePathCommand } from "@sheetcraft/core/shape-free-path";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  createSheetViewportLayout,
  type SheetViewportLayout,
} from "@sheetcraft/sheet-engine/viewport-layout";
import {
  listFreeShapePoints,
  moveFreeShapePoint,
  toggleClosedFreeShape,
  setFreeShapePointType,
  replaceFreeShapeCommands,
  type FreeShapePoint,
  type FreeShapePointDescriptor,
  type FreeShapePointPosition,
} from "../../../modules/sheet-drawings/free-shape-point-layout";

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
function path(closed = false): ShapeFreePath {
  return {
    tool: "curve",
    viewBox: { width: 100, height: 80 },
    commands: [
      ["M", 10, 15],
      ["L", 35, 20],
      ["Q", 40, 5, 55, 30],
      ["C", 62, 52, 77, 65, 90, 75],
      ["C", 93, 77, 96, 78, 100, 80],
      ...(closed ? [["Z"] as const] : []),
    ],
  };
}
function drawing(overrides: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  return {
    id: "free-shape",
    kind: "shape",
    name: "Curve",
    anchor: { row: 20, column: 10 },
    offsetX: 10.25,
    offsetY: 10.75,
    width: 200,
    height: 160,
    rotation: 0,
    text: "Keep text",
    shape: "line",
    shapePath: path(),
    fill: "#dbeafe",
    stroke: "#2563eb",
    strokeWidth: 2,
    color: "#1e3a8a",
    fontSize: 20,
    bold: true,
    italic: true,
    shapeLineEnds: { begin: { kind: "open" }, end: { kind: "triangle", length: "large" } },
    ...overrides,
  };
}
function key(point: FreeShapePointDescriptor): string {
  return `${point.commandIndex}:${point.role}`;
}
function worldPoint(
  value: SheetGraphicDrawing,
  point: FreeShapePoint,
  layout: SheetViewportLayout,
): FreeShapePointPosition {
  return pictureFrameLocalToWorld(getFloatingImageSheetRect(value, layout)!, value.rotation, {
    x: value.shapeFlipX ? value.width - point.position.x : point.position.x,
    y: value.shapeFlipY ? value.height - point.position.y : point.position.y,
  });
}
function worldPoints(
  value: SheetGraphicDrawing,
  layout: SheetViewportLayout,
): Map<string, FreeShapePointPosition> {
  return new Map(
    listFreeShapePoints(value).map((point) => [key(point), worldPoint(value, point, layout)]),
  );
}
function expectPoint(actual: FreeShapePointPosition, expected: FreeShapePointPosition): void {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
}
function plus(
  point: FreeShapePointPosition,
  delta: FreeShapePointPosition,
): FreeShapePointPosition {
  return { x: point.x + delta.x, y: point.y + delta.y };
}
function expectMoved(
  source: SheetGraphicDrawing,
  descriptor: FreeShapePointDescriptor,
  delta: FreeShapePointPosition,
  affected: readonly string[],
  layout = viewport(),
): SheetGraphicDrawing {
  const before = worldPoints(source, layout),
    snapshot = structuredClone(source);
  const target = plus(before.get(key(descriptor)) ?? before.get("0:vertex")!, delta);
  const next = moveFreeShapePoint(source, descriptor, target, layout)!;
  expect(next).toBeDefined();
  const after = worldPoints(next, layout);
  for (const [name, original] of before)
    expectPoint(after.get(name)!, affected.includes(name) ? plus(original, delta) : original);
  expect(next.rotation).toBe(source.rotation);
  expect(next.shapeFlipX).toBe(source.shapeFlipX);
  expect(next.shapeFlipY).toBe(source.shapeFlipY);
  expect(next.shapeLineEnds).toBe(source.shapeLineEnds);
  expect(next.shapePath!.tool).toBe(source.shapePath!.tool);
  expect(next.shapePath!.viewBox).toEqual({ width: next.width, height: next.height });
  expect(next.text).toBe(source.text);
  expect(next.fill).toBe(source.fill);
  expect(next.stroke).toBe(source.stroke);
  expect(source).toEqual(snapshot);
  return next;
}

describe("authored free shape point descriptors", () => {
  test("lists real M/L/Q/C vertices and controls in actual unflipped local coordinates", () => {
    const points = listFreeShapePoints(
      drawing({ rotation: 37, shapeFlipX: true, shapeFlipY: true }),
    );
    expect(points).toEqual([
      { commandIndex: 0, role: "vertex", vertexIndex: 0, position: { x: 20, y: 30 } },
      { commandIndex: 1, role: "vertex", vertexIndex: 1, position: { x: 70, y: 40 } },
      { commandIndex: 2, role: "vertex", vertexIndex: 2, position: { x: 110, y: 60 } },
      { commandIndex: 2, role: "control1", vertexIndex: 1, position: { x: 80, y: 10 } },
      { commandIndex: 3, role: "vertex", vertexIndex: 3, position: { x: 180, y: 150 } },
      { commandIndex: 3, role: "control1", vertexIndex: 2, position: { x: 124, y: 104 } },
      { commandIndex: 3, role: "control2", vertexIndex: 3, position: { x: 154, y: 130 } },
      { commandIndex: 4, role: "vertex", vertexIndex: 4, position: { x: 200, y: 160 } },
      { commandIndex: 4, role: "control1", vertexIndex: 3, position: { x: 186, y: 154 } },
      { commandIndex: 4, role: "control2", vertexIndex: 4, position: { x: 192, y: 156 } },
    ]);
    expect(listFreeShapePoints(drawing({ shapePath: path(true) }))).toEqual(points);
    expect(Object.isFrozen(points)).toBe(true);
    for (const point of points) {
      expect(Object.isFrozen(point)).toBe(true);
      expect(Object.isFrozen(point.position)).toBe(true);
    }
  });
});

describe("free shape point world-space editing", () => {
  test.each([0, 37, -90, 180])(
    "cubic nodes carry their two attached controls at %d degrees with all flips",
    (rotation) => {
      for (const flipX of [false, true])
        for (const flipY of [false, true]) {
          const source = drawing({
            rotation,
            ...(flipX ? { shapeFlipX: true } : {}),
            ...(flipY ? { shapeFlipY: true } : {}),
          });
          expectMoved(source, { commandIndex: 3, role: "vertex" }, { x: -36.25, y: 45.75 }, [
            "3:vertex",
            "3:control2",
            "4:control1",
          ]);
        }
    },
  );

  test("direct quadratic/cubic control moves preserve all other authored world coordinates", () => {
    for (const descriptor of [
      { commandIndex: 2, role: "control1" },
      { commandIndex: 3, role: "control1" },
      { commandIndex: 3, role: "control2" },
    ] as const)
      for (const closed of [false, true]) {
        expectMoved(
          drawing({
            shapePath: path(closed),
            shapeLineEnds: closed ? undefined : drawing().shapeLineEnds,
            rotation: 37,
            shapeFlipX: true,
          }),
          descriptor,
          { x: 135.5, y: -45.25 },
          [key(descriptor)],
        );
      }
  });

  test("a quadratic vertex carries only its outgoing cubic control, leaving its shared Q control independent", () => {
    expectMoved(drawing(), { commandIndex: 2, role: "vertex" }, { x: 60.5, y: -30.25 }, [
      "2:vertex",
      "3:control1",
    ]);
    expectMoved(drawing(), { commandIndex: 1, role: "vertex" }, { x: -30.25, y: 10.5 }, [
      "1:vertex",
    ]);
  });

  test("initial M and a closed cubic seam move together with incoming/outgoing handles", () => {
    const seam: ShapeFreePath = {
      tool: "curve",
      viewBox: { width: 100, height: 80 },
      commands: [["M", 10, 15], ["C", 30, 5, 60, 40, 90, 70], ["C", 70, 80, 5, 40, 10, 15], ["Z"]],
    };
    for (const index of [0, 2])
      expectMoved(
        drawing({
          shapePath: seam,
          shapeLineEnds: undefined,
          rotation: 37,
          shapeFlipX: true,
          shapeFlipY: true,
        }),
        { commandIndex: index, role: "vertex" },
        { x: 55.75, y: 20.5 },
        ["0:vertex", "1:control1", "2:vertex", "2:control2"],
      );
    const open = { ...seam, commands: seam.commands.slice(0, -1) };
    expectMoved(
      drawing({ shapePath: open }),
      { commandIndex: 0, role: "vertex" },
      { x: -15.5, y: 32.25 },
      ["0:vertex", "1:control1"],
    );
  });

  test("final Z closes the moved initial M without manufacturing a duplicate vertex", () => {
    const closed: ShapeFreePath = {
      tool: "freeform",
      viewBox: { width: 100, height: 80 },
      commands: [["M", 10, 10], ["L", 90, 10], ["L", 50, 70], ["Z"]],
    };
    const next = expectMoved(
      drawing({ shapePath: closed, shapeLineEnds: undefined }),
      { commandIndex: 0, role: "vertex" },
      { x: -40, y: -20 },
      ["0:vertex"],
    );
    expect(listFreeShapePoints(next)).toHaveLength(3);
    expect(next.shapePath!.commands.at(-1)).toEqual(["Z"]);
  });

  test.each([0, 37])(
    "thin axes get symmetric 1px frames with exact world points at %d degrees",
    (rotation) => {
      const thin: ShapeFreePath = {
        tool: "scribble",
        viewBox: { width: 100, height: 1 },
        commands: [
          ["M", 0, 0.5],
          ["L", 100, 0.5],
        ],
      };
      const source = drawing({
        shapePath: thin,
        width: 100,
        height: 1,
        rotation,
        shapeFlipX: true,
        shapeFlipY: true,
      });
      const points = worldPoints(source, viewport()),
        first = points.get("0:vertex")!,
        last = points.get("1:vertex")!;
      const next = expectMoved(
        source,
        { commandIndex: 1, role: "vertex" },
        { x: first.x + 0.2 - last.x, y: first.y + 0.2 - last.y },
        ["1:vertex"],
      );
      expect(next.width).toBe(1);
      expect(next.height).toBe(1);
    },
  );

  test("fractional origins reanchor to merged cells without frozen/scroll viewport drift", () => {
    const source = drawing({ rotation: 37, shapeFlipY: true });
    const descriptor = { commandIndex: 3, role: "control2" } as const,
      delta = { x: -30.25, y: 40.75 };
    const ordinary = expectMoved(source, descriptor, delta, [key(descriptor)], viewport());
    const merged = expectMoved(source, descriptor, delta, [key(descriptor)], viewport(true));
    expect(merged.anchor).toEqual({ row: 15, column: 6 });
    expect(merged.offsetX).toBeGreaterThan(80);
    expect(merged.offsetY).toBeGreaterThan(24);
    expect(getFloatingImageSheetRect(merged, viewport(true))).toEqual(
      getFloatingImageSheetRect(ordinary, viewport()),
    );
  });

  test("zero motion retains original identity and every placement field", () => {
    for (const rotation of [0, 37]) {
      const source = drawing({ rotation, shapeFlipX: true, shapeFlipY: true }),
        layout = viewport();
      for (const point of listFreeShapePoints(source))
        expect(moveFreeShapePoint(source, point, worldPoint(source, point, layout), layout)).toBe(
          source,
        );
    }
  });
});

describe("free point rejection and explicit closure", () => {
  test("opening a selected node retains every cycle edge and splits its two endpoint identities", () => {
    const closed: ShapeFreePath = {
      tool: "freeform",
      viewBox: { width: 100, height: 80 },
      commands: [["M", 10, 10], ["L", 90, 10], ["Q", 90, 70, 50, 70], ["Z"]],
      pointTypes: { 0: "straight", 1: "smooth", 2: "straight" },
    };
    const source = drawing({
      shapePath: closed,
      shapeLineEnds: undefined,
      rotation: 37,
      shapeFlipX: true,
    });
    const opened = toggleClosedFreeShape(source, false, viewport(), 1)!;
    expect(opened.shapePath!.commands).toEqual([
      ["M", 90, 10],
      ["Q", 90, 70, 50, 70],
      ["L", 10, 10],
      ["L", 90, 10],
    ]);
    expect(opened.shapePath!.pointTypes).toEqual({
      0: "smooth",
      1: "straight",
      2: "straight",
      3: "smooth",
    });
    expect(listFreeShapePoints(opened).filter((point) => point.role === "vertex")).toHaveLength(4);
    expectMoved(opened, { commandIndex: 0, role: "vertex" }, { x: 20, y: -35 }, ["0:vertex"]);
    const seam: ShapeFreePath = {
      tool: "curve",
      viewBox: { width: 100, height: 80 },
      commands: [["M", 10, 15], ["C", 30, 5, 60, 40, 90, 70], ["C", 70, 80, 5, 40, 10, 15], ["Z"]],
      pointTypes: { 0: "smooth", 1: "straight" },
    };
    const seamOpened = toggleClosedFreeShape(
      drawing({ shapePath: seam, shapeLineEnds: undefined }),
      false,
      viewport(),
      1,
    )!;
    expect(seamOpened.shapePath!.commands).toEqual([
      ["M", 90, 70],
      seam.commands[2],
      seam.commands[1],
    ]);
    expect(seamOpened.shapePath!.pointTypes).toEqual({ 0: "straight", 1: "smooth", 2: "straight" });
    expect(listFreeShapePoints(seamOpened).filter((point) => point.role === "vertex")).toHaveLength(
      3,
    );
  });

  test("closed seam hides the duplicate vertex and assigns its incoming control to node zero", () => {
    for (const last of [
      ["L", 10, 15],
      ["Q", 30, 40, 10, 15],
      ["C", 70, 80, 5, 40, 10, 15],
    ] as const) {
      const commands: readonly ShapeFreePathCommand[] = [["M", 10, 15], ["L", 90, 70], last, ["Z"]];
      const source = drawing({
        shapePath: { tool: "freeform", viewBox: { width: 100, height: 80 }, commands },
        shapeLineEnds: undefined,
      });
      const points = listFreeShapePoints(source);
      expect(
        points.filter((point) => point.role === "vertex").map((point) => point.vertexIndex),
      ).toEqual([0, 1]);
      if (last[0] === "C")
        expect(
          points.find((point) => point.commandIndex === 2 && point.role === "control2")!
            .vertexIndex,
        ).toBe(0);
    }
  });

  test("explicit Close keeps the initial type and drops a conflicting open final endpoint type", () => {
    const source = drawing({
      shapePath: {
        tool: "curve",
        viewBox: { width: 100, height: 80 },
        commands: [
          ["M", 10, 15],
          ["C", 30, 5, 60, 40, 90, 70],
          ["C", 70, 80, 5, 40, 10, 15],
        ],
        pointTypes: { 0: "smooth", 2: "straight" },
      },
    });
    expect(toggleClosedFreeShape(source, true, viewport())!.shapePath!.pointTypes).toEqual({
      0: "smooth",
    });
    const initialCorner = drawing({
      shapePath: { ...source.shapePath!, pointTypes: { 2: "straight" } },
    });
    expect(
      toggleClosedFreeShape(initialCorner, true, viewport())!.shapePath!.pointTypes,
    ).toBeUndefined();
  });
  test("rejects wrong owners, malformed geometry, descriptors and placement without fallback", () => {
    const layout = viewport(),
      target = { x: 900, y: 600 },
      descriptor = { commandIndex: 1, role: "vertex" } as const;
    for (const source of [
      drawing({ kind: "textBox" }),
      drawing({ shapePath: undefined }),
      drawing({ shapeGeometry: { preset: "line" } }),
      drawing({
        shapePath: {
          ...path(),
          commands: [
            ["M", 0, 0],
            ["L", NaN, 80],
          ],
        },
      }),
      drawing({ width: 0 }),
      drawing({ height: 16385 }),
      drawing({ rotation: Infinity }),
      drawing({ rotation: 361 }),
      drawing({ offsetX: -1 }),
      drawing({ offsetY: 1_000_001 }),
    ]) {
      expect(moveFreeShapePoint(source, descriptor, target, layout)).toBeUndefined();
      expect(toggleClosedFreeShape(source, true, layout)).toBeUndefined();
    }
    for (const source of [
      drawing({ kind: "textBox" }),
      drawing({ shapePath: undefined }),
      drawing({ shapeGeometry: { preset: "line" } }),
      drawing({ width: 0 }),
    ])
      expect(listFreeShapePoints(source)).toEqual([]);
    for (const invalid of [
      { commandIndex: -1, role: "vertex" },
      { commandIndex: 0.5, role: "vertex" },
      { commandIndex: 99, role: "vertex" },
      { commandIndex: 1, role: "control1" },
      { commandIndex: 2, role: "control2" },
      { commandIndex: 1, role: "unknown" },
    ])
      expect(
        moveFreeShapePoint(drawing(), invalid as FreeShapePointDescriptor, target, layout),
      ).toBeUndefined();
    const closed = drawing({ shapePath: path(true), shapeLineEnds: undefined });
    expect(
      moveFreeShapePoint(closed, { commandIndex: 5, role: "vertex" }, target, layout),
    ).toBeUndefined();
  });

  test("rejects nonfinite, outside-sheet, collapsed and oversized moves instead of clamping", () => {
    const layout = viewport(),
      source = drawing(),
      descriptor = { commandIndex: 3, role: "control1" } as const;
    for (const target of [
      { x: NaN, y: 600 },
      { x: 900, y: Infinity },
      { x: -1, y: 600 },
      { x: 900, y: -1 },
      { x: layout.getTotalSize().width + 1, y: 600 },
      { x: 900, y: layout.getTotalSize().height + 1 },
      { x: 20_000, y: 600 },
    ])
      expect(moveFreeShapePoint(source, descriptor, target, layout)).toBeUndefined();
    const simple: ShapeFreePath = {
      tool: "freeform",
      viewBox: { width: 100, height: 80 },
      commands: [
        ["M", 0, 0],
        ["L", 100, 80],
      ],
    };
    const line = drawing({ shapePath: simple }),
      points = worldPoints(line, layout);
    expect(
      moveFreeShapePoint(
        line,
        { commandIndex: 1, role: "vertex" },
        points.get("0:vertex")!,
        layout,
      ),
    ).toBeUndefined();
    const edge = reanchorFloatingImageAtSheetRect(
      drawing({ shapePath: simple }),
      { x: 0, y: 0, width: 100, height: 80 },
      layout,
    )!;
    // Both requested points are inside, but a 1px symmetric thin axis crosses y=0.
    expect(
      moveFreeShapePoint(edge, { commandIndex: 1, role: "vertex" }, { x: 100, y: 0 }, layout),
    ).toBeUndefined();
  });

  test("closure appends/removes only Z, strips arrows when closing and preserves no-op identity", () => {
    const source = drawing({ rotation: 37, shapeFlipX: true }),
      layout = viewport(),
      snapshot = structuredClone(source);
    expect(toggleClosedFreeShape(source, false, layout)).toBe(source);
    const closed = toggleClosedFreeShape(source, true, layout)!;
    expect(closed.shapePath!.commands).toEqual([...source.shapePath!.commands, ["Z"]]);
    expect(closed.shapeLineEnds).toBeUndefined();
    expect(closed.anchor).toBe(source.anchor);
    expect(closed.width).toBe(source.width);
    expect(closed.height).toBe(source.height);
    expect(closed.rotation).toBe(source.rotation);
    expect(closed.shapeFlipX).toBe(source.shapeFlipX);
    expect(toggleClosedFreeShape(closed, true, layout)).toBe(closed);
    const opened = toggleClosedFreeShape(closed, false, layout)!;
    expect(opened.shapePath!.commands).toEqual([...source.shapePath!.commands, ["L", 10, 15]]);
    expect(opened.shapeLineEnds).toBeUndefined();
    expect(source).toEqual(snapshot);
  });

  test("closing a full command budget is rejected without discarding an authored node", () => {
    const commands: ShapeFreePathCommand[] = [["M", 0, 0]];
    for (let index = 1; index < 2048; index++) commands.push(["L", index % 2, index % 2]);
    const source = drawing({
      shapePath: { tool: "scribble", viewBox: { width: 1, height: 1 }, commands },
    });
    expect(toggleClosedFreeShape(source, true, viewport())).toBeUndefined();
    expect(source.shapePath!.commands).toHaveLength(2048);
  });
});

describe("free point types and paired cubic controls", () => {
  function cubic(type?: "smooth" | "straight", closed = false): SheetGraphicDrawing {
    return drawing({
      width: 100,
      height: 80,
      shapeLineEnds: closed ? undefined : drawing().shapeLineEnds,
      shapePath: {
        tool: "curve",
        viewBox: { width: 100, height: 80 },
        commands: [
          ["M", 10, 30],
          ["C", 20, 30, 40, 20, 50, 40],
          ["C", 70, 70, 80, 40, 90, 40],
          ...(closed ? [["C", 70, 10, 5, 10, 10, 30] as const, ["Z"] as const] : []),
        ],
        ...(type ? { pointTypes: { 1: type } } : {}),
      },
    });
  }
  function pairVectors(
    value: SheetGraphicDrawing,
    vertexIndex = 1,
  ): { incoming: FreeShapePointPosition; outgoing: FreeShapePointPosition } {
    const points = listFreeShapePoints(value),
      node = points.find(
        (point) => point.role === "vertex" && point.vertexIndex === vertexIndex,
      )!.position;
    const incoming = points.find(
      (point) => point.role === "control2" && point.vertexIndex === vertexIndex,
    )!.position;
    const outgoing = points.find(
      (point) => point.role === "control1" && point.vertexIndex === vertexIndex,
    )!.position;
    return {
      incoming: { x: incoming.x - node.x, y: incoming.y - node.y },
      outgoing: { x: outgoing.x - node.x, y: outgoing.y - node.y },
    };
  }
  function expectCollinearOpposite(
    value: SheetGraphicDrawing,
    smooth: boolean,
    vertexIndex = 1,
  ): void {
    const pair = pairVectors(value, vertexIndex);
    expect(pair.incoming.x * pair.outgoing.y - pair.incoming.y * pair.outgoing.x).toBeCloseTo(0, 8);
    expect(
      pair.incoming.x * pair.outgoing.x + pair.incoming.y * pair.outgoing.y,
    ).toBeLessThanOrEqual(0);
    if (smooth)
      expect(Math.hypot(pair.incoming.x, pair.incoming.y)).toBeCloseTo(
        Math.hypot(pair.outgoing.x, pair.outgoing.y),
        8,
      );
  }

  test.each(["smooth", "straight"] as const)(
    "direct %s control drags constrain only the node's paired handle with all flips",
    (type) => {
      for (const descriptor of [
        { commandIndex: 1, role: "control2" },
        { commandIndex: 2, role: "control1" },
      ] as const)
        for (const flipX of [false, true])
          for (const flipY of [false, true]) {
            const source = {
              ...cubic(type),
              rotation: 37,
              ...(flipX ? { shapeFlipX: true as const } : {}),
              ...(flipY ? { shapeFlipY: true as const } : {}),
            };
            const layout = viewport(),
              before = worldPoints(source, layout),
              target = plus(before.get(key(descriptor))!, { x: 25.5, y: -20.25 });
            const originalPair = pairVectors(source),
              originalPartner =
                descriptor.role === "control1" ? originalPair.incoming : originalPair.outgoing;
            const next = moveFreeShapePoint(source, descriptor, target, layout)!;
            expect(next).toBeDefined();
            expectCollinearOpposite(next, type === "smooth");
            const after = worldPoints(next, layout);
            expectPoint(after.get(key(descriptor))!, target);
            for (const [name, point] of before)
              if (!["1:control2", "2:control1"].includes(name))
                expectPoint(after.get(name)!, point);
            if (type === "straight") {
              const nextPair = pairVectors(next),
                partner = descriptor.role === "control1" ? nextPair.incoming : nextPair.outgoing;
              expect(Math.hypot(partner.x, partner.y)).toBeCloseTo(
                Math.hypot(originalPartner.x, originalPartner.y),
                8,
              );
            }
            expect(next.shapePath!.pointTypes).toEqual({ 1: type });
          }
    },
  );

  test("corner controls stay independent and smooth zero-length drags collapse only the pair", () => {
    expectMoved(cubic(), { commandIndex: 1, role: "control2" }, { x: 30.5, y: -5 }, ["1:control2"]);
    const source = cubic("smooth"),
      layout = viewport(),
      points = worldPoints(source, layout);
    const next = moveFreeShapePoint(
      source,
      { commandIndex: 1, role: "control2" },
      points.get("1:vertex")!,
      layout,
    )!;
    expectPoint(worldPoints(next, layout).get("2:control1")!, points.get("1:vertex")!);
    expectCollinearOpposite(next, true);
  });

  test("set type converts adjacent lines and constrains controls while preserving authored vertices", () => {
    const source = drawing({
      width: 100,
      height: 80,
      rotation: 37,
      shapeFlipY: true,
      shapePath: {
        tool: "freeform",
        viewBox: { width: 100, height: 80 },
        commands: [
          ["M", 10, 10],
          ["L", 50, 40],
          ["L", 90, 20],
        ],
      },
    });
    const before = worldPoints(source, viewport());
    for (const type of ["smooth", "straight"] as const) {
      const next = setFreeShapePointType(source, 1, type, viewport())!;
      expect(next).toBeDefined();
      expect(next.shapePath!.commands.map((command) => command[0])).toEqual(["M", "C", "C"]);
      expect(next.shapePath!.pointTypes).toEqual({ 1: type });
      expectCollinearOpposite(next, type === "smooth");
      for (const [name, point] of before)
        expectPoint(worldPoints(next, viewport()).get(name)!, point);
      expect(setFreeShapePointType(next, 1, type, viewport())).toBe(next);
      const corner = setFreeShapePointType(next, 1, "corner", viewport())!;
      expect(corner.shapePath!.pointTypes).toBeUndefined();
      expect(corner.shapePath!.commands).toEqual(next.shapePath!.commands);
      expect(setFreeShapePointType(corner, 1, "corner", viewport())).toBe(corner);
    }
  });

  test("quadratic segments elevate exactly before an explicit endpoint type action", () => {
    const source = drawing({
      width: 100,
      height: 80,
      shapePath: {
        tool: "curve",
        viewBox: { width: 100, height: 80 },
        commands: [
          ["M", 10, 10],
          ["Q", 40, 70, 90, 20],
        ],
      },
    });
    const next = setFreeShapePointType(source, 0, "smooth", viewport())!;
    expect(next.shapePath!.commands[1]![0]).toBe("C");
    const before = worldPoints(source, viewport()),
      after = worldPoints(next, viewport());
    expectPoint(after.get("0:vertex")!, before.get("0:vertex")!);
    expectPoint(after.get("1:vertex")!, before.get("1:vertex")!);
  });

  test("typing the initial closed node materializes the closing edge and uses seam controls", () => {
    const source = drawing({
      width: 100,
      height: 80,
      shapeLineEnds: undefined,
      shapePath: {
        tool: "freeform",
        viewBox: { width: 100, height: 80 },
        commands: [["M", 10, 10], ["L", 90, 10], ["L", 50, 70], ["Z"]],
      },
    });
    const next = setFreeShapePointType(source, 0, "smooth", viewport())!;
    expect(next.shapePath!.commands.map((command) => command[0])).toEqual([
      "M",
      "C",
      "L",
      "C",
      "Z",
    ]);
    expect(listFreeShapePoints(next).filter((point) => point.role === "vertex")).toHaveLength(3);
    expectCollinearOpposite(next, true, 0);
    const points = worldPoints(next, viewport()),
      target = plus(points.get("1:control1")!, { x: 10, y: 20 });
    const moved = moveFreeShapePoint(
      next,
      { commandIndex: 1, role: "control1" },
      target,
      viewport(),
    )!;
    expectCollinearOpposite(moved, true, 0);
    expectPoint(worldPoints(moved, viewport()).get("1:control1")!, target);
  });

  test("shared replacement rejects accessor commands without evaluating them", () => {
    let reads = 0;
    const command = ["L", 50, 50];
    Object.defineProperty(command, "1", {
      get: () => {
        reads++;
        return 50;
      },
      enumerable: true,
    });
    expect(
      replaceFreeShapeCommands(
        drawing(),
        [["M", 0, 0], command] as unknown as ShapeFreePathCommand[],
        undefined,
        viewport(),
      ),
    ).toBeUndefined();
    expect(reads).toBe(0);
  });
});
