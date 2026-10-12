import { describe, expect, test } from "vitest";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { projectShapePresetConnectionSites } from "../../shape-connection-sites.js";
import {
  resolveSheetShapeConnections,
  SHAPE_CONNECTOR_LAYOUT_LIMITS,
  validateShapeConnectorReferences,
} from "../../shape-connector-layout.js";
import { shapeFrameLocalToWorld } from "../../shape-frame.js";
import { resolveShapeGroup } from "../../shape-group-layout.js";
import { groupShapeRoots, ungroupShapeRoot } from "../../shape-group-planning.js";
import type {
  ShapeGroupDrawing,
  ShapeGroupedGroup,
  SheetGroupedGraphicDrawing,
} from "../../shape-group.js";
import type { SheetDrawing } from "../../sheet-drawings.js";
import { createSheet, setSheetDimensionHidden } from "../../workbook.js";
import { group, metrics, nested } from "../shape-groups/fixtures.js";
import { connectorShape, framedShape } from "./layout-fixtures.js";

function fixture() {
  return [framedShape("rect"), framedShape("ellipse", "ellipse", 210, 110), connectorShape()];
}
function attached(
  connector: ReturnType<typeof connectorShape>,
  endName: "begin" | "end",
  targetId: string,
  preset: "rect" | "ellipse" | "parallelogram",
  siteIndex: number,
) {
  connector.shapeConnector![endName] = { kind: "site", targetId, preset, siteIndex };
}
function stretch(shape: ReturnType<typeof framedShape>) {
  shape.shapeFrame.anchor = {
    mode: "move-and-size",
    start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
    end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
  };
}
function owned(shape: ReturnType<typeof framedShape>): SheetGroupedGraphicDrawing {
  const { shapeFrame: _frame, ...appearance } = shape;
  return {
    ...appearance,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.25 },
    },
  };
}

