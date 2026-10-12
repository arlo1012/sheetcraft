// @vitest-environment node
import { describe, expect, test } from "vitest";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { ShapePresetName } from "@sheetcraft/core/shape-presets";
import type { ShapeLineEndKind } from "@sheetcraft/core/shape-line-ends";
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
  getShapeLineLocalEndpoints,
  moveStandardShapeEndpoint,
  type ShapeEndpointPoint,
} from "../../../modules/sheet-drawings/shape-endpoint-layout";
import { standardShapeFlipPoint } from "../../../modules/sheet-drawings/shape-geometry";

const presets = [
  "line",
  "lineInv",
  "bentConnector2",
  "bentConnector3",
  "bentConnector4",
  "bentConnector5",
  "curvedConnector2",
  "curvedConnector3",
  "curvedConnector4",
  "curvedConnector5",
] as const satisfies readonly ShapePresetName[];
const kinds: readonly ShapeLineEndKind[] = ["triangle", "open", "stealth", "diamond", "oval"];
const quadrants = [
  { x: 170.25, y: 90.75 },
  { x: -170.25, y: 90.75 },
  { x: 170.25, y: -90.75 },
  { x: -170.25, y: -90.75 },
] as const;
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
function drawing(
  preset: (typeof presets)[number] = "line",
  overrides: Partial<SheetGraphicDrawing> = {},
): SheetGraphicDrawing {
  const adjustments: Readonly<Record<string, number>> | undefined = preset.endsWith("3")
    ? { adj1: 35000 }
    : preset.endsWith("4")
      ? { adj1: 35000, adj2: 65000 }
      : preset.endsWith("5")
        ? { adj1: 35000, adj2: 65000, adj3: 25000 }
        : undefined;
  return {
    id: "endpoint-shape",
    kind: "shape",
    name: "Existing connector",
    anchor: { row: 20, column: 10 },
    offsetX: 10.25,
    offsetY: 10.75,
    width: 120.5,
    height: 80.25,
    rotation: 0,
    text: "Keep text",
    shape: "line",
    shapeGeometry: { preset, ...(adjustments ? { adjustments } : {}) },
    fill: "transparent",
    stroke: "#2563eb",
    strokeWidth: 2,
    color: "#1e3a8a",
    fontSize: 20,
    bold: true,
    italic: true,
    ...overrides,
  };
}
function pathEnds(
  value: SheetGraphicDrawing,
  layout: SheetViewportLayout,
): readonly [ShapeEndpointPoint, ShapeEndpointPoint] {
  const rect = getFloatingImageSheetRect(value, layout)!;
  const endpoints = getShapeLineLocalEndpoints(value)!;
  const world = (point: ShapeEndpointPoint) =>
    pictureFrameLocalToWorld(rect, value.rotation, standardShapeFlipPoint(value, point));
  return [world(endpoints[0]), world(endpoints[1])];
}
function rotated(vector: ShapeEndpointPoint, degrees: number): ShapeEndpointPoint {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: Math.cos(radians) * vector.x - Math.sin(radians) * vector.y,
    y: Math.sin(radians) * vector.x + Math.cos(radians) * vector.y,
  };
}
function plus(left: ShapeEndpointPoint, right: ShapeEndpointPoint): ShapeEndpointPoint {
  return { x: left.x + right.x, y: left.y + right.y };
}
function error(actual: ShapeEndpointPoint, expected: ShapeEndpointPoint): number {
  return Math.hypot(actual.x - expected.x, actual.y - expected.y);
}
function expectPoint(actual: ShapeEndpointPoint, expected: ShapeEndpointPoint): void {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
}

