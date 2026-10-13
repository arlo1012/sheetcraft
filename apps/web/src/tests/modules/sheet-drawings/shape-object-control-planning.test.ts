// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import {
  createPictureSheetMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { resolveSheetShapeConnections } from "@sheetcraft/core/shape-connector-layout";
import { shapeFrameLocalToWorld, shapeFrameWorldToLocal } from "@sheetcraft/core/shape-frame";
import {
  MAX_SHAPE_GROUP_DEPTH,
  MAX_SHAPE_GROUP_NODES,
  traverseShapeGroup,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type ShapeGroupPath,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import { resolveShapeGroup } from "@sheetcraft/core/shape-group-layout";
import {
  normalizeShapeDrawingForest,
  ungroupShapeRoot,
} from "@sheetcraft/core/shape-group-planning";
import {
  hasShapeObjectFrame,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { createSheet, createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import {
  planShapeObjectControlAction,
  readShapeObjectControlPaths,
} from "../../../modules/sheet-drawings/shape-object-control-planning";
import type { ShapeObjectControlAction } from "../../../modules/sheet-drawings/shape-object-controls-contract";
import { framedShape } from "./framed-shape-fixture";

const metrics = (): PictureSheetMetrics =>
  createPictureSheetMetrics(createSheet("Synthetic", "sheet"));
function shape(id: string, rotation = 37): SheetFramedGraphicDrawing {
  return { ...framedShape(), id, name: id, shapeGeometry: { preset: "rightArrow" }, rotation };
}
function legacy(id: string, rotation = 37): SheetGraphicDrawing {
  const { shapeFrame: _frame, shapeGeometry: _geometry, ...appearance } = shape(id, rotation);
  return {
    ...appearance,
    anchor: { row: 0, column: 0 },
    offsetX: 80,
    offsetY: 24,
    width: 240,
    height: 120,
  };
}
function leaf(id: string, rotation = 37): SheetGroupedGraphicDrawing {
  const { shapeFrame: _frame, ...appearance } = shape(id, rotation);
  return {
    ...appearance,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.125, yRatio: 0.25, widthRatio: 0.5, heightRatio: 0.25 },
    },
  };
}
function group(id: string, members: ShapeGroupChild[], rotation = 0): ShapeGroupDrawing {
  return { kind: "shapeGroup", id, name: id, shapeFrame: shape(id).shapeFrame, rotation, members };
}
function nested(id: string, members: ShapeGroupChild[], rotation = 37): ShapeGroupedGroup {
  return {
    kind: "shapeGroup",
    id,
    name: id,
    rotation,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.25, yRatio: -0.125, widthRatio: 0.5, heightRatio: 0.75 },
    },
    members,
  };
}
function connector(id: string, targetId: string): SheetFramedGraphicDrawing {
  return {
    ...shape(id, 0),
    shape: "line",
    shapeGeometry: { preset: "bentConnector3" },
    shapeConnector: {
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId, preset: "rightArrow", siteIndex: 0 },
      end: { kind: "free", xRatio: 1, yRatio: 1 },
    },
  };
}
function ownedConnector(id: string, targetId: string): SheetGroupedGraphicDrawing {
  const { shapeFrame: _frame, ...appearance } = connector(id, targetId);
  return { ...leaf(id, 0), ...appearance };
}
const ids = (values: readonly { id: string }[]) => values.map((value) => value.id);
function asGroup(value: SheetDrawing | undefined): ShapeGroupDrawing {
  if (!value || value.kind !== "shapeGroup") throw Error("Expected shape group");
  return value;
}
function graphic<T extends SheetDrawing | ShapeGroupChild>(
  value: T | undefined,
): T & { kind: "shape" } {
  if (!value || value.kind !== "shape") throw Error("Expected shape leaf");
  return value as T & { kind: "shape" };
}
function expectPoint(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}
function visualPoint(
  node: Pick<SheetGraphicDrawing, "shapeFlipX" | "shapeFlipY">,
  layout: { rect: { x: number; y: number; width: number; height: number }; angleDeg: number },
  x = 0.2,
  y = 0.3,
) {
  return shapeFrameLocalToWorld(layout.rect, layout.angleDeg, {
    x: layout.rect.width * (node.shapeFlipX ? 1 - x : x),
    y: layout.rect.height * (node.shapeFlipY ? 1 - y : y),
  });
}

