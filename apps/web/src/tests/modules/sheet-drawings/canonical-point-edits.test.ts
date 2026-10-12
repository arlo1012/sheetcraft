// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  createPictureSheetMetrics,
  locatePictureAxisPoint,
} from "@sheetcraft/core/picture-axis-metrics";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type {
  SheetFramedGraphicDrawing,
  SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { getFloatingImageSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import {
  createSheetViewportLayout,
  type SheetViewportLayout,
} from "@sheetcraft/sheet-engine/viewport-layout";
import {
  addFreeShapePoint,
  deleteFreeShapePoint,
  nearestFreeShapeSegment,
} from "../../../modules/sheet-drawings/free-shape-point-operations";
import {
  listFreeShapePoints,
  moveFreeShapePoint,
  replaceFreeShapeCommands,
  setFreeShapePointType,
  toggleClosedFreeShape,
} from "../../../modules/sheet-drawings/free-shape-point-layout";
import {
  resolveShapeDrawing,
  updateResolvedShapeDrawing,
} from "../../../modules/sheet-drawings/resolved-shape-drawing";
import {
  getShapeLineLocalEndpoints,
  moveStandardShapeEndpoint,
} from "../../../modules/sheet-drawings/shape-endpoint-layout";
import { standardShapeFlipPoint } from "../../../modules/sheet-drawings/shape-geometry";
import { shapeViewLayout } from "../../../modules/sheet-drawings/shape-view-layout";
import { framedShape } from "./framed-shape-fixture";

type Point = Readonly<{ x: number; y: number }>;
const cases = [
  { name: "signed leading offsets", x: -30, y: -20, width: 120, height: 80 },
  { name: "derived positive subpixel frame", x: 20, y: 20, width: 0.25, height: 0.5 },
  { name: "terminal virtual sheet space", x: 4000, y: 4000, width: 120, height: 80 },
];

function fixture(rect: (typeof cases)[number], free = false) {
  const sheet = getActiveSheet(createWorkbook({ id: "book", sheetId: "sheet" }));
  const metrics = createPictureSheetMetrics(sheet);
  metrics.columns = { ...metrics.columns, count: 30 };
  metrics.rows = { ...metrics.rows, count: 50 };
  const viewport = createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 50,
      columnCount: 30,
      rowHeight: 24,
      columnWidth: 80,
    }),
    rows: createRowVisibilityIndex({ rowCount: 50, defaultRowHeight: 24 }),
    viewportSize: { width: 800, height: 600 },
  });
  const source: SheetFramedGraphicDrawing = {
    ...framedShape(),
    rotation: 27,
    shapeFlipX: true,
    shapeFlipY: true,
    shapeLineEnds: { begin: { kind: "open" }, end: { kind: "triangle" } },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: {
        mode: "move-and-size",
        start: {
          column: locatePictureAxisPoint(rect.x, metrics.columns),
          row: locatePictureAxisPoint(rect.y, metrics.rows),
        },
        end: {
          column: locatePictureAxisPoint(rect.x + rect.width, metrics.columns),
          row: locatePictureAxisPoint(rect.y + rect.height, metrics.rows),
        },
      },
    },
    ...(free
      ? {
          shapePath: {
            tool: "curve",
            viewBox: { width: 120, height: 80 },
            commands: [
              ["M", 0, 0],
              ["C", 20, 5, 40, 15, 60, 40],
              ["C", 70, 45, 100, 60, 120, 80],
            ],
            pointTypes: { 1: "straight" },
          },
        }
      : { shapeGeometry: { preset: "lineInv" } }),
  };
  if (free) delete source.shapeGeometry;
  const resolved = resolveShapeDrawing(source, metrics);
  return {
    source,
    resolved,
    view: resolved.view as SheetGraphicDrawing,
    layout: shapeViewLayout(viewport, metrics),
    options: { metrics },
  };
}

function close(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
}
function lineTips(view: SheetGraphicDrawing, layout: SheetViewportLayout) {
  const rect = getFloatingImageSheetRect(view, layout)!;
  return getShapeLineLocalEndpoints(view)!.map((point) =>
    pictureFrameLocalToWorld(rect, view.rotation, standardShapeFlipPoint(view, point)),
  );
}
function freePoints(view: SheetGraphicDrawing, layout: SheetViewportLayout) {
  const rect = getFloatingImageSheetRect(view, layout)!;
  return new Map(
    listFreeShapePoints(view).map((point) => [
      `${point.commandIndex}:${point.role}`,
      pictureFrameLocalToWorld(rect, view.rotation, {
        x: view.shapeFlipX ? view.width - point.position.x : point.position.x,
        y: view.shapeFlipY ? view.height - point.position.y : point.position.y,
      }),
    ]),
  );
}

