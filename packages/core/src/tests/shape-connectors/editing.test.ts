import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import {
  planShapeConnectorBodyTranslation,
  planShapeConnectorEndpointChange,
  type ShapeConnectorEditSource,
  type ShapeConnectorEndpointEdit,
} from "../../shape-connector-editing.js";
import { resolveSheetShapeConnections } from "../../shape-connector-layout.js";
import type { ShapeConnectorPoint } from "../../shape-connector-route.js";
import type { ShapeGroupChild, SheetGroupedGraphicDrawing } from "../../shape-group.js";
import { canEditSheetDrawingCollection } from "../../shape-protection.js";
import {
  normalizeSheetDrawings,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
} from "../../sheet-drawings.js";
import { createSheet, getActiveSheet, setSheetDimensionHidden } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { group, metrics, nested } from "../shape-groups/fixtures.js";
import { connectorShape, framedShape } from "./layout-fixtures.js";

const rootSource: ShapeConnectorEditSource = { connectorId: "connector", path: ["connector"] };
const topSite: ShapeConnectorEndpointEdit = {
  kind: "site",
  targetId: "rect",
  targetPath: ["rect"],
  preset: "rect",
  siteIndex: 0,
};
function fixture(): SheetFramedGraphicDrawing[] {
  return [framedShape("rect"), framedShape("ellipse", "ellipse", 210, 110), connectorShape()];
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
function node(forest: readonly SheetDrawing[], id = "connector"): SheetDrawing | ShapeGroupChild {
  const visit = (
    value: SheetDrawing | ShapeGroupChild,
  ): SheetDrawing | ShapeGroupChild | undefined => {
    if (value.id === id) return value;
    if (value.kind === "shapeGroup")
      for (const member of value.members) {
        const result = visit(member);
        if (result) return result;
      }
  };
  for (const root of forest) {
    const result = visit(root);
    if (result) return result;
  }
  throw new Error(`Missing fixture node ${id}`);
}
function relation(forest: readonly SheetDrawing[]) {
  const value = node(forest);
  if (value.kind !== "shape" || !value.shapeConnector) throw new Error("Expected connector");
  return value.shapeConnector;
}
function positions(forest: readonly SheetDrawing[], m = metrics()) {
  const resolved = resolveSheetShapeConnections(forest, m).getConnector("connector")!;
  if (resolved.begin.status !== "ready" || resolved.end.status !== "ready")
    throw new Error("Expected ready tips");
  return { begin: resolved.begin.position, end: resolved.end.position };
}
function expectPoint(actual: ShapeConnectorPoint, expected: ShapeConnectorPoint): void {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
}
function expectOnlyRelationChanged(
  original: readonly SheetDrawing[],
  result: readonly SheetDrawing[],
): void {
  const expected = structuredClone(original);
  const value = node(expected);
  if (value.kind !== "shape") throw new Error("Expected shape");
  value.shapeConnector = structuredClone(relation(result));
  expect(result).toEqual(expected);
}
function stretch(value: Pick<SheetFramedGraphicDrawing, "shapeFrame">): void {
  value.shapeFrame.anchor = {
    mode: "move-and-size",
    start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
    end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
  };
}

describe("atomic whole-forest connector interaction planning", () => {
  test("single-end same-target rebind retains the opposite binding and all source appearance", () => {
    const forest = fixture();
    forest[2]!.shapeGeometry = { preset: "bentConnector3", adjustments: { adj1: 37000 } };
    forest[2]!.shapeLineEnds = { begin: { kind: "triangle" }, end: { kind: "open" } };
    const original = structuredClone(forest);
    const old = positions(forest);
    const result = planShapeConnectorEndpointChange(
      forest,
      rootSource,
      "begin",
      topSite,
      metrics(),
    );
    expect(relation(result).begin).toEqual({
      kind: "site",
      targetId: "rect",
      preset: "rect",
      siteIndex: 0,
    });
    expect(relation(result).end).toEqual(relation(original).end);
    expectPoint(positions(result).begin, { x: 60, y: 20 });
    expectPoint(positions(result).end, old.end);
    expectOnlyRelationChanged(original, result);
    expect(forest).toEqual(original);
    expect(result[0]).not.toBe(forest[0]);
  });

  test("one free world edit retains the opposite bound end through inverse flips and 37-degree rotation", () => {
    for (const endName of ["begin", "end"] as const) {
      const forest = fixture();
      forest[2]!.rotation = 37;
      forest[2]!.shapeFlipX = true;
      forest[2]!.shapeFlipY = true;
      const original = structuredClone(forest);
      const old = positions(forest);
      const point = { x: 498.125, y: 381.375 };
      const result = planShapeConnectorEndpointChange(
        forest,
        rootSource,
        endName,
        { kind: "free", position: point },
        metrics(),
      );
      const opposite = endName === "begin" ? "end" : "begin";
      expect(relation(result)[endName].kind).toBe("free");
      expect(relation(result)[opposite]).toEqual(relation(original)[opposite]);
      expectPoint(positions(result)[endName], point);
      expectPoint(positions(result)[opposite], old[opposite]);
      expectOnlyRelationChanged(original, result);
      expect(forest).toEqual(original);
    }
  });

  test("a free endpoint can rebind to a different eligible root without moving its other end", () => {
    const forest = fixture();
    forest.push(framedShape("third", "rect", 300, 50));
    forest[2]!.shapeConnector!.begin = { kind: "free", xRatio: 0.1, yRatio: 0.4 };
    const before = positions(forest);
    const result = planShapeConnectorEndpointChange(
      forest,
      rootSource,
      "begin",
      { ...topSite, targetId: "third", targetPath: ["third"] },
      metrics(),
    );
    expectPoint(positions(result).begin, { x: 350, y: 50 });
    expectPoint(positions(result).end, before.end);
    expect(relation(result).end).toEqual(relation(forest).end);
  });

  test("single-end rebind leaves an opposite free endpoint's exact stored ratios unchanged", () => {
    const forest = fixture();
    forest[2]!.rotation = 37;
    forest[2]!.shapeFlipY = true;
    forest[2]!.shapeConnector!.end = { kind: "free", xRatio: -0.125, yRatio: 0.375 };
    const original = structuredClone(forest);
    const before = positions(forest);
    const result = planShapeConnectorEndpointChange(
      forest,
      rootSource,
      "begin",
      topSite,
      metrics(),
    );
    expect(relation(result).end).toEqual(relation(original).end);
    expectPoint(positions(result).end, before.end);
    expectOnlyRelationChanged(original, result);
    expect(forest).toEqual(original);
  });

  test("nested owned source/target paths use the full forest and complete inherited rotation once", () => {
    const target = owned(framedShape("rect"));
    target.rotation = 17;
    target.shapeFlipX = true;
    const line = owned(connectorShape());
    line.rotation = 13;
    line.shapeFlipX = true;
    line.shapeFlipY = true;
    const forest: SheetDrawing[] = [
      { ...group("target-owner"), rotation: 31, members: [target] },
      framedShape("ellipse", "ellipse", 210, 110),
      {
        ...group("line-owner"),
        rotation: 37,
        members: [{ ...nested("line-inner"), rotation: 23, members: [line] }],
      },
    ];
    const source = { connectorId: "connector", path: ["line-owner", "line-inner", "connector"] };
    const original = structuredClone(forest);
    const before = resolveSheetShapeConnections(forest, metrics());
    expect(before.getConnector("connector")!.carrierLayout!.angleDeg).toBe(73);
    const edited = planShapeConnectorEndpointChange(
      forest,
      source,
      "begin",
      { ...topSite, targetPath: ["target-owner", "rect"] },
      metrics(),
    );
    expectPoint(positions(edited).begin, before.getTarget("rect")!.sites[0]!.position);
    expectPoint(positions(edited).end, positions(forest).end);
    expectOnlyRelationChanged(original, edited);
    const point = { x: 140.5, y: 199.25 };
    const freed = planShapeConnectorEndpointChange(
      edited,
      source,
      "begin",
      { kind: "free", position: point },
      metrics(),
    );
    expectPoint(positions(freed).begin, point);
    expectPoint(positions(freed).end, positions(forest).end);
    expectOnlyRelationChanged(original, freed);
    expect(forest).toEqual(original);
  });

  test("body translation frees both ordered ends at old positions plus world delta, retaining carrier and targets", () => {
    for (const isOwned of [false, true]) {
      const line = connectorShape();
      line.rotation = 37;
      line.shapeFlipX = true;
      line.shapeFlipY = true;
      const forest: SheetDrawing[] = [
        framedShape("rect"),
        framedShape("ellipse", "ellipse", 210, 110),
        isOwned ? { ...group("owner"), rotation: 37, members: [owned(line)] } : line,
      ];
      const source = {
        connectorId: "connector",
        path: isOwned ? ["owner", "connector"] : ["connector"],
      };
      const original = structuredClone(forest);
      const old = positions(forest);
      const result = planShapeConnectorBodyTranslation(
        forest,
        source,
        { x: 30, y: -12.5 },
        metrics(),
      );
      expect(relation(result).begin.kind).toBe("free");
      expect(relation(result).end.kind).toBe("free");
      expectPoint(positions(result).begin, { x: old.begin.x + 30, y: old.begin.y - 12.5 });
      expectPoint(positions(result).end, { x: old.end.x + 30, y: old.end.y - 12.5 });
      expectOnlyRelationChanged(original, result);
      expect(forest).toEqual(original);
      expect(
        resolveSheetShapeConnections(result, metrics()).getConnector("connector")!.path,
      ).toEqual(source.path);
    }
  });

  test("whole collection history restores geometry AND both bindings after body drag, with exact redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.drawings = normalizeSheetDrawings(fixture());
    const original = structuredClone(sheet.drawings);
    const m = createPictureSheetMetrics(sheet);
    const result = planShapeConnectorBodyTranslation(
      sheet.drawings,
      rootSource,
      { x: 30, y: 30 },
      m,
    );
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, result))).toBe(
      true,
    );
    expect(session.history.undoStack).toHaveLength(1);
    expect(relation(sheet.drawings!).begin.kind).toBe("free");
    undoWorkbookCommand(session);
    expect(sheet.drawings).toEqual(original);
    expect(relation(sheet.drawings!).begin.kind).toBe("site");
    expect(relation(sheet.drawings!).end.kind).toBe("site");
    redoWorkbookCommand(session);
    expect(sheet.drawings).toEqual(result);
  });

  test("zero delta and unchanged site are detached structural no-ops and create no history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.drawings = normalizeSheetDrawings(fixture());
    const original = structuredClone(sheet.drawings);
    const m = createPictureSheetMetrics(sheet);
    const result = planShapeConnectorBodyTranslation(
      sheet.drawings,
      rootSource,
      { x: -0, y: 0 },
      m,
    );
    expect(result).toEqual(original);
    expect(result).not.toBe(sheet.drawings);
    expect(result[2]).not.toBe(sheet.drawings[2]);
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, result))).toBe(
      false,
    );
    const same = planShapeConnectorEndpointChange(
      sheet.drawings,
      rootSource,
      "begin",
      { ...topSite, siteIndex: 3 },
      m,
    );
    expect(same).toEqual(original);
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, same))).toBe(
      false,
    );
    expect(session.history.undoStack).toHaveLength(0);
    expect(session.history.revision).toBe(0);
  });

  test("moving a target remains derived and never rewrites connector data", () => {
    const forest = fixture();
    const before = relation(forest);
    const moved = structuredClone(forest);
    const anchor = moved[0]!.shapeFrame.anchor;
    if (anchor.mode !== "fixed") throw new Error("Expected fixed frame");
    anchor.x += 40;
    anchor.y += 40;
    expectPoint(positions(moved).begin, { x: 150, y: 90 });
    expect(relation(moved)).toEqual(before);
    expect(relation(forest)).toEqual(before);
  });

  test("coincident tips can translate as an ordered degenerate connector", () => {
    const forest = [framedShape("rect"), connectorShape()];
    forest[1]!.shapeConnector!.end = {
      kind: "site",
      targetId: "rect",
      preset: "rect",
      siteIndex: 3,
    };
    const old = positions(forest);
    const result = planShapeConnectorBodyTranslation(
      forest,
      rootSource,
      { x: 30, y: 30 },
      metrics(),
    );
    expectPoint(positions(result).begin, { x: old.begin.x + 30, y: old.begin.y + 30 });
    expect(positions(result).end).toEqual(positions(result).begin);
    expect(resolveSheetShapeConnections(result, metrics()).getConnector("connector")!.status).toBe(
      "degenerate",
    );
  });
});