describe("whole-sheet shape connector resolution", () => {
  test("attached endpoints use target sites rather than stale carrier corners and follow motion/resize", () => {
    const forest = fixture(),
      before = structuredClone(forest);
    const initial = resolveSheetShapeConnections(forest, metrics());
    const relation = initial.getConnector("connector")!;
    expect(relation.status).toBe("ready");
    expect(relation.begin).toMatchObject({
      status: "ready",
      kind: "site",
      targetId: "rect",
      position: { x: 110, y: 50 },
      direction: { x: 1, y: 0 },
    });
    expect(relation.end).toMatchObject({
      status: "ready",
      kind: "site",
      targetId: "ellipse",
      position: { x: 210, y: 140 },
      direction: { x: -1, y: 0 },
    });
    expect(forest).toEqual(before);
    forest[0]!.shapeFrame.anchor = {
      mode: "fixed",
      x: 50,
      y: 40,
      size: { width: 140, height: 100 },
    };
    const moved = resolveSheetShapeConnections(forest, metrics()).getConnector("connector")!;
    expect(moved.begin).toMatchObject({
      position: { x: 190, y: 90 },
      identity: { preset: "rect", index: 3 },
    });
    expect(moved.end).toEqual(relation.end);
    expect(moved.resolutionKey).not.toBe(relation.resolutionKey);
    expect(forest[2]!.shapeConnector).toEqual(before[2]!.shapeConnector);
    expect(forest[2]!.shapeFrame).toEqual(before[2]!.shapeFrame);
  });
  test("same-preset adjustment recomputes a qualified site without changing binding identity", () => {
    const target = framedShape("adjusted", "parallelogram");
    target.shapeGeometry = { preset: "parallelogram", adjustments: { adj: 25000 } };
    const line = connectorShape();
    attached(line, "begin", "adjusted", "parallelogram", 5);
    line.shapeConnector!.end = { kind: "free", xRatio: 1, yRatio: 1 };
    const before = resolveSheetShapeConnections([target, line], metrics()).getConnector(
      "connector",
    )!;
    target.shapeGeometry.adjustments = { adj: 50000 };
    const after = resolveSheetShapeConnections([target, line], metrics()).getConnector(
      "connector",
    )!;
    expect(after.begin).toMatchObject({
      targetId: "adjusted",
      identity: { preset: "parallelogram", index: 5 },
    });
    expect(after.begin).not.toEqual(before.begin);
    expect(line.shapeConnector!.begin).toEqual({
      kind: "site",
      targetId: "adjusted",
      preset: "parallelogram",
      siteIndex: 5,
    });
  });
  test("free ratios are before geometry flips and receive the complete nested world angle once", () => {
    const line = connectorShape();
    line.shapeConnector = {
      kind: "shape-connector-v1",
      begin: { kind: "free", xRatio: -0.25, yRatio: 0.5 },
      end: { kind: "free", xRatio: 1, yRatio: 0.5 },
    };
    line.shapeFlipX = true;
    line.shapeFlipY = true;
    line.rotation = 13;
    const leaf = owned(line);
    const inner = { ...nested("inner"), rotation: 23, members: [leaf] };
    const root = { ...group("outer"), rotation: 37, members: [inner] };
    const actual = resolveSheetShapeConnections([root], metrics()).getConnector("connector")!;
    const resolved = resolveShapeGroup(root, metrics());
    const subgroup = resolved.members[0]!;
    if (!("members" in subgroup)) throw new Error("Expected group");
    const carrier = subgroup.members[0]!.layout!;
    expect(carrier.angleDeg).toBe(73);
    const expected = shapeFrameLocalToWorld(carrier.rect, 73, {
      x: carrier.rect.width * 1.25,
      y: carrier.rect.height * 0.5,
    });
    expect(actual.begin).toMatchObject({ status: "ready", kind: "free" });
    if (actual.begin.status !== "ready") throw new Error("Expected endpoint");
    expect(actual.begin.position.x).toBeCloseTo(expected.x, 10);
    expect(actual.begin.position.y).toBeCloseTo(expected.y, 10);
    if (actual.status === "suspended" || actual.route.status !== "ready")
      throw new Error("Expected route");
    expect(actual.route.paintLayout.angleDeg).toBe(73);
    expect(actual.route.shapeFlipX).toBe(false);
    expect(actual.route.shapeFlipY).toBe(false);
    expect(actual.path).toEqual(["outer", "inner", "connector"]);
  });
  test("cross-root nested targets reflect sites and preserve port directions", () => {
    const target = owned(framedShape("rect"));
    target.rotation = 17;
    target.shapeFlipX = true;
    const root: ShapeGroupDrawing = {
      ...group("owner"),
      rotation: 31,
      members: [{ ...nested("inner"), rotation: 23, members: [target] }],
    };
    const line = connectorShape();
    line.shapeConnector!.end = { kind: "free", xRatio: 1, yRatio: 1 };
    const context = resolveSheetShapeConnections([root, line], metrics());
    const projected = resolveShapeGroup(root, metrics());
    const inner = projected.members[0]!;
    if (!("members" in inner)) throw new Error("Expected nested target");
    const leaf = inner.members[0]!;
    const expected = projectShapePresetConnectionSites(
      target.shapeGeometry!,
      leaf.layout!.rect,
      leaf.layout!.angleDeg,
      { shapeFlipX: true },
    ).sites[3]!;
    expect(context.getConnector("connector")!.begin).toMatchObject({
      position: expected.position,
      direction: expected.direction,
      identity: expected.identity,
    });
    expect(context.getTarget("rect")!.path).toEqual(["owner", "inner", "rect"]);
    expect(context.getConnectorsForTarget("rect")).toEqual([context.getConnector("connector")]);
  });
  test("group and ungroup retain ID attachment across changed transient ownership paths", () => {
    const forest = fixture(),
      first = resolveSheetShapeConnections(forest, metrics());
    const grouped = groupShapeRoots(
      forest,
      ["rect", "ellipse", "connector"],
      { id: "owner", name: "Owner" },
      metrics(),
    );
    const together = resolveSheetShapeConnections(grouped, metrics());
    expect(together.getConnector("connector")!.begin).toEqual(
      first.getConnector("connector")!.begin,
    );
    expect(together.getConnector("connector")!.end).toEqual(first.getConnector("connector")!.end);
    expect(together.getTarget("rect")!.path).toEqual(["owner", "rect"]);
    const released = ungroupShapeRoot(grouped, "owner", metrics());
    const final = resolveSheetShapeConnections(released, metrics());
    expect(final.getConnector("connector")!.begin).toEqual(first.getConnector("connector")!.begin);
    expect(final.getTarget("rect")!.path).toEqual(["rect"]);
    const target = released.find((root) => root.id === "rect")!;
    if (!("shapeFrame" in target)) throw new Error("Expected canonical target");
    target.shapeFrame.anchor = { mode: "fixed", x: 30, y: 50, size: { width: 100, height: 60 } };
    expect(
      resolveSheetShapeConnections(released, metrics()).getConnector("connector")!.begin,
    ).toMatchObject({ position: { x: 130, y: 80 } });
  });
  test("collapsed targets suspend only their bound endpoint and recover with the same attachment", () => {
    const sheet = createSheet("Synthetic", "sheet"),
      target = framedShape("rect"),
      line = connectorShape();
    stretch(target);
    line.shapeConnector!.end = { kind: "free", xRatio: 1, yRatio: 1 };
    const forest = [target, line],
      before = structuredClone(forest);
    const first = resolveSheetShapeConnections(forest, createPictureSheetMetrics(sheet));
    setSheetDimensionHidden(sheet, "column", 0, true);
    const suspended = resolveSheetShapeConnections(forest, createPictureSheetMetrics(sheet));
    expect(suspended.getTarget("rect")).toMatchObject({ status: "collapsed", sites: [] });
    expect(suspended.getConnector("connector")).toMatchObject({
      status: "suspended",
      reason: "endpoint-suspended",
      begin: { status: "suspended", reason: "target-collapsed", targetId: "rect" },
      end: { status: "ready", kind: "free" },
    });
    expect(suspended.getConnector("connector")).not.toHaveProperty("route");
    expect(forest).toEqual(before);
    setSheetDimensionHidden(sheet, "column", 0, false);
    expect(resolveSheetShapeConnections(forest, createPictureSheetMetrics(sheet))).toMatchObject({
      nodes: first.nodes,
      targets: first.targets,
      connectors: first.connectors,
      resolutionKey: first.resolutionKey,
    });
  });
  test("collapsed connector carrier suspends even when both targets remain available", () => {
    const sheet = createSheet("Synthetic", "sheet"),
      forest = fixture();
    stretch(forest[2]!);
    setSheetDimensionHidden(sheet, "column", 0, true);
    const result = resolveSheetShapeConnections(forest, createPictureSheetMetrics(sheet));
    expect(result.getConnector("connector")).toMatchObject({
      status: "suspended",
      reason: "carrier-collapsed",
      begin: { status: "ready" },
      end: { status: "ready" },
    });
    expect(result.getConnector("connector")).not.toHaveProperty("route");
    const leaf = owned(connectorShape("nested-line"));
    const owner = { ...group("owner"), members: [leaf] };
    owner.shapeFrame = forest[2]!.shapeFrame;
    const nestedResult = resolveSheetShapeConnections(
      [forest[0]!, forest[1]!, owner],
      createPictureSheetMetrics(sheet),
    );
    expect(nestedResult.getConnector("nested-line")!.carrierLayout).toBeNull();
    expect(nestedResult.getConnector("nested-line")!.status).toBe("suspended");
  });
  test("coincident endpoints are declared degenerate and same-target different-site references are allowed", () => {
    const target = framedShape("rect"),
      line = connectorShape();
    attached(line, "end", "rect", "rect", 3);
    const degenerate = resolveSheetShapeConnections([target, line], metrics()).getConnector(
      "connector",
    )!;
    expect(degenerate.status).toBe("degenerate");
    if (degenerate.status === "suspended") throw new Error("Unexpected suspension");
    expect(degenerate.route.status).toBe("degenerate");
    attached(line, "end", "rect", "rect", 1);
    expect(
      resolveSheetShapeConnections([target, line], metrics()).getConnector("connector")!.status,
    ).toBe("ready");
  });
  test("old standard root targets are supported without promotion and static lines remain untouched", () => {
    const target = framedShape("rect"),
      { shapeFrame: _frame, ...appearance } = target;
    const oldTarget = {
      ...appearance,
      anchor: { row: 0, column: 0 },
      offsetX: 10,
      offsetY: 20,
      width: 100,
      height: 60,
    };
    const line = connectorShape();
    line.shapeConnector!.end = { kind: "free", xRatio: 1, yRatio: 1 };
    const staticLine = framedShape("static", "line");
    const forest = [oldTarget, line, staticLine],
      before = structuredClone(forest);
    expect(
      resolveSheetShapeConnections(forest, metrics()).getConnector("connector")!.begin,
    ).toMatchObject({ position: { x: 110, y: 50 } });
    expect(resolveSheetShapeConnections(forest, metrics()).getConnector("static")).toBeUndefined();
    expect(forest).toEqual(before);
    expect(oldTarget).not.toHaveProperty("shapeFrame");
  });
  test("context is numeric, deeply immutable and repeat resolution is a no-op on all source data", () => {
    const forest = fixture(),
      before = structuredClone(forest);
    const first = resolveSheetShapeConnections(forest, metrics()),
      second = resolveSheetShapeConnections(forest, metrics());
    expect(second.resolutionKey).toBe(first.resolutionKey);
    expect(forest).toEqual(before);
    for (const value of [
      first,
      first.nodes,
      first.targets,
      first.connectors,
      first.getNode("rect"),
      first.getNode("rect")!.path,
      first.getNode("rect")!.carrierLayout,
      first.getNode("rect")!.carrierLayout!.rect,
      first.getConnectorsForTarget("rect"),
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(first.getNodeAtPath(["rect"])).toBe(first.getNode("rect"));
    expect(first.getNodeAtPath(["wrong", "rect"])).toBeUndefined();
    expect(first.getConnectorsForTarget("unknown")).toEqual([]);
    expect(first).not.toHaveProperty("index");
    expect(first.getNode("rect")).not.toHaveProperty("node");
    forest[0]!.shapeFrame.anchor = {
      mode: "fixed",
      x: 999,
      y: 999,
      size: { width: 100, height: 60 },
    };
    expect(first.getConnector("connector")!.begin).toMatchObject({ position: { x: 110, y: 50 } });
  });
});

describe("metrics-free connector forest reference admission", () => {
  test("missing/preset/site failures identify connector, end and target before any metrics reads", () => {
    for (const scenario of ["missing", "preset", "site"] as const) {
      const forest = fixture(),
        relation = forest[2]!.shapeConnector!;
      if (scenario === "missing") attached(forest[2]!, "begin", "gone", "rect", 3);
      if (scenario === "preset") attached(forest[2]!, "begin", "rect", "ellipse", 3);
      if (scenario === "site") attached(forest[2]!, "begin", "rect", "rect", 4);
      const targetId = relation.begin.kind === "site" ? relation.begin.targetId : "";
      expect(() => validateShapeConnectorReferences(forest)).toThrow(
        new RegExp(`connector begin target ${targetId}`, "i"),
      );
      const badMetrics = {
        columns: {
          visiblePrefix() {
            throw new Error("METRICS READ");
          },
        },
        rows: {
          visiblePrefix() {
            throw new Error("METRICS READ");
          },
        },
      } as never;
      expect(() => resolveSheetShapeConnections(forest, badMetrics)).toThrow(
        new RegExp(`connector begin target ${targetId}`, "i"),
      );
    }
  });
  test("groups, text boxes, free paths, legacy implicit shapes and all lines are ineligible", () => {
    for (const target of [
      group("rect"),
      { ...framedShape("rect"), kind: "textBox" as const },
      { ...framedShape("rect"), shapeGeometry: undefined },
      framedShape("rect", "line"),
      connectorShape("rect", "rect", "ellipse"),
    ]) {
      const forest: SheetDrawing[] = [target, framedShape("ellipse", "ellipse"), connectorShape()];
      expect(() => validateShapeConnectorReferences(forest)).toThrow(/not an eligible/);
    }
    const free = {
      ...framedShape("rect"),
      shapeGeometry: undefined,
      shapePath: {
        kind: "shape-free-path-v1",
        commands: [
          ["M", 0, 0],
          ["L", 1, 1],
        ],
      },
    } as unknown as SheetDrawing;
    expect(() =>
      validateShapeConnectorReferences([free, framedShape("ellipse", "ellipse"), connectorShape()]),
    ).toThrow(/not an eligible/);
  });
  test("complete IDs and budgets include unrelated drawings and invisible descendants", () => {
    const forest = fixture();
    expect(() => validateShapeConnectorReferences([...forest, { ...forest[0]! }])).toThrow(
      /Duplicate/,
    );
    const owner = { ...group("owner"), members: [owned(framedShape("rect"))] };
    expect(() => validateShapeConnectorReferences([...forest, owner])).toThrow(/Duplicate/);
    const many = Array.from({ length: 10001 }, (_, index) => framedShape(`shape-${index}`));
    expect(() => validateShapeConnectorReferences(many)).not.toThrow();
    expect(() => validateShapeConnectorReferences([...many, connectorShape()])).toThrow(/budget/);
  });
});

describe("bounded connector identities and resolution output", () => {
  function freeConnector(id: string) {
    return {
      ...framedShape(id, "line"),
      shapeConnector: {
        kind: "shape-connector-v1" as const,
        begin: { kind: "free" as const, xRatio: 0, yRatio: 0.5 },
        end: { kind: "free" as const, xRatio: 1, yRatio: 0.5 },
      },
    };
  }
  test("length limits apply to new-feature node and target IDs without changing old admission", () => {
    const longId = "x".repeat(SHAPE_CONNECTOR_LAYOUT_LIMITS.identityLength + 1);
    const ordinary = framedShape(longId);
    expect(() => validateShapeConnectorReferences([ordinary])).not.toThrow();
    expect(() => validateShapeConnectorReferences([ordinary, freeConnector("connector")])).toThrow(
      /node IDs.*512/,
    );
    const line = connectorShape();
    attached(line, "begin", longId, "rect", 3);
    expect(() =>
      validateShapeConnectorReferences([
        framedShape("rect"),
        framedShape("ellipse", "ellipse"),
        line,
      ]),
    ).toThrow(/target IDs.*512/);
  });
  test("deep repeated ownership paths have an aggregate identity budget before keys/projection", () => {
    const local = {
      kind: "shape-group-local-v1" as const,
      rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
    };
    let child: ShapeGroupedGroup = {
      kind: "shapeGroup",
      id: "group-31".padEnd(512, "g"),
      name: "",
      rotation: 0,
      groupFrame: local,
      members: Array.from({ length: 80 }, (_, index) =>
        owned(framedShape(`leaf-${index}`.padEnd(512, "l"))),
      ),
    };
    for (let index = 30; index >= 1; index--)
      child = {
        kind: "shapeGroup",
        id: `group-${index}`.padEnd(512, "g"),
        name: "",
        rotation: 0,
        groupFrame: local,
        members: [child],
      };
    const root = { ...group("root".padEnd(512, "r")), members: [child] };
    const forest = [root, freeConnector("connector")];
    expect(() => validateShapeConnectorReferences(forest)).toThrow(/identity-character budget/);
    expect(() => resolveSheetShapeConnections(forest, metrics())).toThrow(
      /identity-character budget/,
    );
  });
  test("global keys omit expanded per-connector keys while sharing one character allowance", () => {
    const result = resolveSheetShapeConnections(fixture(), metrics());
    const numeric = JSON.parse(result.resolutionKey) as { connectors: Record<string, unknown>[] };
    expect(numeric.connectors).toHaveLength(1);
    expect(numeric.connectors[0]).not.toHaveProperty("resolutionKey");
    expect(
      result.resolutionKey.length +
        result.connectors.reduce((total, connector) => total + connector.resolutionKey.length, 0),
    ).toBeLessThanOrEqual(SHAPE_CONNECTOR_LAYOUT_LIMITS.resolutionCharacters);
  });
  test("large valid numeric graphs fail the shared key budget without returning partial output", () => {
    const forest = Array.from({ length: 3000 }, (_, index) => freeConnector(`connector-${index}`));
    expect(() => resolveSheetShapeConnections(forest, metrics())).toThrow(
      /shared resolution-character budget/,
    );
    expect(forest[0]).not.toHaveProperty("resolutionKey");
    expect(forest[0]).not.toHaveProperty("route");
  });
  test("numeric failures retain connector/end/target diagnostic context", () => {
    const line = freeConnector("connector");
    line.shapeConnector.begin.xRatio = 1_000_000;
    expect(() => resolveSheetShapeConnections([line], metrics())).toThrow(
      /Connector connector begin endpoint failed/,
    );
    const forest = fixture();
    forest[0]!.shapeFrame.anchor = {
      mode: "fixed",
      x: 9_999_999,
      y: 20,
      size: { width: 100, height: 60 },
    };
    expect(() => resolveSheetShapeConnections(forest, metrics())).toThrow(
      /Connector connector begin target rect sites failed/,
    );
  });
});