describe("explicit canonical point-edit context", () => {
  test.each(cases)("line endpoints accept $name and retain the opposite world tip", (rect) => {
    const f = fixture(rect);
    const before = lineTips(f.view, f.layout);
    const target = { x: before[1]!.x + 70, y: before[1]!.y + 50 };
    expect(moveStandardShapeEndpoint(f.view, 1, target, f.layout)).toBeUndefined();
    const next = moveStandardShapeEndpoint(f.view, 1, target, f.layout, false, f.options);
    expect(next).toBeDefined();
    const after = lineTips(next!, f.layout);
    close(after[0]!, before[0]!);
    close(after[1]!, target);
    expect(next!.anchor).toBe(f.view.anchor);
    expect(next!.rotation).toBe(f.view.rotation);
    expect(next!.shapeGeometry).toBe(f.view.shapeGeometry);
    expect(next!.shapeLineEnds).toBe(f.view.shapeLineEnds);
    const committed = updateResolvedShapeDrawing(f.resolved, next!, f.options.metrics);
    expect(Object.hasOwn(committed, "shapeFrame")).toBe(true);
    expect(Object.hasOwn(committed, "anchor")).toBe(false);
  });

  test.each(cases)(
    "free-point moves accept $name and leave every unrelated world point fixed",
    (rect) => {
      const f = fixture(rect, true);
      const before = freePoints(f.view, f.layout);
      const original = before.get("1:control1")!;
      const target = { x: original.x + 4, y: original.y - 3 };
      const descriptor = { commandIndex: 1, role: "control1" as const };
      expect(moveFreeShapePoint(f.view, descriptor, target, f.layout)).toBeUndefined();
      const next = moveFreeShapePoint(f.view, descriptor, target, f.layout, f.options);
      expect(next).toBeDefined();
      const after = freePoints(next!, f.layout);
      for (const [key, point] of before)
        close(after.get(key)!, key === "1:control1" ? target : point);
      expect(next!.anchor).toBe(f.view.anchor);
      expect(next!.rotation).toBe(f.view.rotation);
      expect(next!.shapeFlipX).toBe(true);
      expect(next!.shapeFlipY).toBe(true);
      expect(next!.shapePath!.tool).toBe(f.view.shapePath!.tool);
      expect(next!.shapePath!.pointTypes).toEqual(f.view.shapePath!.pointTypes);
      expect(next!.shapeLineEnds).toBe(f.view.shapeLineEnds);
    },
  );

  test.each(cases)("all free-path node operations thread context for $name", (rect) => {
    const f = fixture(rect, true);
    const selected = freePoints(f.view, f.layout).get("1:vertex")!;
    expect(nearestFreeShapeSegment(f.view, selected, f.layout, f.options)?.distance).toBeCloseTo(
      0,
      8,
    );
    const added = addFreeShapePoint(f.view, 1, f.layout, 0.5, f.options);
    expect(added).toBeDefined();
    expect(listFreeShapePoints(added!).filter((point) => point.role === "vertex")).toHaveLength(4);
    expect(deleteFreeShapePoint(f.view, 1, f.layout, f.options)).toBeDefined();
    expect(
      setFreeShapePointType(f.view, 1, "smooth", f.layout, f.options)?.shapePath!.pointTypes?.[1],
    ).toBe("smooth");
    expect(setFreeShapePointType(f.view, 1, "straight", f.layout, f.options)).toBeDefined();
    expect(
      setFreeShapePointType(f.view, 1, "corner", f.layout, f.options)?.shapePath!.pointTypes,
    ).toBeUndefined();
    const closed = toggleClosedFreeShape(f.view, true, f.layout, 0, f.options);
    expect(closed?.shapePath!.commands.at(-1)).toEqual(["Z"]);
    expect(closed!.shapeLineEnds).toBeUndefined();
    const opened = toggleClosedFreeShape(closed!, false, f.layout, 1, f.options);
    expect(opened).toBeDefined();
    expect(opened!.shapePath!.commands.at(-1)?.[0]).not.toBe("Z");
  });

  test("canonical mode preserves zero-motion identity and finite coordinate budgets", () => {
    const f = fixture(cases[0]!, true);
    const descriptor = { commandIndex: 1, role: "control1" as const };
    const point = freePoints(f.view, f.layout).get("1:control1")!;
    expect(moveFreeShapePoint(f.view, descriptor, point, f.layout, f.options)).toBe(f.view);
    expect(
      moveFreeShapePoint(f.view, descriptor, { x: -10_000_001, y: 0 }, f.layout, f.options),
    ).toBeUndefined();
    expect(
      moveFreeShapePoint({ ...f.view, width: 0 }, descriptor, point, f.layout, f.options),
    ).toBeUndefined();
    expect(
      replaceFreeShapeCommands(
        f.view,
        [
          ["M", 0, 0],
          ["L", 10_000_001, 10],
        ],
        undefined,
        f.layout,
        f.options,
      ),
    ).toBeUndefined();
    const line = fixture(cases[0]!);
    expect(
      moveStandardShapeEndpoint(
        line.view,
        1,
        lineTips(line.view, line.layout)[1]!,
        line.layout,
        false,
        line.options,
      ),
    ).toBe(line.view);
    expect(
      moveStandardShapeEndpoint(line.view, 1, { x: NaN, y: 0 }, line.layout, false, line.options),
    ).toBeUndefined();
    expect(
      moveStandardShapeEndpoint(
        line.view,
        1,
        { x: 10_000_001, y: 0 },
        line.layout,
        false,
        line.options,
      ),
    ).toBeUndefined();
  });
});