describe("connector edit identity, budgets and representability", () => {
  test("stale source ID/path and missing/nonconnector sources reject before metrics are read", () => {
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
    ]) {
      expect(() =>
        planShapeConnectorBodyTranslation(fixture(), source, { x: 0, y: 0 }, badMetrics),
      ).toThrow(/source.*(identity|connector)/i);
      expect(() =>
        planShapeConnectorEndpointChange(fixture(), source, "begin", topSite, badMetrics),
      ).toThrow(/source.*(identity|connector)/i);
    }
  });

  test("stale target path/ID/preset/site and ineligible line, group or connector targets reject atomically", () => {
    const forest: SheetDrawing[] = [...fixture(), group("owner"), framedShape("line", "line")];
    const original = structuredClone(forest);
    for (const edit of [
      { ...topSite, targetId: "gone", targetPath: ["gone"] },
      { ...topSite, targetPath: ["owner", "rect"] },
      { ...topSite, targetPath: ["ellipse"] },
      { ...topSite, preset: "ellipse" as const },
      { ...topSite, siteIndex: 15 },
      { ...topSite, targetId: "line", targetPath: ["line"], preset: "line" as const },
      { ...topSite, targetId: "owner", targetPath: ["owner"] },
      {
        ...topSite,
        targetId: "connector",
        targetPath: ["connector"],
        preset: "bentConnector3" as const,
      },
    ])
      expect(() =>
        planShapeConnectorEndpointChange(forest, rootSource, "begin", edit, metrics()),
      ).toThrow(/identity|ineligible|preset|site/);
    expect(forest).toEqual(original);
  });

  test("root/owned source and bound target display collapse refuse edits and body inverse without fallback", () => {
    const sheet = createSheet("Synthetic", "sheet");
    setSheetDimensionHidden(sheet, "column", 0, true);
    const m = createPictureSheetMetrics(sheet);
    for (const collapsed of ["source", "owned-source", "target"] as const) {
      const initial = fixture();
      const forest: SheetDrawing[] = initial;
      if (collapsed === "target") stretch(initial[0]!);
      else if (collapsed === "source") stretch(initial[2]!);
      else {
        const owner = group("owner");
        stretch(owner);
        owner.members = [owned(connectorShape())];
        forest[2] = owner;
      }
      const source = {
        connectorId: "connector",
        path: collapsed === "owned-source" ? ["owner", "connector"] : ["connector"],
      };
      const original = structuredClone(forest);
      expect(() => planShapeConnectorBodyTranslation(forest, source, { x: 30, y: 30 }, m)).toThrow(
        /available|collapsed/,
      );
      expect(() =>
        planShapeConnectorEndpointChange(
          forest,
          source,
          "end",
          { kind: "free", position: { x: 150, y: 150 } },
          m,
        ),
      ).toThrow(/available|collapsed/);
      expect(forest).toEqual(original);
    }
    const forest = fixture();
    const third = framedShape("third");
    stretch(third);
    forest.push(third);
    expect(() =>
      planShapeConnectorEndpointChange(
        forest,
        rootSource,
        "begin",
        { ...topSite, targetId: "third", targetPath: ["third"] },
        m,
      ),
    ).toThrow(/collapsed/);
  });

  test("inverse ratios/local coordinates and translated endpoint budgets reject without partial edits", () => {
    for (const [x, width] of [
      [-1_500_000, 1],
      [-20_000_000, 100],
    ] as const) {
      const forest = fixture();
      forest[2]!.shapeFrame.anchor = { mode: "fixed", x, y: 50, size: { width, height: 60 } };
      const original = structuredClone(forest);
      expect(() => resolveSheetShapeConnections(forest, metrics())).not.toThrow();
      expect(() =>
        planShapeConnectorEndpointChange(
          forest,
          rootSource,
          "begin",
          { kind: "free", position: { x: 130, y: 80 } },
          metrics(),
        ),
      ).toThrow(/budget/);
      expect(() =>
        planShapeConnectorBodyTranslation(forest, rootSource, { x: 30, y: 30 }, metrics()),
      ).toThrow(/budget/);
      expect(forest).toEqual(original);
    }
    const forest = fixture();
    const original = structuredClone(forest);
    expect(() =>
      planShapeConnectorBodyTranslation(forest, rootSource, { x: 10_000_000, y: 0 }, metrics()),
    ).toThrow(/budget/);
    expect(forest).toEqual(original);
  });

  test("tiny exact span lost to inverse carrier cancellation rejects instead of becoming degenerate", () => {
    const line = connectorShape();
    line.shapeFrame.anchor = { mode: "fixed", x: 0, y: 0, size: { width: 100, height: 60 } };
    line.shapeConnector = {
      kind: "shape-connector-v1",
      begin: { kind: "free", xRatio: 0, yRatio: 0 },
      end: { kind: "free", xRatio: 0.01, yRatio: 0 },
    };
    const forest = [line];
    const original = structuredClone(forest);
    expect(() =>
      planShapeConnectorEndpointChange(
        forest,
        rootSource,
        "end",
        { kind: "free", position: { x: 1e-20, y: 0 } },
        metrics(),
      ),
    ).toThrow(/represent/);
    expect(forest).toEqual(original);
  });

  test("strict finite/data-record/path/identity validation does not invoke getters or caller methods", () => {
    const forest = fixture();
    const getter = {
      get x(): number {
        throw new Error("GETTER EXECUTED");
      },
      y: 0,
    };
    for (const delta of [
      { x: NaN, y: 0 },
      { x: Infinity, y: 0 },
      { x: 10_000_001, y: 0 },
      { x: 0, y: 0, extra: true },
      getter,
    ])
      expect(() => planShapeConnectorBodyTranslation(forest, rootSource, delta, metrics())).toThrow(
        /budget|data/,
      );
    for (const source of [
      { connectorId: "", path: ["connector"] },
      { connectorId: "x".repeat(513), path: ["connector"] },
      { connectorId: "connector", path: [] },
      { connectorId: "connector", path: Array(100).fill("connector") },
      { connectorId: "connector", path: ["x".repeat(513)] },
    ])
      expect(() =>
        planShapeConnectorBodyTranslation(forest, source, { x: 0, y: 0 }, metrics()),
      ).toThrow();
    const accessorSource = {
      get connectorId(): string {
        throw new Error("GETTER EXECUTED");
      },
      path: ["connector"],
    };
    expect(() =>
      planShapeConnectorBodyTranslation(forest, accessorSource, { x: 0, y: 0 }, metrics()),
    ).toThrow(/data/);
    expect(() =>
      planShapeConnectorEndpointChange(forest, rootSource, "unknown" as never, topSite, metrics()),
    ).toThrow(/end name/);
    expect(() =>
      planShapeConnectorEndpointChange(
        forest,
        rootSource,
        "begin",
        { kind: "free", position: getter },
        metrics(),
      ),
    ).toThrow(/data/);
    expect(() =>
      planShapeConnectorEndpointChange(
        forest,
        rootSource,
        "begin",
        { ...topSite, position: { x: 0, y: 0 } } as never,
        metrics(),
      ),
    ).toThrow(/data/);
  });
});

