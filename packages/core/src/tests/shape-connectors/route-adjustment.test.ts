import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  planShapeConnectorRouteAdjustment,
  type ShapeConnectorEditSource,
} from "../../shape-connector-editing.js";
import { resolveSheetShapeConnections } from "../../shape-connector-layout.js";
import type { ShapeConnectorPoint } from "../../shape-connector-route.js";
import { shapeFrameLocalToWorld } from "../../shape-frame.js";
import { normalizeShapeDrawingForest } from "../../shape-group-planning.js";
import type { ShapeGroupChild, SheetGroupedGraphicDrawing } from "../../shape-group.js";
import type { ShapePresetName } from "../../shape-presets/catalog.js";
import type { SheetDrawing, SheetFramedGraphicDrawing } from "../../sheet-drawings.js";
import { createSheet, getActiveSheet, setSheetDimensionHidden } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { group, metrics, nested } from "../shape-groups/fixtures.js";
import { connectorShape, framedShape } from "./layout-fixtures.js";

const rootSource: ShapeConnectorEditSource = { connectorId: "connector", path: ["connector"] };
function fixture(preset: ShapePresetName = "bentConnector3"): SheetDrawing[] {
  const line = connectorShape();
  line.shapeGeometry = { preset };
  line.shapeLineEnds = { begin: { kind: "triangle" }, end: { kind: "open" } };
  return normalizeShapeDrawingForest([
    framedShape("rect", "rect", 340, 435),
    framedShape("ellipse", "ellipse", 600, 600),
    line,
  ]);
}
function node(forest: readonly SheetDrawing[], id = "connector"): SheetDrawing | ShapeGroupChild {
  const visit = (
    value: SheetDrawing | ShapeGroupChild,
  ): SheetDrawing | ShapeGroupChild | undefined => {
    if (value.id === id) return value;
    if (value.kind === "shapeGroup")
      for (const member of value.members) {
        const found = visit(member);
        if (found) return found;
      }
  };
  for (const root of forest) {
    const found = visit(root);
    if (found) return found;
  }
  throw new Error(`Missing fixture node ${id}`);
}
function lineNode(forest: readonly SheetDrawing[]) {
  const value = node(forest);
  if (value.kind !== "shape" || !value.shapeGeometry || !value.shapeConnector)
    throw new Error("Expected live connector");
  return value;
}
function owned(value: SheetFramedGraphicDrawing): SheetGroupedGraphicDrawing {
  const { shapeFrame: _frame, ...appearance } = value;
  return {
    ...appearance,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.25 },
    },
  };
}
function resolved(forest: readonly SheetDrawing[], m = metrics()) {
  const value = resolveSheetShapeConnections(forest, m).getConnector("connector")!;
  if (
    value.status === "suspended" ||
    value.begin.status !== "ready" ||
    value.end.status !== "ready"
  )
    throw new Error("Expected ready connector");
  return value;
}
function handleWorld(forest: readonly SheetDrawing[], handleIndex = 0) {
  const route = resolved(forest).route;
  if (route.status !== "ready") throw new Error("Expected nondegenerate route");
  return shapeFrameLocalToWorld(
    route.paintLayout.rect,
    route.paintLayout.angleDeg,
    route.geometry.handles[handleIndex]!.position,
  );
}
function axisPoint(
  forest: readonly SheetDrawing[],
  xRatio: number,
  yRatio: number,
): ShapeConnectorPoint {
  const value = resolved(forest);
  if (value.begin.status !== "ready" || value.end.status !== "ready")
    throw new Error("Expected tips");
  const begin = value.begin.position,
    end = value.end.position,
    radians = (value.carrierLayout!.angleDeg * Math.PI) / 180,
    cos = Math.cos(radians),
    sin = Math.sin(radians),
    dx = end.x - begin.x,
    dy = end.y - begin.y,
    x = (cos * dx + sin * dy) * xRatio,
    y = (-sin * dx + cos * dy) * yRatio;
  return { x: begin.x + cos * x - sin * y, y: begin.y + sin * x + cos * y };
}
function expectPoint(actual: ShapeConnectorPoint, expected: ShapeConnectorPoint): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}
function expectOnlyAdjustmentsChanged(
  original: readonly SheetDrawing[],
  result: readonly SheetDrawing[],
): void {
  const expected = structuredClone(original),
    before = lineNode(expected),
    after = lineNode(result);
  expect(after.shapeGeometry!.preset).toBe(before.shapeGeometry!.preset);
  before.shapeGeometry = structuredClone(after.shapeGeometry);
  expect(result).toEqual(expected);
  const old = resolved(original),
    next = resolved(result);
  expect(next.begin).toEqual(old.begin);
  expect(next.end).toEqual(old.end);
  if (next.route.status !== "ready" || next.begin.status !== "ready" || next.end.status !== "ready")
    throw new Error("Expected route and tips");
  for (const [local, expectedPoint] of [
    [next.route.localEndpoints[0], next.begin.position],
    [next.route.localEndpoints[1], next.end.position],
  ] as const)
    expectPoint(
      shapeFrameLocalToWorld(next.route.paintLayout.rect, next.route.paintLayout.angleDeg, local),
      expectedPoint,
    );
}
function freeForest(
  preset: ShapePresetName,
  xSpan: number,
  ySpan: number,
  width = 100,
  height = 60,
) {
  const line = connectorShape();
  line.shapeGeometry = { preset };
  line.shapeFrame.anchor = { mode: "fixed", x: 0, y: 0, size: { width, height } };
  line.shapeConnector = {
    kind: "shape-connector-v1",
    begin: { kind: "free", xRatio: 0, yRatio: 0 },
    end: { kind: "free", xRatio: xSpan / width, yRatio: ySpan / height },
  };
  return normalizeShapeDrawingForest([line]);
}