// Each successful ordinary move pins the other world tip exactly, including lineInv's parity.
describe("standard line endpoint geometry", () => {
  test.each(presets)("%s exposes actual unflipped local tips", (preset) => {
    const source = drawing(preset, { shapeFlipX: true, shapeFlipY: true, rotation: 37 });
    const endpoints = getShapeLineLocalEndpoints(source)!;
    expect(endpoints).toEqual(
      preset === "lineInv"
        ? [
            { x: 0, y: source.height },
            { x: source.width, y: 0 },
          ]
        : [
            { x: 0, y: 0 },
            { x: source.width, y: source.height },
          ],
    );
    expect(Object.isFrozen(endpoints)).toBe(true);
    expect(Object.isFrozen(endpoints[0])).toBe(true);
    expect(getShapeLineLocalEndpoints(source)).toBe(endpoints);
    const unflipped = { ...source, rotation: 0 };
    delete unflipped.shapeFlipX;
    delete unflipped.shapeFlipY;
    expect(getShapeLineLocalEndpoints(unflipped)).toBe(endpoints);
  });

  test.each([0, 37])(
    "every preset crosses every quadrant at %d° without endpoint swaps",
    (rotation) => {
      const layout = viewport();
      for (const preset of presets) {
        const source = drawing(preset, { rotation });
        const original = pathEnds(source, layout);
        const snapshot = structuredClone(source);
        for (const index of [0, 1] as const) {
          const opposite = index === 0 ? 1 : 0;
          for (const vector of quadrants) {
            const target = plus(original[opposite], rotated(vector, rotation));
            const next = moveStandardShapeEndpoint(source, index, target, layout)!;
            expect(next).toBeDefined();
            const actual = pathEnds(next, layout);
            expectPoint(actual[index], target);
            expectPoint(actual[opposite], original[opposite]);
            expect(next.width).toBeCloseTo(Math.abs(vector.x), 8);
            expect(next.height).toBeCloseTo(Math.abs(vector.y), 8);
            const startToEnd = index === 0 ? { x: -vector.x, y: -vector.y } : vector;
            expect(next.shapeFlipX).toBe(startToEnd.x < 0 ? true : undefined);
            expect(next.shapeFlipY).toBe(
              startToEnd.y < 0 !== (preset === "lineInv") ? true : undefined,
            );
            expect(next.rotation).toBe(rotation);
            expect(next.shapeGeometry).toBe(source.shapeGeometry);
          }
        }
        expect(source).toEqual(snapshot);
      }
    },
  );

  test("all original flip combinations and arrow styles preserve full feature data and tip identity", () => {
    const layout = viewport();
    for (const preset of presets)
      for (const flipX of [false, true])
        for (const flipY of [false, true])
          for (const [kindIndex, kind] of kinds.entries()) {
            const source = drawing(preset, {
              rotation: 37,
              ...(flipX ? { shapeFlipX: true } : {}),
              ...(flipY ? { shapeFlipY: true } : {}),
              shapeLineEnds: {
                begin: { kind, width: "small", length: "large" },
                end: {
                  kind: kinds[(kindIndex + 1) % kinds.length]!,
                  width: "large",
                  length: "small",
                },
              },
            });
            const original = pathEnds(source, layout);
            for (const index of [0, 1] as const) {
              const opposite = index === 0 ? 1 : 0;
              const target = plus(original[opposite], { x: -210.25, y: 100.75 });
              const next = moveStandardShapeEndpoint(source, index, target, layout)!;
              expect(next).toBeDefined();
              expectPoint(pathEnds(next, layout)[opposite], original[opposite]);
              expectPoint(pathEnds(next, layout)[index], target);
              expect(next.shapeGeometry).toBe(source.shapeGeometry);
              expect(next.shapeLineEnds).toBe(source.shapeLineEnds);
              const retained = ({
                anchor: _anchor,
                offsetX: _x,
                offsetY: _y,
                width: _w,
                height: _h,
                shapeFlipX: _flipX,
                shapeFlipY: _flipY,
                ...appearance
              }: SheetGraphicDrawing) => appearance;
              expect(retained(next)).toEqual(retained(source));
            }
          }
  });

  test("fractional origins use merged anchors and ignore viewport scroll/frozen panes", () => {
    const ordinary = viewport(),
      merged = viewport(true),
      source = drawing("bentConnector5", { rotation: 37 });
    const target = plus(pathEnds(source, ordinary)[0], { x: 190.25, y: 120.75 });
    const first = moveStandardShapeEndpoint(source, 1, target, ordinary)!;
    const second = moveStandardShapeEndpoint(source, 1, target, merged)!;
    expect(second.anchor).toEqual({ row: 15, column: 6 });
    expect(second.offsetX).toBeGreaterThan(80);
    expect(second.offsetY).toBeGreaterThan(24);
    expect(getFloatingImageSheetRect(second, merged)).toEqual(
      getFloatingImageSheetRect(first, ordinary),
    );
    expectPoint(pathEnds(second, merged)[0], pathEnds(source, ordinary)[0]);
    expectPoint(pathEnds(second, merged)[1], target);
  });
});

