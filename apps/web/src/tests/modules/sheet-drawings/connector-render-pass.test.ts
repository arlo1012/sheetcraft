// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { anchorShapeFrameRect, shapeFrameLocalToWorld } from "@sheetcraft/core/shape-frame";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import type { SheetFramedGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { resolveShapeForestForRender } from "../../../modules/sheet-drawings/resolved-shape-render-source";
import {
  resolveShapeDrawing,
  updateResolvedShapeDrawing,
} from "../../../modules/sheet-drawings/resolved-shape-drawing";
import {
  resolveShapeGroupProjection,
  updateResolvedShapeGroupLeaf,
} from "../../../modules/sheet-drawings/resolved-shape-group";
import {
  getDrawingShapeGeometry,
  getStandardShapeSvgPaths,
} from "../../../modules/sheet-drawings/shape-geometry";
import { framedShape } from "./framed-shape-fixture";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";

function fixture() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const target: SheetFramedGraphicDrawing = {
    ...framedShape(),
    id: "target",
    text: "",
    shapeGeometry: { preset: "rect" },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 40, y: 40, size: { width: 80, height: 50 } },
    },
  };
  const connection: SheetFramedGraphicDrawing = {
    ...framedShape(),
    id: "connection",
    text: "",
    shapeGeometry: { preset: "bentConnector3" },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 10, y: 200, size: { width: 140, height: 80 } },
    },
    shapeConnector: {
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId: "target", preset: "rect", siteIndex: 3 },
      end: { kind: "free", xRatio: 1, yRatio: 1 },
    },
  };
  sheet.drawings = [target, connection];
  return { workbook, sheet, target, connection, metrics: createPictureSheetMetrics(sheet) };
}
describe("whole-forest connector render pass", () => {
  test("same-content root and owned-node replacement invalidates a retained pass", () => {
    const f = fixture();
    let pass = resolveShapeForestForRender({
      drawings: f.sheet.drawings!,
      metrics: f.metrics,
      revision: 0,
    });
    f.sheet.drawings![0] = structuredClone(f.target);
    expect(() => pass.assertCurrent(f.sheet.drawings!, f.metrics, 0)).toThrow(/outdated/);
    f.sheet.drawings = groupShapeRoots(
      f.sheet.drawings!,
      ["target", "connection"],
      { id: "owner", name: "Owner" },
      f.metrics,
    );
    pass = resolveShapeForestForRender({
      drawings: f.sheet.drawings,
      metrics: f.metrics,
      revision: 0,
    });
    const owner = f.sheet.drawings[0]!;
    if (owner.kind !== "shapeGroup") throw Error("Expected group");
    owner.members[0] = structuredClone(owner.members[0]!);
    expect(() => pass.assertCurrent(f.sheet.drawings!, f.metrics, 0)).toThrow(
      /owner-node identities/,
    );
  });
  test("ordinary camera endpoint extras are detached without freezing caller data", () => {
    const f = fixture();
    const sparse: unknown[] = [];
    sparse.length = 3;
    const shared = { nested: { value: 1 }, sparse };
    const range = { start: { row: 0, column: 0, extra: shared }, end: { row: 0, column: 0 } };
    const camera = {
      ...createGraphicDrawing("camera", "wordArt", "Camera", { row: 0, column: 0 }),
      kind: "camera" as const,
      camera: { range, gridLines: false },
    };
    const drawings = [camera];
    const pass = resolveShapeForestForRender({ drawings, metrics: f.metrics, revision: 0 });
    expect(Object.isFrozen(shared)).toBe(false);
    expect(Object.isFrozen(shared.nested)).toBe(false);
    pass.assertCurrent(drawings, f.metrics, 0);
    shared.sparse.length = 4;
    expect(() => pass.assertCurrent(drawings, f.metrics, 0)).toThrow(/outdated/);
    shared.sparse.length = 3;
    shared.nested.value = 2;
    expect(() => pass.assertCurrent(drawings, f.metrics, 0)).toThrow(/outdated/);
  });
  test("ordinary optional endpoint cycles are safely detached and compared", () => {
    const f = fixture();
    const shared: { self?: object; value: number } = { value: 1 };
    shared.self = shared;
    const range = { start: { row: 0, column: 0, extra: shared }, end: { row: 0, column: 0 } };
    const camera = {
      ...createGraphicDrawing("camera", "wordArt", "Camera", { row: 0, column: 0 }),
      kind: "camera" as const,
      camera: { range, gridLines: false },
    };
    const drawings = [camera];
    const pass = resolveShapeForestForRender({ drawings, metrics: f.metrics, revision: 0 });
    expect(Object.isFrozen(shared)).toBe(false);
    expect(() => pass.assertCurrent(drawings, f.metrics, 0)).not.toThrow();
  });
  test("capturing ordinary optional endpoint accessors never invokes them", () => {
    const f = fixture();
    let reads = 0;
    const extra = Object.defineProperty({}, "probe", {
      enumerable: true,
      get: () => ++reads,
    });
    const range = { start: { row: 0, column: 0, extra }, end: { row: 0, column: 0 } };
    const camera = {
      ...createGraphicDrawing("camera", "wordArt", "Camera", { row: 0, column: 0 }),
      kind: "camera" as const,
      camera: { range, gridLines: false },
    };
    const drawings = [camera];
    const pass = resolveShapeForestForRender({ drawings, metrics: f.metrics, revision: 0 });
    pass.assertCurrent(drawings, f.metrics, 0);
    expect(reads).toBe(0);
    expect(Object.isFrozen(extra)).toBe(false);
  });
  test("carrier and exact paint geometry remain separate, with no durable runtime fields", () => {
    const f = fixture(),
      before = serializeWorkbook(f.workbook);
    const pass = resolveShapeForestForRender({
      drawings: f.sheet.drawings!,
      metrics: f.metrics,
      revision: 7,
    });
    const leaf = pass.getLeaf("connection")!;
    expect(leaf.sourceRoot).toBe(f.connection);
    expect(leaf.carrierRoot!.source).toBe(f.connection);
    expect(leaf.carrierRoot!.view.width).toBe(140);
    expect(leaf.carrierRoot!.view.height).toBe(80);
    expect("shapeConnector" in leaf.carrierRoot!.view).toBe(false);
    expect(leaf.connector?.status).toBe("ready");
    if (leaf.connector?.status !== "ready") throw Error("Expected ready route");
    const { route, paintView } = leaf.connector;
    const resolved = pass.connections!.getConnector("connection")!;
    if (resolved.status === "suspended") throw Error("Expected ready relation");
    expect(route).toBe(resolved.route);
    expect(paintView.width).toBe(route.geometry.width);
    expect(paintView.height).toBe(route.geometry.height);
    expect(paintView.rotation).toBe(route.paintLayout.angleDeg);
    expect(getDrawingShapeGeometry(paintView, false, route.geometry)).toBe(route.geometry);
    expect(getStandardShapeSvgPaths(route.geometry)).toHaveLength(1);
    route.localEndpoints.forEach((tip, index) => {
      const world = shapeFrameLocalToWorld(route.paintLayout.rect, route.paintLayout.angleDeg, tip);
      const expected = index ? route.end : route.begin;
      expect(world.x).toBeCloseTo(expected.x, 9);
      expect(world.y).toBeCloseTo(expected.y, 9);
    });
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(() => resolveShapeDrawing(f.connection, f.metrics)).toThrow(/connector/i);
  });
  test.each(["horizontal", "vertical"] as const)(
    "%s padding changes allocation only, never real ordered tips",
    (axis) => {
      const f = fixture();
      f.connection.shapeGeometry = { preset: "line" };
      f.connection.shapeConnector = {
        kind: "shape-connector-v1",
        begin: { kind: "free", xRatio: 0, yRatio: 0 },
        end: {
          kind: "free",
          xRatio: axis === "horizontal" ? 1 : 0,
          yRatio: axis === "vertical" ? 1 : 0,
        },
      };
      const pass = resolveShapeForestForRender({
        drawings: f.sheet.drawings!,
        metrics: f.metrics,
        revision: 0,
      });
      const paint = pass.getLeaf("connection")!.connector;
      if (paint?.status !== "ready") throw Error("Expected ready route");
      const thinAxis = axis === "horizontal" ? "y" : "x";
      expect(paint.route.localEndpoints[0][thinAxis]).toBe(0.5);
      expect(paint.route.localEndpoints[1][thinAxis]).toBe(0.5);
      expect(paint.route.begin[thinAxis]).toBe(paint.route.end[thinAxis]);
    },
  );
  test("source flips and complete world angle are consumed exactly once by the paint view", () => {
    const f = fixture();
    f.connection.rotation = 37;
    f.connection.shapeFlipX = true;
    f.connection.shapeFlipY = true;
    const pass = resolveShapeForestForRender({
      drawings: f.sheet.drawings!,
      metrics: f.metrics,
      revision: 0,
    });
    const leaf = pass.getLeaf("connection")!,
      paint = leaf.connector;
    if (paint?.status !== "ready") throw Error("Expected ready route");
    const carrierView = leaf.carrierRoot!.view;
    if (carrierView.kind !== "shape") throw Error("Expected connector carrier");
    expect(carrierView.shapeFlipX).toBe(true);
    expect(carrierView.shapeFlipY).toBe(true);
    expect(paint.paintView.shapeFlipX).toBeUndefined();
    expect(paint.paintView.shapeFlipY).toBeUndefined();
    expect(paint.paintView.rotation).toBe(37);
    expect(f.connection.shapeFlipX).toBe(true);
  });
  test("owned connectors resolve external targets from the full forest and retain real edit leases", () => {
    const f = fixture();
    const sibling = {
      ...framedShape(),
      id: "sibling",
      text: "",
      shapeGeometry: { preset: "ellipse" as const },
    };
    f.sheet.drawings!.push(sibling);
    f.sheet.drawings = groupShapeRoots(
      f.sheet.drawings!,
      ["connection", "sibling"],
      { id: "owner", name: "Owner" },
      f.metrics,
    );
    const root = f.sheet.drawings.find((value) => value.id === "owner");
    if (root?.kind !== "shapeGroup") throw Error("Expected owner");
    root.rotation = 37;
    const pass = resolveShapeForestForRender({
      drawings: f.sheet.drawings,
      metrics: f.metrics,
      revision: 0,
    });
    const leaf = pass.getLeaf("connection")!,
      projection = pass.getGroup("owner")!;
    expect(leaf.sourceRoot).toBe(root);
    expect(leaf.sourceNode).toBe(root.members.find((value) => value.id === "connection"));
    expect(leaf.path).toEqual(["owner", "connection"]);
    expect(leaf.carrierLeaf!.lease.node).toEqual(leaf.sourceNode);
    expect(leaf.carrierLeaf!.view!.rotation).toBe(37);
    expect(projection.sourceRoot).toBe(root);
    expect(projection.leaves).toHaveLength(2);
    expect(leaf.connector?.status).toBe("ready");
    expect(() => resolveShapeGroupProjection(root, f.metrics)).toThrow(/connector/i);
    expect(() =>
      updateResolvedShapeGroupLeaf(leaf.carrierLeaf!, leaf.carrierLeaf!.view!, f.metrics),
    ).toThrow(/endpoint edit plan/i);
  });
  test("a changed external target invalidates an otherwise unchanged owner pass", () => {
    const f = fixture();
    const a = resolveShapeForestForRender({
      drawings: f.sheet.drawings!,
      metrics: f.metrics,
      revision: 0,
    });
    a.assertCurrent(f.sheet.drawings!, f.metrics, 0);
    f.target.shapeFrame.anchor = { mode: "fixed", x: 90, y: 40, size: { width: 80, height: 50 } };
    expect(() => a.assertCurrent(f.sheet.drawings!, f.metrics, 0)).toThrow(/outdated/i);
    const b = resolveShapeForestForRender({
      drawings: f.sheet.drawings!,
      metrics: f.metrics,
      revision: 0,
    });
    expect(b.contextIdentity).not.toBe(a.contextIdentity);
    expect(b.connections!.resolutionKey).not.toBe(a.connections!.resolutionKey);
    expect(a.sourceSnapshot[0]).not.toEqual(f.target);
  });
  test("array, revision and immutable metrics identity are independently checked", () => {
    const f = fixture(),
      pass = resolveShapeForestForRender({
        drawings: f.sheet.drawings!,
        metrics: f.metrics,
        revision: 5,
      });
    expect(() => pass.assertCurrent([...f.sheet.drawings!], f.metrics, 5)).toThrow(/outdated/i);
    expect(() => pass.assertCurrent(f.sheet.drawings!, f.metrics, 6)).toThrow(/outdated/i);
    expect(() =>
      pass.assertCurrent(f.sheet.drawings!, createPictureSheetMetrics(f.sheet), 5),
    ).toThrow(/outdated/i);
    expect(Object.isFrozen(pass.sourceSnapshot)).toBe(true);
    expect(Object.isFrozen((pass.sourceSnapshot[0]! as SheetFramedGraphicDrawing).shapeFrame)).toBe(
      true,
    );
    expect(Object.isFrozen(f.target)).toBe(false);
    expect(() =>
      resolveShapeForestForRender({
        drawings: f.sheet.drawings!,
        metrics: f.metrics,
        revision: -1,
      }),
    ).toThrow(/revision/i);
  });
  test("a collapsed target suspends the relation without a stale path or carrier body", () => {
    const f = fixture();
    f.target.shapeFrame.anchor = anchorShapeFrameRect(
      "move-and-size",
      { x: 40, y: 40, width: 80, height: 50 },
      f.metrics,
    );
    f.sheet.hiddenColumns = new Set(Array.from({ length: 11 }, (_, index) => index));
    f.sheet.hiddenRows = new Set(Array.from({ length: 11 }, (_, index) => index));
    const pass = resolveShapeForestForRender({
      drawings: f.sheet.drawings!,
      metrics: createPictureSheetMetrics(f.sheet),
      revision: 0,
    });
    expect(pass.getLeaf("connection")!.connector).toMatchObject({ status: "suspended" });
    expect("paintView" in pass.getLeaf("connection")!.connector!).toBe(false);
  });
  test("coincident real tips remain degenerate with no fabricated tangent or path", () => {
    const f = fixture();
    f.connection.shapeConnector = {
      kind: "shape-connector-v1",
      begin: { kind: "free", xRatio: 0.5, yRatio: 0.5 },
      end: { kind: "free", xRatio: 0.5, yRatio: 0.5 },
    };
    const pass = resolveShapeForestForRender({
      drawings: f.sheet.drawings!,
      metrics: f.metrics,
      revision: 0,
    });
    expect(pass.getLeaf("connection")!.connector?.status).toBe("degenerate");
    expect("paintView" in pass.getLeaf("connection")!.connector!).toBe(false);
  });
  test("text and active 3D have an explicit unavailable result while their original data stays intact", () => {
    const f = fixture();
    f.connection.text = "label";
    const before = serializeWorkbook(f.workbook);
    const a = resolveShapeForestForRender({
      drawings: f.sheet.drawings!,
      metrics: f.metrics,
      revision: 0,
    });
    expect(a.getLeaf("connection")!.connector).toMatchObject({
      status: "unavailable",
      reason: "connector-text",
    });
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    f.connection.text = "";
    f.connection.shapeStyle = {
      rotation3d: {
        kind: "value",
        value: { projection: "parallel", xDeg: 45, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
      },
    };
    const b = resolveShapeForestForRender({
      drawings: f.sheet.drawings!,
      metrics: f.metrics,
      revision: 0,
    });
    expect(b.getLeaf("connection")!.connector).toMatchObject({
      status: "unavailable",
      reason: "connector-3d",
    });
  });
  test("generic root inverse refuses a connector carrier before dropping relationship fields", () => {
    const f = fixture(),
      before = serializeWorkbook(f.workbook);
    const leaf = resolveShapeForestForRender({
      drawings: f.sheet.drawings!,
      metrics: f.metrics,
      revision: 0,
    }).getLeaf("connection")!;
    expect(() =>
      updateResolvedShapeDrawing(leaf.carrierRoot!, leaf.carrierRoot!.view, f.metrics),
    ).toThrow(/connector/i);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("nonprinting targets remain available to the full numeric relation pass", () => {
    const f = fixture();
    f.target.shapeProperties = { printObject: false };
    const pass = resolveShapeForestForRender({
      drawings: f.sheet.drawings!,
      metrics: f.metrics,
      revision: 0,
    });
    expect(pass.connections!.getTarget("target")!.status).toBe("ready");
    expect(pass.getLeaf("connection")!.connector?.status).toBe("ready");
  });
  test("ordinary static documents keep their existing projections and do not acquire the new graph limit", () => {
    const f = fixture();
    const { shapeConnector: _connector, ...staticLine } = f.connection;
    f.sheet.drawings = [f.target, staticLine];
    const pass = resolveShapeForestForRender({
      drawings: f.sheet.drawings,
      metrics: f.metrics,
      revision: 0,
    });
    expect(pass.connections).toBeNull();
    expect(pass.getLeaf("connection")!.carrierRoot).toEqual(
      resolveShapeDrawing(staticLine, f.metrics),
    );
    const many = Array.from({ length: 10_001 }, (_, index) => ({
      ...staticLine,
      id: `static-${index}`,
    }));
    expect(
      resolveShapeForestForRender({ drawings: many, metrics: f.metrics, revision: 0 }).leaves,
    ).toHaveLength(10_001);
  });
});