describe("atomic live connector yellow route adjustment", () => {
  test.each(["bentConnector3", "curvedConnector3"] as const)(
    "%s keeps both orange bindings and moves only the declared horizontal route field",
    (preset) => {
      const forest = fixture(preset),
        original = structuredClone(forest),
        result = planShapeConnectorRouteAdjustment(
          forest,
          rootSource,
          0,
          { x: 560, y: 580 },
          metrics(),
        );
      expect(lineNode(result).shapeGeometry!.adjustments!.adj1).toBeCloseTo(75000, 6);
      expectPoint(handleWorld(result), { x: 560, y: 547.5 });
      expectOnlyAdjustmentsChanged(original, result);
      expect(forest).toEqual(original);
      expect(result).not.toBe(forest);
      expect(result[0]).not.toBe(forest[0]);
    },
  );

  test.each(["root", "owned", "nested"] as const)(
    "%s sources invert the full 37-degree carrier axes once across bound/mixed/free endpoints and flips",
    (ownership) => {
      for (const preset of ["bentConnector3", "curvedConnector3"] as const)
        for (const binding of ["bound", "mixed", "free"] as const)
          for (const [flipX, flipY] of [
            [false, false],
            [true, false],
            [false, true],
            [true, true],
          ] as const) {
            const roots = fixture(preset),
              line = roots[2] as SheetFramedGraphicDrawing;
            if (flipX) line.shapeFlipX = true;
            else delete line.shapeFlipX;
            if (flipY) line.shapeFlipY = true;
            else delete line.shapeFlipY;
            if (binding !== "bound")
              line.shapeConnector!.end = { kind: "free", xRatio: 1.25, yRatio: 0.75 };
            if (binding === "free")
              line.shapeConnector!.begin = { kind: "free", xRatio: -0.25, yRatio: 0.1 };
            let source = rootSource;
            if (ownership === "root") line.rotation = 37;
            else if (ownership === "owned") {
              roots[2] = { ...group("owner"), rotation: 37, members: [owned(line)] };
              source = { connectorId: "connector", path: ["owner", "connector"] };
            } else {
              line.rotation = 13;
              roots[2] = {
                ...group("owner"),
                rotation: 11,
                members: [{ ...nested("inner"), rotation: 13, members: [owned(line)] }],
              };
              source = { connectorId: "connector", path: ["owner", "inner", "connector"] };
            }
            const forest = normalizeShapeDrawingForest(roots),
              original = structuredClone(forest);
            expect(resolved(forest).carrierLayout!.angleDeg).toBe(37);
            const result = planShapeConnectorRouteAdjustment(
              forest,
              source,
              0,
              axisPoint(forest, 0.75, 0.9),
              metrics(),
            );
            expect(lineNode(result).shapeGeometry!.adjustments!.adj1).toBeCloseTo(75000, 5);
            expectPoint(handleWorld(result), axisPoint(original, 0.75, 0.5));
            expectOnlyAdjustmentsChanged(original, result);
            expect(forest).toEqual(original);
            expect(resolved(result).path).toEqual(source.path);
          }
    },
  );

  test("one-axis inverses use actual spans and ignore one-pixel paint padding", () => {
    for (const [xSpan, ySpan] of [
      [100, 0],
      [0.25, 100],
      [0.00001, 1],
      [-0.25, 100],
    ] as const) {
      const forest = freeForest("bentConnector3", xSpan, ySpan),
        original = structuredClone(forest),
        target = { x: axisPoint(forest, 0.75, 0).x, y: 17 },
        result = planShapeConnectorRouteAdjustment(forest, rootSource, 0, target, metrics());
      expect(lineNode(result).shapeGeometry!.adjustments!.adj1).toBeCloseTo(75000, 5);
      expectPoint(handleWorld(result), { x: target.x, y: ySpan / 2 });
      expectOnlyAdjustmentsChanged(original, result);
    }
  });

  test("cardinal carrier rotations preserve ordered tips and never apply source flips twice", () => {
    for (const angle of [90, 180, 270]) {
      const forest = fixture("curvedConnector3"),
        line = lineNode(forest);
      line.rotation = angle;
      line.shapeFlipX = true;
      line.shapeFlipY = true;
      const original = structuredClone(forest),
        result = planShapeConnectorRouteAdjustment(
          forest,
          rootSource,
          0,
          axisPoint(forest, 0.75, 0.9),
          metrics(),
        );
      expect(lineNode(result).shapeGeometry!.adjustments!.adj1).toBeCloseTo(75000, 5);
      expectPoint(handleWorld(result), axisPoint(original, 0.75, 0.5));
      expectOnlyAdjustmentsChanged(original, result);
      expect(forest).toEqual(original);
    }
  });

  test("a vertical route permits its declared y handle but refuses its zero x handle", () => {
    const forest = freeForest("bentConnector4", 0, 100),
      original = structuredClone(forest),
      result = planShapeConnectorRouteAdjustment(
        forest,
        rootSource,
        1,
        { x: 90, y: 75 },
        metrics(),
      );
    expect(lineNode(result).shapeGeometry).toEqual({
      preset: "bentConnector4",
      adjustments: { adj2: 75000 },
    });
    expectPoint(handleWorld(result, 1), { x: 0, y: 75 });
    expectOnlyAdjustmentsChanged(original, result);
    expect(() =>
      planShapeConnectorRouteAdjustment(forest, rootSource, 0, { x: 90, y: 75 }, metrics()),
    ).toThrow(/axis|span|represent/);
    expect(forest).toEqual(original);
    const horizontal = freeForest("bentConnector4", 100, 0);
    expect(() =>
      planShapeConnectorRouteAdjustment(horizontal, rootSource, 1, { x: 75, y: 90 }, metrics()),
    ).toThrow(/axis|span|represent/);
  });

  test("coincident tips reject route dragging without inventing a route or missing handle", () => {
    const forest = freeForest("bentConnector3", 0, 0),
      original = structuredClone(forest);
    expect(() =>
      planShapeConnectorRouteAdjustment(forest, rootSource, 0, { x: 10, y: 10 }, metrics()),
    ).toThrow(/axis|span|represent/);
    expect(() =>
      planShapeConnectorRouteAdjustment(forest, rootSource, 1, { x: 10, y: 10 }, metrics()),
    ).toThrow(/handle/);
    expect(forest).toEqual(original);
  });

  test("37-degree cancellation cannot fabricate an invertible declared route axis", () => {
    const forest = freeForest("bentConnector3", 0, 60),
      line = lineNode(forest);
    line.rotation = 37;
    const original = structuredClone(forest);
    expect(() => resolved(forest)).not.toThrow();
    expect(() =>
      planShapeConnectorRouteAdjustment(forest, rootSource, 0, { x: 10, y: 10 }, metrics()),
    ).toThrow(/axis|span|represent/);
    expect(forest).toEqual(original);
  });

  test.each(["bentConnector3", "curvedConnector3"] as const)(
    "%s uniformly scales the inverse evaluator for 16,384 by 8,192 source frames",
    (preset) => {
      const forest = fixture(preset),
        line = lineNode(forest) as SheetFramedGraphicDrawing;
      line.shapeFrame.anchor = {
        mode: "fixed",
        x: -100,
        y: -200,
        size: { width: 16384, height: 8192 },
      };
      const original = structuredClone(forest),
        result = planShapeConnectorRouteAdjustment(
          forest,
          rootSource,
          0,
          { x: 560, y: 580 },
          metrics(),
        );
      expect(lineNode(result).shapeGeometry!.adjustments!.adj1).toBeCloseTo(75000, 5);
      expectOnlyAdjustmentsChanged(original, result);
      expect(forest).toEqual(original);
    },
  );

  test("portrait display frames share one inverse scale and change only the declared y adjustment", () => {
    const forest = freeForest("curvedConnector4", 160, 165, 8192, 16384);
    lineNode(forest).shapeGeometry = { preset: "curvedConnector4", adjustments: { adj1: 37000 } };
    const original = structuredClone(forest),
      result = planShapeConnectorRouteAdjustment(
        forest,
        rootSource,
        1,
        { x: -30, y: 123.75 },
        metrics(),
      );
    expect(lineNode(result).shapeGeometry!.adjustments!.adj1).toBe(37000);
    expect(lineNode(result).shapeGeometry!.adjustments!.adj2).toBeCloseTo(75000, 5);
    expectOnlyAdjustmentsChanged(original, result);
    expect(forest).toEqual(original);
  });

  test("declared adjustment boundaries clamp while other fields stay untouched", () => {
    for (const [targetX, adjustment] of [
      [1, 2147483647],
      [-1, -2147483647],
    ] as const) {
      const forest = freeForest("bentConnector4", 0.00001, 1, 1, 1);
      lineNode(forest).shapeGeometry = { preset: "bentConnector4", adjustments: { adj2: 37000 } };
      const original = structuredClone(forest),
        result = planShapeConnectorRouteAdjustment(
          forest,
          rootSource,
          0,
          { x: targetX, y: 500 },
          metrics(),
        );
      expect(lineNode(result).shapeGeometry!.adjustments).toEqual({
        adj1: adjustment,
        adj2: 37000,
      });
      expectOnlyAdjustmentsChanged(original, result);
      expect(forest).toEqual(original);
    }
  });

  test.each(["root", "nested"] as const)(
    "%s route edits commit one Core history item and snapshot63 restores exact adjustments and bindings",
    (ownership) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook),
        roots = fixture("curvedConnector3");
      let source = rootSource;
      if (ownership === "nested") {
        roots[2] = {
          ...group("owner"),
          rotation: 11,
          members: [
            {
              ...nested("inner"),
              rotation: 13,
              members: [owned(roots[2] as SheetFramedGraphicDrawing)],
            },
          ],
        };
        source = { connectorId: "connector", path: ["owner", "inner", "connector"] };
      }
      sheet.drawings = normalizeShapeDrawingForest(roots);
      const m = createPictureSheetMetrics(sheet),
        before = serializeWorkbook(session.workbook),
        next = planShapeConnectorRouteAdjustment(
          sheet.drawings,
          source,
          0,
          axisPoint(sheet.drawings, 0.75, 0.9),
          m,
        );
      expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, next))).toBe(
        true,
      );
      expect(session.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(session.workbook);
      expect(after.version).toBe(63);
      expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
      undoWorkbookCommand(session);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      redoWorkbookCommand(session);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
      expectOnlyAdjustmentsChanged(
        getActiveSheet(deserializeWorkbook(before)).drawings!,
        sheet.drawings!,
      );
    },
  );

  test("an unchanged yellow handle remains a detached canonical no-op without history", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = fixture();
    const original = structuredClone(sheet.drawings),
      result = planShapeConnectorRouteAdjustment(
        sheet.drawings,
        rootSource,
        0,
        handleWorld(sheet.drawings),
        createPictureSheetMetrics(sheet),
      );
    expect(result).toEqual(original);
    expect(result).not.toBe(sheet.drawings);
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, result))).toBe(
      false,
    );
    expect(session.history.undoStack).toHaveLength(0);
  });
});