describe("thin local axes and world Shift constraint", () => {
  test.each([0, 37])(
    "thin axes are symmetric and stay inside the 0.5px Euclidean contract at %d°",
    (rotation) => {
      const layout = viewport();
      for (const preset of presets)
        for (const index of [0, 1] as const)
          for (const vector of [
            { x: 130, y: 0 },
            { x: -130, y: 0 },
            { x: 0, y: 90 },
            { x: 0, y: -90 },
            { x: 130, y: 0.2 },
            { x: 0.2, y: -90 },
            { x: 0.8, y: 0.8 },
          ]) {
            const source = drawing(preset, { rotation, shapeFlipX: true, shapeFlipY: true });
            const original = pathEnds(source, layout);
            const opposite = index === 0 ? 1 : 0;
            const target = plus(original[opposite], rotated(vector, rotation));
            const next = moveStandardShapeEndpoint(source, index, target, layout)!;
            expect(next).toBeDefined();
            expect(next.width).toBeGreaterThanOrEqual(1);
            expect(next.height).toBeGreaterThanOrEqual(1);
            const actual = pathEnds(next, layout);
            expect(error(actual[index], target)).toBeLessThanOrEqual(0.5 + 1e-8);
            expect(error(actual[opposite], original[opposite])).toBeLessThanOrEqual(0.5 + 1e-8);
            expectPoint(
              { x: (actual[0].x + actual[1].x) / 2, y: (actual[0].y + actual[1].y) / 2 },
              {
                x: (target.x + original[opposite].x) / 2,
                y: (target.y + original[opposite].y) / 2,
              },
            );
            if (vector.x === 0) expect(next.shapeFlipX).toBe(true);
            if (vector.y === 0) expect(next.shapeFlipY).toBe(true);
          }
    },
  );

  test.each([0, 37])(
    "Shift snaps every world octant at %d° and retains the requested length",
    (rotation) => {
      const layout = viewport();
      for (const preset of presets)
        for (const index of [0, 1] as const)
          for (let octant = 0; octant < 8; octant++) {
            const source = drawing(preset, { rotation });
            const original = pathEnds(source, layout),
              opposite = index === 0 ? 1 : 0;
            const angle = (octant * Math.PI) / 4 + 0.12,
              length = 150.5;
            const target = plus(original[opposite], {
              x: length * Math.cos(angle),
              y: length * Math.sin(angle),
            });
            const snapped = plus(original[opposite], {
              x: length * Math.cos((octant * Math.PI) / 4),
              y: length * Math.sin((octant * Math.PI) / 4),
            });
            const next = moveStandardShapeEndpoint(source, index, target, layout, true)!;
            expect(next).toBeDefined();
            expect(next.rotation).toBe(rotation);
            const actual = pathEnds(next, layout);
            expect(error(actual[index], snapped)).toBeLessThanOrEqual(0.5 + 1e-8);
            expect(error(actual[opposite], original[opposite])).toBeLessThanOrEqual(0.5 + 1e-8);
            if (rotation === 37 || octant % 2 === 1) {
              expectPoint(actual[index], snapped);
              expectPoint(actual[opposite], original[opposite]);
              expect(error(actual[index], actual[opposite])).toBeCloseTo(length, 8);
            }
          }
    },
  );
});

