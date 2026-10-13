import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createPictureSheetMetrics,
  locatePictureAxisPoint,
} from "@sheetcraft/core/picture-axis-metrics";
import * as connectionLayout from "@sheetcraft/core/shape-connector-layout";
import type { ShapeConnector } from "@sheetcraft/core/shape-connector";
import type {
  ShapeGroupChild,
  ShapeGroupDrawing,
  ShapeGroupedGroup,
  SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import type { SheetFramedGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSheet, type Sheet } from "@sheetcraft/core/workbook";
import { getSheetContentExtent } from "../../extent.js";

function shape(id: string): SheetFramedGraphicDrawing {
  return {
    id,
    kind: "shape",
    name: id,
    text: "",
    shape: "rectangle",
    shapeGeometry: { preset: "rect" },
    fill: "#abcdef",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 12,
    bold: false,
    italic: false,
    rotation: 0,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 110, y: 50, size: { width: 100, height: 60 } },
    },
  };
}
function connector(id = "connector"): SheetFramedGraphicDrawing & {
  shapeConnector: ShapeConnector;
} {
  return {
    ...shape(id),
    shapeGeometry: { preset: "bentConnector3" },
    shapeConnector: {
      kind: "shape-connector-v1",
      begin: { kind: "free", xRatio: 0, yRatio: 0 },
      end: { kind: "free", xRatio: 100, yRatio: 1 },
    },
  };
}
function owned(drawing: SheetFramedGraphicDrawing): SheetGroupedGraphicDrawing {
  const { shapeFrame: _frame, ...appearance } = drawing;
  return {
    ...appearance,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
    },
  };
}
function owner(id: string, members: ShapeGroupChild[]): ShapeGroupDrawing {
  return {
    id,
    kind: "shapeGroup",
    name: id,
    rotation: 0,
    shapeFrame: shape(id).shapeFrame,
    members,
  };
}
function nested(id: string, members: ShapeGroupChild[]): ShapeGroupedGroup {
  return {
    id,
    kind: "shapeGroup",
    name: id,
    rotation: 0,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
    },
    members,
  };
}
function readyRoute(sheet: Sheet, id = "connector") {
  const resolved = connectionLayout
    .resolveSheetShapeConnections(sheet.drawings!, createPictureSheetMetrics(sheet))
    .getConnector(id)!;
  expect(resolved.status).toBe("ready");
  if (resolved.status !== "ready" || resolved.route.status !== "ready")
    throw new Error("Expected ready connector route.");
  return resolved.route;
}
function routeExtent(sheet: Sheet, id = "connector") {
  const { worldBounds } = readyRoute(sheet, id);
  const metrics = createPictureSheetMetrics(sheet);
  return {
    rowCount: locatePictureAxisPoint(worldBounds.y + worldBounds.height, metrics.rows).index + 1,
    columnCount:
      locatePictureAxisPoint(worldBounds.x + worldBounds.width, metrics.columns).index + 1,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("live shape connector content reachability", () => {
  test("a root free route extends the actual content floor beyond its fixed carrier", () => {
    const sheet = createSheet("Connectors", "sheet");
    sheet.drawings = [connector()];
    const before = structuredClone(sheet.drawings);
    expect(readyRoute(sheet).worldBounds).toEqual({ x: 110, y: 50, width: 10000, height: 60 });
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 5, columnCount: 106 });
    expect(sheet.drawings).toEqual(before);
  });

  test("a direct owned route extends reachability beyond both leaf and owner carriers", () => {
    const sheet = createSheet("Connectors", "sheet");
    sheet.drawings = [owner("owner", [owned(connector())])];
    const before = structuredClone(sheet.drawings);
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 5, columnCount: 106 });
    expect(sheet.drawings).toEqual(before);
  });

  test("nested non-cardinal rotations include the composed 37-degree route world bounds", () => {
    const sheet = createSheet("Connectors", "sheet");
    const leaf = owned(connector());
    leaf.rotation = 7;
    const inner = nested("inner", [leaf]);
    inner.rotation = 13;
    const root = owner("owner", [inner]);
    root.rotation = 17;
    sheet.drawings = [root];
    const before = structuredClone(sheet.drawings);
    const route = readyRoute(sheet);
    expect(route.paintLayout.angleDeg).toBe(37);
    const expected = routeExtent(sheet);
    expect(expected.columnCount).toBeGreaterThan(80);
    expect(expected.rowCount).toBeGreaterThan(200);
    expect(getSheetContentExtent(sheet)).toEqual(expected);
    expect(sheet.drawings).toEqual(before);
  });

  test("owned targets in another root resolve through the complete forest, including out-of-tip controls", () => {
    const sheet = createSheet("Connectors", "sheet");
    const line = connector();
    line.shapeGeometry = { preset: "bentConnector3", adjustments: { adj1: 150000 } };
    line.shapeConnector.end = { kind: "site", targetId: "target", preset: "rect", siteIndex: 3 };
    const targetOwner = owner("target-owner", [nested("target-inner", [owned(shape("target"))])]);
    targetOwner.shapeFrame.anchor = {
      mode: "fixed",
      x: 9000,
      y: 4000,
      size: { width: 100, height: 60 },
    };
    sheet.drawings = [owner("line-owner", [owned(line)]), targetOwner];
    const before = structuredClone(sheet.drawings);
    const route = readyRoute(sheet);
    expect(route.end).toEqual({ x: 9100, y: 4030 });
    expect(route.worldBounds.x + route.worldBounds.width).toBe(13595);
    expect(getSheetContentExtent(sheet).columnCount).toBe(routeExtent(sheet).columnCount);
    expect(sheet.drawings).toEqual(before);
  });

  test.each(["root", "owned"] as const)(
    "a hidden %s carrier retains logical markers and restores its far route on unhide",
    (placement) => {
      const sheet = createSheet("Connectors", "sheet");
      const line = connector();
      const root = placement === "root" ? line : owner("owner", [owned(line)]);
      root.shapeFrame.anchor = {
        mode: "move-and-size",
        start: { column: { index: 3, offset: 0 }, row: { index: 200, offset: 0 } },
        end: { column: { index: 4, offset: 0 }, row: { index: 220, offset: 0 } },
      };
      sheet.drawings = [root];
      const before = structuredClone(sheet.drawings);
      const initial = getSheetContentExtent(sheet);
      expect(initial.columnCount).toBeGreaterThan(100);
      sheet.hiddenRows = new Set(Array.from({ length: 20 }, (_, index) => 200 + index));
      expect(
        connectionLayout
          .resolveSheetShapeConnections(sheet.drawings, createPictureSheetMetrics(sheet))
          .getConnector("connector")!.status,
      ).toBe("suspended");
      expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 221, columnCount: 5 });
      sheet.hiddenRows.clear();
      expect(getSheetContentExtent(sheet)).toEqual(initial);
      expect(sheet.drawings).toEqual(before);
    },
  );

  test("a hidden attached target suspends the body without releasing its end marker or binding", () => {
    const sheet = createSheet("Connectors", "sheet");
    const line = connector();
    line.shapeGeometry = { preset: "bentConnector3", adjustments: { adj1: 150000 } };
    line.shapeConnector.end = { kind: "site", targetId: "target", preset: "rect", siteIndex: 3 };
    const target = shape("target");
    target.shapeFrame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 30, offset: 0 }, row: { index: 150, offset: 0 } },
      end: { column: { index: 31, offset: 0 }, row: { index: 152, offset: 0 } },
    };
    sheet.drawings = [line, target];
    const before = structuredClone(sheet.drawings);
    const initial = getSheetContentExtent(sheet);
    expect(initial.columnCount).toBeGreaterThan(40);
    sheet.hiddenColumns = new Set([30]);
    expect(
      connectionLayout
        .resolveSheetShapeConnections(sheet.drawings, createPictureSheetMetrics(sheet))
        .getConnector("connector")!.status,
    ).toBe("suspended");
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 153, columnCount: 32 });
    sheet.hiddenColumns.clear();
    expect(getSheetContentExtent(sheet)).toEqual(initial);
    expect(sheet.drawings).toEqual(before);
  });

  test("unsupported route budgets fail explicitly instead of masquerading as carrier extent", () => {
    const sheet = createSheet("Connectors", "sheet");
    const line = connector();
    line.shapeConnector.end = { kind: "free", xRatio: 1000, yRatio: 1 };
    sheet.drawings = [line];
    const before = structuredClone(sheet.drawings);
    expect(() => getSheetContentExtent(sheet)).toThrow(
      /Connector connector route failed:.*render-extent budget/,
    );
    expect(sheet.drawings).toEqual(before);
  });

  test("a degenerate route retains its real coincident tips beyond the source carrier", () => {
    const sheet = createSheet("Connectors", "sheet");
    const line = connector();
    line.shapeConnector.begin = { kind: "free", xRatio: 100, yRatio: 100 };
    line.shapeConnector.end = { kind: "free", xRatio: 100, yRatio: 100 };
    sheet.drawings = [line];
    const before = structuredClone(sheet.drawings);
    const resolved = connectionLayout
      .resolveSheetShapeConnections(sheet.drawings, createPictureSheetMetrics(sheet))
      .getConnector("connector")!;
    expect(resolved.status).toBe("degenerate");
    expect(resolved).toMatchObject({
      route: { status: "degenerate", begin: { x: 10110, y: 6050 }, end: { x: 10110, y: 6050 } },
    });
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 253, columnCount: 106 });
    expect(sheet.drawings).toEqual(before);
  });

  test("an owned connector with a missing target cannot return a partial forest extent", () => {
    const sheet = createSheet("Connectors", "sheet");
    const line = connector();
    line.shapeConnector.end = { kind: "site", targetId: "missing", preset: "rect", siteIndex: 3 };
    sheet.drawings = [owner("owner", [owned(line)]), shape("unrelated")];
    expect(() => getSheetContentExtent(sheet)).toThrow(
      /target missing is missing from the sheet drawing forest/,
    );
  });

  test("multiple root and owned connectors share one full-sheet resolution", () => {
    const sheet = createSheet("Connectors", "sheet");
    sheet.drawings = [connector("root-line"), owner("owner", [owned(connector("owned-line"))])];
    const resolve = vi.spyOn(connectionLayout, "resolveSheetShapeConnections");
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 5, columnCount: 106 });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve.mock.calls[0]![0]).toBe(sheet.drawings);
  });

  test("connector-free roots retain legacy identity admission and never invoke the connector resolver", () => {
    const sheet = createSheet("Connectors", "sheet");
    sheet.drawings = [shape("legacy".repeat(100))];
    const resolve = vi.spyOn(connectionLayout, "resolveSheetShapeConnections");
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 5, columnCount: 3 });
    expect(resolve).not.toHaveBeenCalled();
  });
});