describe("route adjustment identity, admission and numeric refusal", () => {
  test("straight and handleless connector presets never acquire a yellow handle", () => {
    for (const preset of ["line", "lineInv", "bentConnector2", "curvedConnector2"] as const) {
      const forest = fixture(preset),
        original = structuredClone(forest);
      expect(() =>
        planShapeConnectorRouteAdjustment(forest, rootSource, 0, { x: 560, y: 580 }, metrics()),
      ).toThrow(/handle/);
      expect(forest).toEqual(original);
    }
  });

  test("stale current source identities reject before reading sheet metrics", () => {
    const badMetrics = {
      columns: {
        visiblePrefix() {
          throw new Error("METRICS READ");
        },
      },
      rows: {},
    } as never;
    for (const source of [
      { connectorId: "gone", path: ["gone"] },
      { connectorId: "connector", path: ["owner", "connector"] },
      { connectorId: "connector", path: ["rect"] },
      { connectorId: "rect", path: ["rect"] },
    ])
      expect(() =>
        planShapeConnectorRouteAdjustment(fixture(), source, 0, { x: 560, y: 580 }, badMetrics),
      ).toThrow(/source.*(identity|connector)/i);
  });

  test("strict finite target, index and source validation never invokes caller getters", () => {
    const forest = fixture(),
      original = structuredClone(forest),
      getter = {
        get x(): number {
          throw new Error("GETTER EXECUTED");
        },
        y: 0,
      };
    for (const target of [
      { x: NaN, y: 0 },
      { x: 0, y: Infinity },
      { x: 10000001, y: 0 },
      { x: 0, y: 0, extra: 1 },
      getter,
    ])
      expect(() =>
        planShapeConnectorRouteAdjustment(forest, rootSource, 0, target, metrics()),
      ).toThrow(/budget|data/);
    for (const handleIndex of [-1, 0.5, NaN, Infinity, 1, Number.MAX_SAFE_INTEGER + 1])
      expect(() =>
        planShapeConnectorRouteAdjustment(
          forest,
          rootSource,
          handleIndex,
          { x: 560, y: 580 },
          metrics(),
        ),
      ).toThrow(/handle/);
    for (const source of [
      { connectorId: "", path: ["connector"] },
      { connectorId: "connector", path: [] },
      { connectorId: "connector", path: Array(100).fill("connector") },
      { connectorId: "x".repeat(513), path: ["connector"] },
      {
        get connectorId(): string {
          throw new Error("GETTER EXECUTED");
        },
        path: ["connector"],
      },
    ])
      expect(() =>
        planShapeConnectorRouteAdjustment(forest, source, 0, { x: 560, y: 580 }, metrics()),
      ).toThrow(/budget|non-empty|data/);
    expect(forest).toEqual(original);
  });

  test("collapsed source or bound target refuses adjustment atomically", () => {
    const sheet = createSheet("Synthetic", "sheet");
    setSheetDimensionHidden(sheet, "column", 0, true);
    const m = createPictureSheetMetrics(sheet);
    for (const id of ["connector", "rect"]) {
      const forest = fixture(),
        value = node(forest, id) as SheetFramedGraphicDrawing;
      value.shapeFrame.anchor = {
        mode: "move-and-size",
        start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
        end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
      };
      const original = structuredClone(forest);
      expect(() =>
        planShapeConnectorRouteAdjustment(forest, rootSource, 0, { x: 560, y: 580 }, m),
      ).toThrow(/available|collapsed/);
      expect(forest).toEqual(original);
    }
  });

  test("inverse coordinates and rerouted render extents retain existing budgets", () => {
    for (const [forest, target] of [
      [freeForest("bentConnector3", 0.00001, 1, 16384, 8192), { x: 10, y: 0 }],
      [freeForest("bentConnector3", 100, 60), { x: 20000, y: 0 }],
    ] as const) {
      const original = structuredClone(forest);
      expect(() =>
        planShapeConnectorRouteAdjustment(forest, rootSource, 0, target, metrics()),
      ).toThrow(/budget/);
      expect(forest).toEqual(original);
    }
  });

  test("full-forest admission rejects stale dependent bindings without mutating input", () => {
    const forest = fixture();
    lineNode(forest).shapeConnector!.end = {
      kind: "site",
      targetId: "missing",
      preset: "ellipse",
      siteIndex: 2,
    };
    const original = structuredClone(forest);
    expect(() =>
      planShapeConnectorRouteAdjustment(forest, rootSource, 0, { x: 560, y: 580 }, metrics()),
    ).toThrow(/target|missing/);
    expect(forest).toEqual(original);
  });
});