describe("pure shape object controls", () => {
  test.each(["flip-horizontal", "flip-vertical"] as const)(
    "%s toggles explicit leaf geometry independently of rotation and frame",
    (action) => {
      const value = shape("a"),
        before = structuredClone(value),
        m = metrics();
      const axis = action === "flip-horizontal" ? "shapeFlipX" : "shapeFlipY";
      const next = graphic(planShapeObjectControlAction([value], [["a"]], action, m)[0]);
      expect(next[axis]).toBe(true);
      expect(next.rotation).toBe(37);
      expect("shapeFrame" in next && next.shapeFrame).toEqual(value.shapeFrame);
      expect(next.shapeGeometry).toEqual(value.shapeGeometry);
      expect(planShapeObjectControlAction([next], [["a"]], action, m)).toEqual(
        normalizeShapeDrawingForest([value]),
      );
      expect(value).toEqual(before);
    },
  );

  test("free geometry flips preserve all commands and point metadata", () => {
    const value = shape("free"),
      m = metrics();
    delete value.shapeGeometry;
    value.shapePath = {
      tool: "freeform",
      viewBox: { width: 100, height: 80 },
      commands: [
        ["M", 5, 10],
        ["L", 70, 60],
        ["Q", 80, 70, 95, 10],
      ],
      pointTypes: { "1": "straight" },
    };
    const next = graphic(
      planShapeObjectControlAction([value], [["free"]], "flip-horizontal", m)[0],
    );
    expect(next.shapeFlipX).toBe(true);
    expect(next.shapePath).toEqual(value.shapePath);
    expect(next).not.toHaveProperty("shapeGeometry");
  });

  test.each([
    ["rotate-left", 307],
    ["rotate-right", 127],
  ] as const)("%s changes only the selected root's own angle", (action, angle) => {
    const value = shape("a"),
      untouched = group("b", [leaf("b-leaf")]),
      m = metrics();
    value.shapeFlipX = true;
    const before = structuredClone([value, untouched]);
    const next = planShapeObjectControlAction([value, untouched], [["a"]], action, m);
    expect(next[0]).toEqual({ ...normalizeShapeDrawingForest([value])[0], rotation: angle });
    expect(next[1]).toEqual(normalizeShapeDrawingForest([untouched])[0]);
    expect([value, untouched]).toEqual(before);
  });

  test("owned leaf and nested group quarter turns retain exact local frames and descendant angles", () => {
    const owner = group("g", [leaf("a"), nested("n", [leaf("b", 13)])], 47),
      m = metrics();
    const original = normalizeShapeDrawingForest([owner]);
    const next = asGroup(
      planShapeObjectControlAction(
        [owner],
        [
          ["g", "a"],
          ["g", "n"],
        ],
        "rotate-left",
        m,
      )[0],
    );
    expect(next.shapeFrame).toEqual(owner.shapeFrame);
    expect(next.rotation).toBe(47);
    expect(next.members[0]).toEqual({ ...asGroup(original[0]).members[0], rotation: 307 });
    expect(next.members[1]).toEqual({ ...asGroup(original[0]).members[1], rotation: 307 });
    const branch = next.members[1]!;
    if (branch.kind !== "shapeGroup") throw Error("Expected nested group");
    expect(branch.members[0]!.rotation).toBe(13);
  });

  test.each(["bring-forward", "send-backward", "bring-front", "send-back"] as const)(
    "%s preserves stable selected source order despite reverse click order",
    (action) => {
      const values = [shape("a"), shape("b"), shape("c"), shape("d"), shape("e")],
        m = metrics();
      const expected = {
        "bring-forward": ["a", "c", "b", "e", "d"],
        "send-backward": ["b", "a", "d", "c", "e"],
        "bring-front": ["a", "c", "e", "b", "d"],
        "send-back": ["b", "d", "a", "c", "e"],
      }[action];
      const before = structuredClone(values);
      expect(ids(planShapeObjectControlAction(values, [["d"], ["b"]], action, m))).toEqual(
        expected,
      );
      expect(values).toEqual(before);
    },
  );

  test("selected contiguous blocks cross one unselected neighbor and keep their order", () => {
    const values = [shape("a"), shape("b"), shape("c"), shape("d"), shape("e")],
      m = metrics();
    expect(ids(planShapeObjectControlAction(values, [["c"], ["b"]], "bring-forward", m))).toEqual([
      "a",
      "d",
      "b",
      "c",
      "e",
    ]);
    expect(ids(planShapeObjectControlAction(values, [["c"], ["b"]], "send-backward", m))).toEqual([
      "b",
      "c",
      "a",
      "d",
      "e",
    ]);
  });

  test("root order crosses ordinary unrelated drawings without changing their appearance", () => {
    const foreign = { ...legacy("icon"), kind: "icon" as const },
      value = shape("a"),
      m = metrics();
    delete foreign.shapeText;
    const next = planShapeObjectControlAction([value, foreign], [["a"]], "bring-forward", m);
    expect(ids(next)).toEqual(["icon", "a"]);
    expect(next[0]).toEqual(normalizeShapeDrawingForest([foreign])[0]);
  });

  test.each(["bring-forward", "send-backward", "bring-front", "send-back"] as const)(
    "%s reorders only exact nested-owner members",
    (action) => {
      const children = [leaf("a"), leaf("b"), leaf("c"), leaf("d"), leaf("e")];
      const owner = group("g", [leaf("outer"), nested("n", children)], 37),
        m = metrics();
      const before = structuredClone(owner),
        canonical = normalizeShapeDrawingForest([owner]);
      const next = asGroup(
        planShapeObjectControlAction(
          [owner],
          [
            ["g", "n", "d"],
            ["g", "n", "b"],
          ],
          action,
          m,
        )[0],
      );
      const expected = ids(
        planShapeObjectControlAction(
          children.map((child) => ({ ...shape(child.id), rotation: child.rotation })),
          [["d"], ["b"]],
          action,
          m,
        ),
      );
      const n = next.members[1]!;
      if (n.kind !== "shapeGroup") throw Error("Expected nested group");
      expect(ids(n.members)).toEqual(expected);
      expect(next.shapeFrame).toEqual(owner.shapeFrame);
      expect(next.rotation).toBe(owner.rotation);
      expect(next.members[0]).toEqual(asGroup(canonical[0]).members[0]);
      expect(n.groupFrame).toEqual(owner.members[1]!.groupFrame);
      expect(owner).toEqual(before);
    },
  );

  test("reordering a nested container preserves all genuine descendants", () => {
    const branch = nested("n", [leaf("inside")]),
      owner = group("g", [branch, leaf("top")]),
      m = metrics();
    const next = asGroup(planShapeObjectControlAction([owner], [["g", "n"]], "bring-front", m)[0]);
    expect(ids(next.members)).toEqual(["top", "n"]);
    expect(next.members[1]).toEqual(asGroup(normalizeShapeDrawingForest([owner])[0]).members[0]);
  });

  test.each(["bring-forward", "bring-front", "send-backward", "send-back"] as const)(
    "%s at the boundary creates no Core history",
    (action) => {
      const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" }),
        sheet = getActiveSheet(workbook);
      sheet.drawings = normalizeShapeDrawingForest([shape("a"), shape("b")]);
      const session = createWorkbookSession({ workbook, idFactory: () => "unused" }),
        m = createPictureSheetMetrics(sheet);
      const id = action === "bring-forward" || action === "bring-front" ? "b" : "a";
      const next = planShapeObjectControlAction(sheet.drawings, [[id]], action, m);
      expect(next).toEqual(sheet.drawings);
      expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, next))).toBe(
        false,
      );
      expect(session.history.undoStack).toHaveLength(0);
      expect(session.history.revision).toBe(0);
    },
  );

  test("sorting all siblings is an exact no-op at every ordering boundary", () => {
    const owner = group("g", [leaf("a"), leaf("b")]),
      m = metrics(),
      canonical = normalizeShapeDrawingForest([owner]);
    for (const action of ["bring-forward", "send-backward", "bring-front", "send-back"] as const)
      expect(
        planShapeObjectControlAction(
          [owner],
          [
            ["g", "b"],
            ["g", "a"],
          ],
          action,
          m,
        ),
      ).toEqual(canonical);
  });

  test.each(["flip-horizontal", "flip-vertical"] as const)(
    "%s recursively reflects rotated orthogonal members without changing the selected group frame",
    (action) => {
      const owner = group("g", [leaf("a"), nested("n", [leaf("b", 13)], 61)], 47),
        m = metrics();
      const before = structuredClone(owner),
        old = resolveShapeGroup(owner, m);
      const next = asGroup(planShapeObjectControlAction([owner], [["g"]], action, m)[0]);
      const resolved = resolveShapeGroup(next, m);
      expect(next.shapeFrame).toEqual(owner.shapeFrame);
      expect(next.rotation).toBe(47);
      const oldContext = resolveSheetShapeConnections([owner], m),
        newContext = resolveSheetShapeConnections([next], m);
      for (const id of ["a", "b"]) {
        const oldNode = graphic(
          traverseShapeGroup(owner).find((visit) => visit.node.id === id)?.node as ShapeGroupChild,
        );
        const newNode = graphic(
          traverseShapeGroup(next).find((visit) => visit.node.id === id)?.node as ShapeGroupChild,
        );
        const oldLayout = oldContext.getNode(id)!.carrierLayout!,
          newLayout = newContext.getNode(id)!.carrierLayout!;
        const originalPoint = visualPoint(oldNode, oldLayout);
        const local = shapeFrameWorldToLocal(old.layout.rect, old.layout.angleDeg, originalPoint);
        const expected = shapeFrameLocalToWorld(old.layout.rect, old.layout.angleDeg, {
          x: action === "flip-horizontal" ? old.layout.rect.width - local.x : local.x,
          y: action === "flip-vertical" ? old.layout.rect.height - local.y : local.y,
        });
        expectPoint(visualPoint(newNode, newLayout), expected);
        expect(newLayout.rect.width).toBeCloseTo(oldLayout.rect.width, 9);
        expect(newLayout.rect.height).toBeCloseTo(oldLayout.rect.height, 9);
        const xEdge = {
          x: newLayout.corners[1].x - newLayout.corners[0].x,
          y: newLayout.corners[1].y - newLayout.corners[0].y,
        };
        const yEdge = {
          x: newLayout.corners[3].x - newLayout.corners[0].x,
          y: newLayout.corners[3].y - newLayout.corners[0].y,
        };
        expect(xEdge.x * yEdge.x + xEdge.y * yEdge.y).toBeCloseTo(0, 8);
      }
      expect(resolved.members[0]!.layout!.angleDeg).toBe(10);
      expect(planShapeObjectControlAction([next], [["g"]], action, m)).toEqual(
        normalizeShapeDrawingForest([owner]),
      );
      expect(owner).toEqual(before);
    },
  );

  test("flipping an owned group preserves its own placement and untouched outer siblings", () => {
    const owner = group("g", [leaf("outer"), nested("n", [leaf("inside")], 37)], 47),
      m = metrics();
    const canonical = asGroup(normalizeShapeDrawingForest([owner])[0]);
    const next = asGroup(
      planShapeObjectControlAction([owner], [["g", "n"]], "flip-horizontal", m)[0],
    );
    expect(next.members[0]).toEqual(canonical.members[0]);
    const n = next.members[1]!,
      original = canonical.members[1]!;
    if (n.kind !== "shapeGroup") throw Error("Expected group");
    expect(n.groupFrame).toEqual(original.groupFrame);
    expect(n.rotation).toBe(37);
    expect(n.members[0]!.rotation).toBe(323);
    expect(graphic(n.members[0]).shapeFlipX).toBe(true);
  });

  test.each(["flip-horizontal", "flip-vertical"] as const)(
    "%s then ungroup retains world visual angle, local dimensions, and leaf flip state",
    (action) => {
      const owner = group("g", [leaf("a"), nested("n", [leaf("b", 13)], 61)], 47),
        m = metrics();
      const flipped = planShapeObjectControlAction([owner], [["g"]], action, m);
      const released = ungroupShapeRoot(flipped, "g", m);
      const fullyReleased = ungroupShapeRoot(released, "n", m);
      const before = resolveSheetShapeConnections(flipped, m),
        after = resolveSheetShapeConnections(fullyReleased, m);
      for (const id of ["a", "b"]) {
        const oldNode = graphic(
          traverseShapeGroup(asGroup(flipped[0])).find((visit) => visit.node.id === id)
            ?.node as ShapeGroupChild,
        );
        const newNode = graphic(fullyReleased.find((node) => node.id === id));
        const oldLayout = before.getNode(id)!.carrierLayout!,
          newLayout = after.getNode(id)!.carrierLayout!;
        expect(newLayout.angleDeg).toBe(oldLayout.angleDeg);
        expect(newLayout.rect.width).toBeCloseTo(oldLayout.rect.width, 9);
        expect(newLayout.rect.height).toBeCloseTo(oldLayout.rect.height, 9);
        expect(newNode.shapeFlipX).toBe(oldNode.shapeFlipX);
        expect(newNode.shapeFlipY).toBe(oldNode.shapeFlipY);
        expectPoint(visualPoint(newNode, newLayout), visualPoint(oldNode, oldLayout));
      }
    },
  );

  test("two reflections of ordinary decimal local ratios restore positions within IEEE rounding", () => {
    const member = leaf("a");
    member.groupFrame.rect = { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.3, heightRatio: 0.4 };
    const owner = group("g", [member]),
      m = metrics();
    for (const action of ["flip-horizontal", "flip-vertical"] as const) {
      const once = planShapeObjectControlAction([owner], [["g"]], action, m);
      const twice = asGroup(planShapeObjectControlAction(once, [["g"]], action, m)[0]);
      const rect = twice.members[0]!.groupFrame.rect;
      expect(rect.xRatio).toBeCloseTo(0.1, 15);
      expect(rect.yRatio).toBeCloseTo(0.2, 15);
      expect(twice.members[0]!.rotation).toBe(37);
      expect(graphic(twice.members[0])).not.toHaveProperty("shapeFlipX");
      expect(graphic(twice.members[0])).not.toHaveProperty("shapeFlipY");
    }
  });

  test("reorder and rename preserve binding target IDs, owned paths, and real connector resolution", () => {
    const target = shape("target"),
      connection = connector("connection", target.id),
      m = metrics();
    const next = planShapeObjectControlAction(
      [target, connection],
      [[target.id]],
      "bring-front",
      m,
    );
    expect(ids(next)).toEqual([connection.id, target.id]);
    const renamed = next.map((node) =>
      node.id === target.id ? { ...node, name: "Target renamed" } : node,
    );
    const resolution = resolveSheetShapeConnections(renamed, m);
    expect(graphic(renamed[0]).shapeConnector).toEqual(connection.shapeConnector);
    expect(resolution.getConnector(connection.id)!.begin).toMatchObject({
      status: "ready",
      targetId: target.id,
    });
    expect(resolution.getTarget(target.id)!.path).toEqual([target.id]);
    const owner = group("g", [
      leaf("owned-target"),
      ownedConnector("owned-connection", "owned-target"),
    ]);
    const ordered = asGroup(
      planShapeObjectControlAction([owner], [["g", "owned-target"]], "bring-front", m)[0],
    );
    expect(ids(ordered.members)).toEqual(["owned-connection", "owned-target"]);
    ordered.members[1]!.name = "Owned target renamed";
    const ownedResolution = resolveSheetShapeConnections([ordered], m);
    expect(ownedResolution.getTarget("owned-target")!.path).toEqual(["g", "owned-target"]);
    expect(ownedResolution.getConnector("owned-connection")!.begin).toMatchObject({
      status: "ready",
      targetId: "owned-target",
    });
  });

  test("group and owned-group rotation keeps connector references while reprojecting real sites", () => {
    const owner = group(
        "g",
        [nested("n", [leaf("target", 0), ownedConnector("connection", "target")], 0)],
        0,
      ),
      m = metrics();
    const original = resolveSheetShapeConnections([owner], m).getConnector("connection")!;
    for (const path of [["g"], ["g", "n"]]) {
      const next = planShapeObjectControlAction([owner], [path], "rotate-right", m);
      const resolution = resolveSheetShapeConnections(next, m).getConnector("connection")!;
      expect(resolution.begin).toMatchObject({ status: "ready", targetId: "target" });
      expect(resolution.begin).not.toEqual(original.begin);
      expect(
        graphic(
          traverseShapeGroup(asGroup(next[0])).find((visit) => visit.node.id === "connection")
            ?.node as ShapeGroupChild,
        ).shapeConnector,
      ).toEqual(ownedConnector("connection", "target").shapeConnector);
    }
  });

  test("independent connector transforms and connector-containing group flips reject atomically", () => {
    const target = shape("target"),
      connection = connector("connection", target.id),
      m = metrics();
    const roots = [target, connection],
      before = structuredClone(roots);
    for (const action of [
      "flip-horizontal",
      "flip-vertical",
      "rotate-left",
      "rotate-right",
    ] as const)
      expect(() =>
        planShapeObjectControlAction(roots, [[target.id], [connection.id]], action, m),
      ).toThrow(/connector/);
    expect(roots).toEqual(before);
    const owner = group("g", [
      leaf("owned-target"),
      ownedConnector("owned-connection", "owned-target"),
    ]);
    expect(() => planShapeObjectControlAction([owner], [["g"]], "flip-horizontal", m)).toThrow(
      /connector/,
    );
  });

  test("flipping and rotating a bound target refreshes sites without rewriting the connector", () => {
    const target = shape("target"),
      connection = connector("connection", target.id),
      m = metrics();
    const old = resolveSheetShapeConnections([target, connection], m).getConnector(
      connection.id,
    )!.begin;
    for (const action of ["flip-horizontal", "rotate-right"] as const) {
      const next = planShapeObjectControlAction([target, connection], [[target.id]], action, m);
      const begin = resolveSheetShapeConnections(next, m).getConnector(connection.id)!.begin;
      expect(begin).toMatchObject({ status: "ready", targetId: target.id });
      expect(begin).not.toEqual(old);
      expect(next[1]).toEqual(normalizeShapeDrawingForest([target, connection])[1]);
    }
  });

  test("legacy nine-shape flip remains explicitly gated without preset promotion; rotation and order stay legacy", () => {
    const value = legacy("old"),
      m = metrics(),
      before = structuredClone(value);
    for (const action of ["flip-horizontal", "flip-vertical"] as const)
      expect(() => planShapeObjectControlAction([value], [["old"]], action, m)).toThrow(/legacy/);
    const next = planShapeObjectControlAction([value], [["old"]], "rotate-right", m)[0]!;
    expect(hasShapeObjectFrame(next)).toBe(false);
    expect(next).not.toHaveProperty("shapeGeometry");
    expect(next).toEqual({ ...before, rotation: 127 });
    expect(value).toEqual(before);
  });

  test("text box flip and groups with legacy leaves reject; text boxes still rotate", () => {
    const textbox = { ...shape("text"), kind: "textBox" as const };
    delete textbox.shapeGeometry;
    const m = metrics();
    expect(() => planShapeObjectControlAction([textbox], [["text"]], "flip-horizontal", m)).toThrow(
      /text boxes/,
    );
    expect(planShapeObjectControlAction([textbox], [["text"]], "rotate-left", m)[0]!.rotation).toBe(
      307,
    );
    const oldLeaf = leaf("legacy");
    delete oldLeaf.shapeGeometry;
    const owner = group("g", [leaf("supported"), oldLeaf]);
    expect(() => planShapeObjectControlAction([owner], [["g"]], "flip-horizontal", m)).toThrow(
      /legacy/,
    );
  });

  test("missing, stale, duplicate, overlapping, and mixed-owner paths are rejected", () => {
    const owner = group("g", [leaf("a"), nested("n", [leaf("b")])]),
      other = group("h", [leaf("c")]),
      m = metrics();
    const roots = [owner, other];
    for (const paths of [
      [],
      [["missing"]],
      [["g", "missing"]],
      [["g", "b"]],
      [["h", "a"]],
      [
        ["g", "a"],
        ["g", "a"],
      ],
      [["g"], ["g", "a"]],
      [
        ["g", "n"],
        ["g", "n", "b"],
      ],
      [
        ["g", "a"],
        ["h", "c"],
      ],
      [["g"], ["h", "c"]],
      [
        ["g", "a"],
        ["g", "n", "b"],
      ],
    ])
      expect(() => planShapeObjectControlAction(roots, paths, "bring-forward", m)).toThrow();
    // Geometry edits have independent local origins and may span distinct owners.
    expect(() =>
      planShapeObjectControlAction(
        roots,
        [
          ["g", "a"],
          ["h", "c"],
        ],
        "rotate-right",
        m,
      ),
    ).not.toThrow();
  });

  test("complete forest checks reject duplicate root/owned IDs, shared ownership and stale relations", () => {
    const m = metrics(),
      a = shape("a"),
      owner = group("g", [leaf("a")]);
    expect(() => planShapeObjectControlAction([a, owner], [["a"]], "rotate-right", m)).toThrow(
      /Duplicate/,
    );
    const shared = leaf("shared");
    expect(() =>
      planShapeObjectControlAction(
        [group("g", [shared]), group("h", [shared])],
        [["g"]],
        "rotate-right",
        m,
      ),
    ).toThrow();
    expect(() =>
      planShapeObjectControlAction(
        [a, connector("connection", "missing")],
        [["a"]],
        "bring-front",
        m,
      ),
    ).toThrow(/missing/);
  });

  test("invalid unselected layouts are rejected before every action", () => {
    const invalid = group("invalid", [leaf("too-large")]);
    invalid.members[0]!.groupFrame.rect.widthRatio = 1000;
    expect(() =>
      planShapeObjectControlAction([shape("a"), invalid], [["a"]], "bring-front", metrics()),
    ).toThrow(/spans/);
  });

  test("unselected connector routes retain Core's derived coordinate and relation budgets", () => {
    const target = shape("distant");
    target.shapeFrame.anchor = {
      mode: "fixed",
      x: 20_000_000,
      y: 100,
      size: { width: 240, height: 120 },
    };
    const roots = [shape("selected"), target, connector("connection", target.id)];
    expect(() => normalizeShapeDrawingForest(roots)).not.toThrow();
    expect(() =>
      planShapeObjectControlAction(roots, [["selected"]], "bring-front", metrics()),
    ).toThrow(/budget/);
  });

  test("unsafe action, dense-array, path and metrics payloads reject without executing getters", () => {
    expect(readShapeObjectControlPaths([])).toEqual([]);
    const values = [shape("a")],
      m = metrics(),
      getter = vi.fn(() => "a");
    const accessed = [] as string[];
    Object.defineProperty(accessed, "0", { get: getter, configurable: true });
    const overridden = ["a"];
    Object.defineProperty(overridden, "map", { get: getter });
    const sparsePath: string[] = [];
    sparsePath.length = 1;
    const badPaths = [
      accessed,
      overridden,
      sparsePath,
      Object.assign(["a"], { extra: true }),
      Array(MAX_SHAPE_GROUP_DEPTH + 2).fill("a"),
      [],
    ];
    for (const path of badPaths)
      expect(() => planShapeObjectControlAction(values, [path], "rotate-right", m)).toThrow();
    const sparseSelection: ShapeGroupPath[] = [],
      accessorSelection: ShapeGroupPath[] = [];
    sparseSelection.length = 1;
    Object.defineProperty(accessorSelection, "0", { get: getter });
    for (const paths of [
      sparseSelection,
      accessorSelection,
      Array(MAX_SHAPE_GROUP_NODES + 1).fill(["a"]),
    ])
      expect(() => planShapeObjectControlAction(values, paths, "rotate-right", m)).toThrow();
    expect(() =>
      planShapeObjectControlAction(
        values,
        [["a"]],
        "rotate-right\0" as ShapeObjectControlAction,
        m,
      ),
    ).toThrow();
    const accessedMetrics = { ...m };
    Object.defineProperty(accessedMetrics, "columns", { get: getter });
    expect(() =>
      planShapeObjectControlAction(values, [["a"]], "rotate-right", accessedMetrics),
    ).toThrow();
    const accessedAxis = { ...m.columns };
    Object.defineProperty(accessedAxis, "visiblePrefix", { get: getter });
    expect(() =>
      planShapeObjectControlAction(values, [["a"]], "rotate-right", {
        ...m,
        columns: accessedAxis,
      }),
    ).toThrow();
    expect(() =>
      planShapeObjectControlAction(values, [["a"]], "rotate-right", {
        ...m,
        columns: { ...m.columns, count: Infinity },
      }),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });

  test("nested unsafe drawing payloads and sparse or accessor forests reject without side effects", () => {
    const m = metrics(),
      getter = vi.fn(() => 0),
      value = shape("a");
    Object.defineProperty(value, "rotation", { get: getter });
    expect(() => planShapeObjectControlAction([value], [["a"]], "rotate-right", m)).toThrow();
    const owner = group("g", [leaf("a")]);
    Object.defineProperty(owner.members[0]!.groupFrame.rect, "xRatio", { get: getter });
    expect(() => planShapeObjectControlAction([owner], [["g"]], "bring-front", m)).toThrow();
    const camera = {
      ...legacy("camera"),
      kind: "camera" as const,
      camera: { range: null, gridLines: true },
    };
    Object.defineProperty(camera.camera, "gridLines", { get: getter });
    expect(() =>
      planShapeObjectControlAction([shape("safe"), camera], [["safe"]], "bring-front", m),
    ).toThrow();
    const sparse: SheetDrawing[] = [],
      accessed: SheetDrawing[] = [];
    sparse.length = 1;
    Object.defineProperty(accessed, "0", { get: getter });
    for (const values of [sparse, accessed])
      expect(() => planShapeObjectControlAction(values, [["a"]], "rotate-right", m)).toThrow();
    const cyclic = shape("cyclic") as SheetFramedGraphicDrawing & { unknown?: unknown };
    cyclic.unknown = cyclic;
    expect(() => planShapeObjectControlAction([cyclic], [["cyclic"]], "rotate-right", m)).toThrow(
      /Cyclic/,
    );
    expect(getter).not.toHaveBeenCalled();
  });
});
