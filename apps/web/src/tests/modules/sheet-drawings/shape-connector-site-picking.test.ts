// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { projectShapePresetConnectionSites } from "@sheetcraft/core/shape-connection-sites";
import {
  resolveSheetShapeConnections,
  SHAPE_CONNECTOR_LAYOUT_LIMITS,
} from "@sheetcraft/core/shape-connector-layout";
import { SHAPE_CONNECTOR_ROUTE_LIMITS } from "@sheetcraft/core/shape-connector-route";
import { shapeFrameLocalToWorld, type ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import { resolveShapeGroup } from "@sheetcraft/core/shape-group-layout";
import type { ShapeGroupDrawing, SheetGroupedGraphicDrawing } from "@sheetcraft/core/shape-group";
import type { ShapePresetName } from "@sheetcraft/core/shape-presets";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import type { SheetFramedGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSheet, setSheetDimensionHidden } from "@sheetcraft/core/workbook";
import {
  getShapeConnectorSiteCandidates,
  pickNearestShapeConnectorSite,
} from "../../../modules/sheet-drawings/shape-connector-site-picking";
import { getVisibleShapeNodeIds } from "../../../modules/sheet-drawings/shape-visibility";
import { framedShape } from "./framed-shape-fixture";

const rect = { x: 100, y: 80, width: 360, height: 240 };
function shape(
  id: string,
  preset: ShapePresetName = "rect",
  frame: ShapeFrameRect = rect,
): SheetFramedGraphicDrawing {
  return {
    ...framedShape(),
    id,
    name: id,
    shapeGeometry: { preset },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: {
        mode: "fixed",
        x: frame.x,
        y: frame.y,
        size: { width: frame.width, height: frame.height },
      },
    },
  };
}
function owned(value: SheetFramedGraphicDrawing): SheetGroupedGraphicDrawing {
  const { shapeFrame: _frame, ...appearance } = value;
  return {
    ...appearance,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
    },
  };
}
function group(id: string, members: SheetGroupedGraphicDrawing[]): ShapeGroupDrawing {
  return {
    kind: "shapeGroup",
    id,
    name: id,
    shapeFrame: shape("frame").shapeFrame,
    rotation: 0,
    members,
  };
}
function metrics() {
  return createPictureSheetMetrics(createSheet("Synthetic sites", "sites"));
}

