import { describe, expect, test } from "vitest";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { resolvePictureLayout } from "../../picture-frame.js";
import { shapeFrameLocalToWorld } from "../../shape-frame.js";
import {
  placeShapeGroupChild,
  resolveShapeGroup,
  resolveShapeGroupChildLayout,
  unionShapeGroupLayoutRects,
} from "../../shape-group-layout.js";
import { cloneShapeGroup } from "../../shape-group.js";
import { createSheet, setSheetDimensionHidden } from "../../workbook.js";
import { group, leaf, metrics, nested } from "./fixtures.js";

describe("source-free orthogonal shape group projection", () => {
  test("nonuniform root scale preserves the child's 37-degree rotation and right angles", () => {
    const a = { ...leaf("a"), rotation: 37 };
    const value = { ...group(), members: [a], rotation: 23 };
    value.shapeFrame.anchor = { mode: "fixed", x: 100, y: 100, size: { width: 300, height: 100 } };
    const resolved = resolveShapeGroup(value, metrics());
    const child = resolved.members[0]!.layout!;
    expect(child.rect.width).toBe(150);
    expect(child.rect.height).toBe(50);
    expect(child.angleDeg).toBe(60);
    const center = shapeFrameLocalToWorld(resolved.layout.rect, 23, { x: 75, y: 25 });
    expect(child.rect.x + child.rect.width / 2).toBeCloseTo(center.x, 10);
    expect(child.rect.y + child.rect.height / 2).toBeCloseTo(center.y, 10);
    const [p, q, r] = child.corners;
    const dot = (q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y);
    expect(dot).toBeCloseTo(0, 8);
    expect(a.rotation).toBe(37);
    expect(child).not.toHaveProperty("sourceRect");
  });
  test("nested owner angles compose while signed out-of-frame positions retain local dimensions", () => {
    const a = leaf("a", "textBox");
    a.rotation = 13;
    a.groupFrame.rect = { xRatio: -1, yRatio: 2, widthRatio: 0.5, heightRatio: 0.25 };
    const inner = { ...nested("inner"), rotation: 323, members: [a] };
    const value = { ...group(), rotation: 37, members: [inner] };
    const resolved = resolveShapeGroup(value, metrics());
    const subgroup = resolved.members[0]!;
    if (!("members" in subgroup)) throw Error("Expected nested group");
    const child = subgroup.members[0]!;
    expect(subgroup.layout!.angleDeg).toBe(0);
    expect(child.layout!.angleDeg).toBe(13);
    expect(child.layout!.rect.width).toBe(50);
    expect(child.layout!.rect.height).toBe(12.5);
    expect(child.layout!.rect.x).toBeCloseTo(subgroup.layout!.rect.x - 100, 10);
    expect(child.layout!.rect.y).toBeCloseTo(subgroup.layout!.rect.y + 100, 10);
    expect(child.path).toEqual(["group", "inner", "a"]);
    expect(child.node).not.toBe(a);
    child.node.name = "Detached";
    child.layout!.rect.x = 999;
    expect(a.name).toBe("Shape a");
    expect(a).not.toHaveProperty("layout");
  });
  test("source-free inverse placement round-trips arbitrary owner/child angles and unrotated union", () => {
    const parent = resolvePictureLayout({ x: 70, y: -20, width: 320, height: 90 }, 37);
    const world = resolvePictureLayout({ x: -30, y: 85, width: 72, height: 44 }, 323);
    const placed = placeShapeGroupChild(parent, world);
    if (placed.status !== "placed") throw Error("Expected placement");
    expect(placed).not.toHaveProperty("source");
    expect(placed.groupFrame).not.toHaveProperty("angleDeg");
    expect(placed.rotation).toBe(286);
    const resolved = resolveShapeGroupChildLayout(parent, placed)!;
    for (const field of ["x", "y", "width", "height"] as const)
      expect(resolved.rect[field]).toBeCloseTo(world.rect[field], 10);
    expect(resolved.angleDeg).toBe(world.angleDeg);
    expect(unionShapeGroupLayoutRects([parent.rect, world.rect])).toEqual({
      x: -30,
      y: -20,
      width: 420,
      height: 149,
    });
    expect(() => unionShapeGroupLayoutRects([])).toThrow();
    expect(() => unionShapeGroupLayoutRects([{ x: 0, y: 0, width: 0, height: 1 }])).toThrow();
  });
  test("collapsed worksheet owners retain every node and reject malformed invisible descendants", () => {
    const sheet = createSheet("Synthetic", "sheet");
    const value = { ...group(), members: [nested()] };
    value.shapeFrame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    const initial = resolveShapeGroup(value, createPictureSheetMetrics(sheet));
    const before = cloneShapeGroup(value);
    setSheetDimensionHidden(sheet, "column", 0, true);
    const collapsed = resolveShapeGroup(value, createPictureSheetMetrics(sheet));
    expect(collapsed.layout.collapsed).toBe(true);
    expect(collapsed.visible).toBe(false);
    const inner = collapsed.members[0]!;
    if (!("members" in inner)) throw Error("Expected nested group");
    expect(inner.layout).toBeNull();
    expect(inner.visible).toBe(false);
    expect(inner.members[0]!.layout).toBeNull();
    expect(inner.members[0]!.visible).toBe(false);
    expect(collapsed.node).toEqual(before);
    expect(value).toEqual(before);
    expect(placeShapeGroupChild(collapsed.layout, initial.members[0]!.layout!)).toEqual({
      status: "collapsed-parent",
    });
    expect(resolveShapeGroupChildLayout(collapsed.layout, value.members[0]!)).toBeNull();
    value.members[0]!.members[0]!.rotation = Infinity;
    expect(() => resolveShapeGroup(value, createPictureSheetMetrics(sheet))).toThrow(/finite/);
    value.members[0]!.members[0]!.rotation = 0;
    setSheetDimensionHidden(sheet, "column", 0, false);
    expect(resolveShapeGroup(value, createPictureSheetMetrics(sheet))).toEqual(initial);
  });
  test("nonprinting children still validate derived geometry and never silently overflow/underflow", () => {
    for (const scenario of ["width-overflow", "position-overflow", "unrepresentable-edge"]) {
      const a = leaf("a");
      a.shapeProperties = { printObject: false };
      if (scenario === "width-overflow") a.groupFrame.rect.widthRatio = Number.MAX_VALUE;
      if (scenario === "position-overflow") a.groupFrame.rect.xRatio = Number.MAX_VALUE;
      if (scenario === "unrepresentable-edge") a.groupFrame.rect.xRatio = 1e20;
      const value = { ...group(), members: [a] },
        before = structuredClone(value);
      expect(() => resolveShapeGroup(value, metrics())).toThrow();
      expect(value).toEqual(before);
    }
    const a = leaf();
    a.groupFrame.rect.widthRatio = Number.MIN_VALUE;
    expect(() =>
      resolveShapeGroupChildLayout(
        resolvePictureLayout({ x: 0, y: 0, width: 0.1, height: 100 }, 0),
        a,
      ),
    ).toThrow(/underflow/);
  });
});

test("owned shape spans use the same upper budget as standalone frames at every depth", () => {
  const value = group(),
    a = leaf("a");
  a.groupFrame.rect.widthRatio = 100;
  value.members = [a];
  expect(() => resolveShapeGroup(value, metrics())).toThrow(/16384/);
  a.groupFrame.rect.widthRatio = 0.001;
  expect(resolveShapeGroup(value, metrics()).members[0]!.layout!.rect.width).toBeCloseTo(0.2, 10);
  const inner = nested();
  inner.groupFrame.rect.widthRatio = 100;
  value.members = [inner];
  expect(() => resolveShapeGroup(value, metrics())).toThrow(/16384/);
  inner.groupFrame.rect.widthRatio = 0.5;
  inner.members[0]!.groupFrame.rect.heightRatio = 1000;
  expect(() => resolveShapeGroup(value, metrics())).toThrow(/16384/);
});