describe("collection protection remains independent of planning", () => {
  test("locked targets can be rebound while the editable connector remains the only changed object", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const forest = fixture();
    forest[2]!.shapeProperties = { locked: false };
    sheet.drawings = normalizeSheetDrawings(forest);
    sheet.properties.protected = true;
    sheet.protection = { editableRanges: [] };
    const original = structuredClone(sheet.drawings);
    const m = createPictureSheetMetrics(sheet);
    const result = planShapeConnectorEndpointChange(
      sheet.drawings,
      rootSource,
      "begin",
      topSite,
      m,
    );
    expect(result[0]).toEqual(original[0]);
    expect(result[1]).toEqual(original[1]);
    expect(canEditSheetDrawingCollection(sheet, result)).toBe(true);
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, result))).toBe(
      true,
    );
  });

  test("planning does not grant editing permission to a locked root or owned connector", () => {
    for (const isOwned of [false, true]) {
      const session = createTestWorkbookSession();
      const sheet = getActiveSheet(session.workbook);
      const inner = owned(connectorShape());
      inner.shapeProperties = { locked: false };
      sheet.drawings = normalizeSheetDrawings(
        isOwned
          ? [
              framedShape("rect"),
              framedShape("ellipse", "ellipse", 210, 110),
              { ...group("owner"), members: [inner] },
            ]
          : fixture(),
      );
      sheet.properties.protected = true;
      sheet.protection = { editableRanges: [] };
      const original = structuredClone(sheet.drawings);
      const source = {
        connectorId: "connector",
        path: isOwned ? ["owner", "connector"] : ["connector"],
      };
      const result = planShapeConnectorBodyTranslation(
        sheet.drawings,
        source,
        { x: 30, y: 30 },
        createPictureSheetMetrics(sheet),
      );
      expect(canEditSheetDrawingCollection(sheet, result)).toBe(false);
      expect(() =>
        executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, result)),
      ).toThrow(/protected/);
      expect(sheet.drawings).toEqual(original);
      expect(session.history.undoStack).toHaveLength(0);
    }
  });
});