describe("pure connector target-site picking", () => {
  test("exposes actual ellipse and adjustment-dependent outside-frame preset sites", () => {
    const ellipse = shape("ellipse", "ellipse");
    const callout = shape("callout", "wedgeRectCallout");
    callout.shapeGeometry = {
      preset: "wedgeRectCallout",
      adjustments: { adj1: -100000, adj2: 150000 },
    };
    const context = resolveSheetShapeConnections([ellipse, callout], metrics());
    const candidates = getShapeConnectorSiteCandidates(context, { x: 280, y: 200 }, 1000);
    const ellipseCandidates = candidates.filter(({ targetId }) => targetId === "ellipse");
    expect(ellipseCandidates).toHaveLength(8);
    expect(ellipseCandidates.map(({ siteIndex }) => siteIndex).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    const tip = context.getTarget("callout")!.sites.at(-1)!;
    expect(tip.position).toEqual({ x: -80, y: 560 });
    expect(pickNearestShapeConnectorSite(context, tip.position, 0)).toMatchObject({
      targetId: "callout",
      preset: "wedgeRectCallout",
      siteIndex: tip.identity.index,
      position: tip.position,
      direction: tip.direction,
      rootId: "callout",
      path: ["callout"],
      distance: 0,
    });
    expect(pickNearestShapeConnectorSite(context, { x: rect.x, y: rect.y }, 0)).toBeUndefined();
  });

  test("root ports retain exact 37-degree rotation and geometry flips once", () => {
    for (const rotation of [0, 37])
      for (const shapeFlipX of [false, true])
        for (const shapeFlipY of [false, true]) {
          const target = {
            ...shape("target:stable", "ellipse"),
            rotation,
            ...(shapeFlipX ? { shapeFlipX: true as const } : {}),
            ...(shapeFlipY ? { shapeFlipY: true as const } : {}),
          };
          const context = resolveSheetShapeConnections([target], metrics());
          const expected = projectShapePresetConnectionSites(
            target.shapeGeometry!,
            rect,
            rotation,
            {
              shapeFlipX,
              shapeFlipY,
            },
          ).sites;
          for (const site of expected) {
            const picked = pickNearestShapeConnectorSite(context, site.position, 0)!;
            expect(picked).toMatchObject({
              targetId: target.id,
              preset: "ellipse",
              siteIndex: site.identity.index,
              identity: site.identity,
              position: site.position,
              direction: site.direction,
              rootId: target.id,
              path: [target.id],
              distance: 0,
            });
            expect(picked.identity).toBe(
              context.getTarget(target.id)!.sites[picked.siteIndex]!.identity,
            );
          }
        }
  });

  test("owned target sites use the composed group frame after nonuniform scale", () => {
    const leaf = owned(shape("leaf", "ellipse"));
    leaf.rotation = 13;
    leaf.shapeFlipX = true;
    leaf.groupFrame.rect = { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.25 };
    const root = group("owner", [leaf]);
    root.rotation = 37;
    root.shapeFrame.anchor = {
      mode: "fixed",
      x: 300,
      y: 200,
      size: { width: 420, height: 280 },
    };
    const context = resolveSheetShapeConnections([root], metrics());
    const layout = resolveShapeGroup(root, metrics()).members[0]!.layout!;
    expect(layout.angleDeg).toBe(50);
    expect(layout.rect.width).toBe(210);
    expect(layout.rect.height).toBe(70);
    const sites = projectShapePresetConnectionSites(
      leaf.shapeGeometry!,
      layout.rect,
      layout.angleDeg,
      {
        shapeFlipX: true,
      },
    ).sites;
    for (const site of sites)
      expect(pickNearestShapeConnectorSite(context, site.position, 0)).toMatchObject({
        targetId: "leaf",
        rootId: "owner",
        path: ["owner", "leaf"],
        siteIndex: site.identity.index,
        position: site.position,
        direction: site.direction,
      });
    const staleCorner = shapeFrameLocalToWorld(rect, 0, { x: 0, y: 0 });
    expect(pickNearestShapeConnectorSite(context, staleCorner, 0)).toBeUndefined();
  });

  test("distance wins before later-painted owners/targets and ordered site ties", () => {
    const earlier = shape("closer", "rect", { x: 100, y: 100, width: 100, height: 60 });
    const later = shape("later", "rect", { x: 110, y: 100, width: 100, height: 60 });
    const separate = resolveSheetShapeConnections([earlier, later], metrics());
    expect(
      getShapeConnectorSiteCandidates(separate, { x: 200, y: 130 }, 12).map(
        ({ targetId }) => targetId,
      ),
    ).toEqual(["closer", "later"]);
    const firstOwner = group("first-owner", [owned(shape("first-a")), owned(shape("first-b"))]);
    const secondOwner = group("second-owner", [owned(shape("second-a")), owned(shape("second-b"))]);
    const overlapping = resolveSheetShapeConnections([firstOwner, secondOwner], metrics());
    const candidates = getShapeConnectorSiteCandidates(overlapping, { x: 460, y: 200 }, 0);
    expect(candidates.map(({ targetId }) => targetId)).toEqual([
      "second-b",
      "second-a",
      "first-b",
      "first-a",
    ]);
    expect(pickNearestShapeConnectorSite(overlapping, { x: 460, y: 200 }, 0)).toEqual(
      candidates[0],
    );
    const square = resolveSheetShapeConnections(
      [shape("square", "rect", { x: 100, y: 100, width: 100, height: 100 })],
      metrics(),
    );
    expect(
      getShapeConnectorSiteCandidates(square, { x: 150, y: 150 }, 50).map(
        ({ siteIndex }) => siteIndex,
      ),
    ).toEqual([0, 1, 2, 3]);
    expect(pickNearestShapeConnectorSite(square, { x: 150, y: 150 }, 50)?.siteIndex).toBe(0);
  });

  test("collapsed or ineligible targets supply no invented ports", () => {
    const sheet = createSheet("Collapsed", "collapsed");
    const target = shape("collapsed");
    target.shapeFrame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    setSheetDimensionHidden(sheet, "column", 0, true);
    const line = shape("line", "line");
    const empty = shape("empty", "funnel");
    const context = resolveSheetShapeConnections(
      [target, line, empty],
      createPictureSheetMetrics(sheet),
    );
    expect(context.getTarget("collapsed")!.status).toBe("collapsed");
    expect(context.getTarget("line")).toBeUndefined();
    expect(context.getTarget("empty")!.sites).toHaveLength(0);
    expect(getShapeConnectorSiteCandidates(context, { x: 100, y: 80 }, 1000)).toEqual([]);
    expect(pickNearestShapeConnectorSite(context, { x: 100, y: 80 }, 1000)).toBeUndefined();
  });

  test("radius is explicit, inclusive, world-based, and zero means the exact site", () => {
    const context = resolveSheetShapeConnections([shape("target")], metrics());
    const site = context.targets[0]!.sites[0]!;
    expect(pickNearestShapeConnectorSite(context, site.position, 0)?.distance).toBe(0);
    expect(
      pickNearestShapeConnectorSite(context, { x: site.position.x + 3, y: site.position.y + 4 }, 5)
        ?.distance,
    ).toBe(5);
    expect(
      pickNearestShapeConnectorSite(
        context,
        { x: site.position.x + 3, y: site.position.y + 4 },
        4.999,
      ),
    ).toBeUndefined();
    expect(
      pickNearestShapeConnectorSite(context, { x: site.position.x + 1e-10, y: site.position.y }, 0),
    ).toBeUndefined();
  });

  test("rejects malformed/nonfinite/over-budget queries before invoking point getters", () => {
    expect(SHAPE_CONNECTOR_LAYOUT_LIMITS.nodes).toBe(10_000);
    expect(SHAPE_CONNECTOR_LAYOUT_LIMITS.depth).toBe(32);
    const context = resolveSheetShapeConnections([shape("target")], metrics());
    for (const tolerance of [NaN, Infinity, -1, SHAPE_CONNECTOR_ROUTE_LIMITS.coordinate + 1, "5"])
      expect(() =>
        getShapeConnectorSiteCandidates(context, { x: 0, y: 0 }, tolerance as number),
      ).toThrow();
    for (const point of [
      { x: NaN, y: 0 },
      { x: 0, y: Infinity },
      { x: SHAPE_CONNECTOR_ROUTE_LIMITS.coordinate + 1, y: 0 },
      { x: 0, y: -SHAPE_CONNECTOR_ROUTE_LIMITS.coordinate - 1 },
      { x: "0", y: 0 },
      { x: 0 },
    ])
      expect(() => pickNearestShapeConnectorSite(context, point as never, 1)).toThrow();
    let getterReads = 0;
    const getterPoint = {
      get x() {
        getterReads++;
        return 0;
      },
      y: 0,
    };
    expect(() => pickNearestShapeConnectorSite(context, getterPoint, 1)).toThrow(/coordinate data/);
    expect(getterReads).toBe(0);
    expect(() =>
      getShapeConnectorSiteCandidates(
        {
          ...context,
          nodes: Array.from(
            { length: SHAPE_CONNECTOR_LAYOUT_LIMITS.nodes + 1 },
            () => context.nodes[0]!,
          ),
        },
        { x: 0, y: 0 },
        1,
      ),
    ).toThrow(/forest-node budget/);
    const oversizedSites = {
      ...context.targets[0]!,
      sites: Array.from({ length: 17 }, () => context.targets[0]!.sites[0]!),
    };
    expect(() =>
      getShapeConnectorSiteCandidates({ ...context, targets: [oversizedSites] }, { x: 0, y: 0 }, 1),
    ).toThrow(/target-site work budget/);
    const oversizedPath = {
      ...context.targets[0]!,
      path: Array.from({ length: SHAPE_CONNECTOR_LAYOUT_LIMITS.depth + 2 }, () => "target"),
    };
    expect(oversizedPath.path).toHaveLength(34);
    expect(() =>
      pickNearestShapeConnectorSite({ ...context, targets: [oversizedPath] }, { x: 0, y: 0 }, 1),
    ).toThrow(/target-site work budget/);
  });

  test("keeps a legal full-forest site set larger than one connector route's point budget", () => {
    const forest = Array.from({ length: 513 }, (_, index) => shape(`target-${index}`, "ellipse"));
    const context = resolveSheetShapeConnections(forest, metrics());
    const candidates = getShapeConnectorSiteCandidates(context, { x: 280, y: 200 }, 1000);
    expect(candidates).toHaveLength(513 * 8);
    expect(candidates.length).toBeGreaterThan(SHAPE_CONNECTOR_ROUTE_LIMITS.points);
    expect(
      pickNearestShapeConnectorSite(context, context.targets[0]!.sites[0]!.position, 0)?.targetId,
    ).toBe("target-512");
  });

  test("leaves the full forest/context unchanged, keeps locked targets, and confers no edit permission", () => {
    const target = shape("locked");
    target.shapeProperties = {};
    expect(getShapeObjectProperties(target.shapeProperties).locked).toBe(true);
    const connector = shape("connector", "bentConnector3");
    connector.shapeConnector = {
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId: "locked", preset: "rect", siteIndex: 3 },
      end: { kind: "free", xRatio: 1, yRatio: 1 },
    };
    const forest = [target, connector];
    const before = structuredClone(forest);
    const context = resolveSheetShapeConnections(forest, metrics());
    const contextBefore = JSON.stringify({
      nodes: context.nodes,
      targets: context.targets,
      connectors: context.connectors,
      key: context.resolutionKey,
    });
    const picked = pickNearestShapeConnectorSite(context, { x: 460, y: 200 }, 0)!;
    expect(picked.targetId).toBe("locked");
    expect(picked).not.toHaveProperty("canEdit");
    expect(context.getTarget("connector")).toBeUndefined();
    expect(Object.isFrozen(picked)).toBe(true);
    expect(Object.isFrozen(getShapeConnectorSiteCandidates(context, picked.position, 1))).toBe(
      true,
    );
    expect(forest).toEqual(before);
    expect(
      JSON.stringify({
        nodes: context.nodes,
        targets: context.targets,
        connectors: context.connectors,
        key: context.resolutionKey,
      }),
    ).toBe(contextBefore);
  });
});

test("interactive site candidates suppress hidden roots/inherited descendants without changing canonical binding sites", () => {
  const hiddenRoot = { ...shape("hidden"), hidden: true as const };
  const hiddenOwner = { ...group("g", [owned(shape("child"))]), hidden: true as const };
  const visible = shape("visible");
  const forest = [hiddenRoot, hiddenOwner, visible],
    context = resolveSheetShapeConnections(forest, metrics());
  expect(context.getTarget("hidden")?.status).toBe("ready");
  expect(context.getTarget("child")?.sites.length).toBeGreaterThan(0);
  const ids = getVisibleShapeNodeIds(forest);
  expect([...ids]).toEqual(["visible"]);
  expect(
    getShapeConnectorSiteCandidates(context, { x: 200, y: 100 }, 1000, ids).every(
      (site) => site.targetId === "visible",
    ),
  ).toBe(true);
  const target = context.getTarget("hidden")!;
  const onlyHidden = new Set<string>();
  expect(
    pickNearestShapeConnectorSite(context, target.sites[0]!.position, 1000, onlyHidden),
  ).toBeUndefined();
  expect(context.getTarget("hidden")).toBe(target);
});