describe("endpoint rejection and zero-motion contract", () => {
  test("a noop retains the exact existing object, placement, sparse flips and thin geometry", () => {
    const layout = viewport();
    for (const preset of presets)
      for (const rotation of [0, 37])
        for (const flipX of [false, true])
          for (const flipY of [false, true]) {
            const source = drawing(preset, {
              rotation,
              height: 1,
              ...(flipX ? { shapeFlipX: true } : {}),
              ...(flipY ? { shapeFlipY: true } : {}),
            });
            for (const index of [0, 1] as const) {
              const target = pathEnds(source, layout)[index];
              expect(moveStandardShapeEndpoint(source, index, target, layout)).toBe(source);
              expect(moveStandardShapeEndpoint(source, index, target, layout, true)).toBe(source);
            }
          }
  });

  test("malformed/absent/nonline geometry never becomes a rectangle or an editable tip", () => {
    const layout = viewport();
    for (const source of [
      drawing("line", { shapeGeometry: undefined }),
      drawing("line", { shapeGeometry: { preset: "rect" } }),
      drawing("line", { kind: "textBox" }),
      drawing("line", { shapeGeometry: { preset: "line", adjustments: { unknown: 1 } } }),
      drawing("line", { width: Number.NaN }),
      drawing("line", { height: 0 }),
      drawing("line", { width: 16385 }),
    ]) {
      expect(getShapeLineLocalEndpoints(source)).toBeUndefined();
      expect(moveStandardShapeEndpoint(source, 0, { x: 700, y: 600 }, layout)).toBeUndefined();
    }
  });

  test("rejects nonfinite, out-of-sheet, collapsed, too-short, oversized and negative-frame moves", () => {
    const layout = viewport(),
      source = drawing(),
      original = pathEnds(source, layout);
    const fixed = original[1];
    for (const target of [
      { x: Number.NaN, y: 600 },
      { x: 600, y: Infinity },
      { x: -1, y: 600 },
      { x: 600, y: -1 },
      { x: layout.getTotalSize().width + 1, y: 600 },
      { x: 600, y: layout.getTotalSize().height + 1 },
      fixed,
      plus(fixed, { x: 0.1, y: 0.1 }),
      plus(fixed, { x: 16384.01, y: 80 }),
    ])
      expect(moveStandardShapeEndpoint(source, 0, target, layout)).toBeUndefined();
    expect(moveStandardShapeEndpoint(source, 2 as 0, { x: 700, y: 600 }, layout)).toBeUndefined();
    for (const source of [
      drawing("line", { rotation: Infinity }),
      drawing("line", { rotation: 361 }),
      drawing("line", { offsetX: -1 }),
      drawing("line", { offsetY: 1_000_001 }),
    ])
      expect(moveStandardShapeEndpoint(source, 0, { x: 700, y: 600 }, layout)).toBeUndefined();
  });

  test("valid extent boundary succeeds and resized guide-budget overflow is rejected", () => {
    const layout = viewport(),
      source = drawing("line", { rotation: 0, anchor: { row: 800, column: 300 } });
    const fixed = pathEnds(source, layout)[0];
    const target = plus(fixed, { x: 16384, y: 80 });
    const next = moveStandardShapeEndpoint(source, 1, target, layout)!;
    expect(next).toBeDefined();
    expect(next.width).toBeCloseTo(16384, 8);
    expectPoint(pathEnds(next, layout)[0], fixed);
    expectPoint(pathEnds(next, layout)[1], target);
    const rotatedSource = { ...source, rotation: 37 };
    const rotatedFixed = pathEnds(rotatedSource, layout)[0];
    const rotatedTarget = plus(rotatedFixed, rotated({ x: 16384, y: 80 }, 37));
    const rotatedNext = moveStandardShapeEndpoint(rotatedSource, 1, rotatedTarget, layout)!;
    expect(rotatedNext).toBeDefined();
    expect(rotatedNext.width).toBeLessThanOrEqual(16384);
    expectPoint(pathEnds(rotatedNext, layout)[0], rotatedFixed);
    expectPoint(pathEnds(rotatedNext, layout)[1], rotatedTarget);
    expect(
      moveStandardShapeEndpoint(
        rotatedSource,
        1,
        plus(rotatedFixed, rotated({ x: 16384.01, y: 80 }, 37)),
        layout,
      ),
    ).toBeUndefined();
    const guide = drawing("bentConnector3", {
      shapeGeometry: { preset: "bentConnector3", adjustments: { adj1: 2_000_000_000 } },
    });
    expect(getShapeLineLocalEndpoints(guide)).toBeDefined();
    expect(
      moveStandardShapeEndpoint(
        guide,
        1,
        plus(pathEnds(guide, layout)[0], { x: 1000, y: 80 }),
        layout,
      ),
    ).toBeUndefined();
  });

  test("rejects Shift results and rotated layout origins outside the sheet without clamping", () => {
    const layout = viewport();
    const source = reanchorFloatingImageAtSheetRect(
      drawing(),
      { x: 80, y: 20, width: 100, height: 50 },
      layout,
    )!;
    // Target is inside; nearest -45° direction places the constrained tip above the sheet.
    expect(moveStandardShapeEndpoint(source, 1, { x: 110, y: 0 }, layout, true)).toBeUndefined();
    const boundary = reanchorFloatingImageAtSheetRect(
      drawing(),
      { x: 0, y: 100, width: 100, height: 50 },
      layout,
    )!;
    expect(moveStandardShapeEndpoint(boundary, 1, { x: 0, y: 300 }, layout)).toBeUndefined();
    const rotatedSource = reanchorFloatingImageAtSheetRect(
      drawing("line", { rotation: 37 }),
      { x: 5, y: 150, width: 100, height: 50 },
      layout,
    )!;
    const target = plus(pathEnds(rotatedSource, layout)[0], { x: 0, y: 150 });
    expect(target.x).toBeGreaterThan(0);
    expect(moveStandardShapeEndpoint(rotatedSource, 1, target, layout)).toBeUndefined();
  });
});
