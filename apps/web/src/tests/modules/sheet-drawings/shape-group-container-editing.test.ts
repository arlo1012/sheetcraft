// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { isShapeGroupDrawing, type ShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import {
  resolveShapeGroup,
  type ResolvedShapeGroupNode,
} from "@sheetcraft/core/shape-group-layout";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import { framedShape } from "./framed-shape-fixture";
import {
  ungroupOwnedShapeContainer,
  updateOwnedShapeContainer,
} from "../../../modules/sheet-drawings/shape-group-container-editing";

function fixture() {
  const sheet = createSheet("Nested", "sheet");
  const metrics = createPictureSheetMetrics(sheet);
  function leaf(id: string, x: number, y: number, rotation: number) {
    const result = framedShape();
    result.id = id;
    result.name = id;
    result.text = `Literal ${id}`;
    result.rotation = rotation;
    result.shapeFrame.anchor = { mode: "fixed", x, y, size: { width: 80, height: 50 } };
    return result;
  }
  function group(values: Parameters<typeof groupShapeRoots>[0], id: string): ShapeGroupDrawing {
    const result = groupShapeRoots(
      values,
      values.map((value) => value.id),
      { id, name: id },
      metrics,
    )[0]!;
    if (!isShapeGroupDrawing(result)) throw new Error("Expected group.");
    return result;
  }
  const sub = group([leaf("d", 170, 210, 13), leaf("e", 280, 230, -17)], "sub");
  sub.rotation = 29;
  const inner = group([leaf("a", 140, 80, 37), sub, leaf("b", 350, 120, -11)], "inner");
  inner.rotation = 43;
  inner.shapeProperties = { altTitle: "Inner" };
  const root = group([leaf("left", 0, 0, 0), inner, leaf("right", 520, 360, 0)], "root");
  root.rotation = 23;
  root.shapeProperties = { locked: false, printObject: false, altTitle: "Root" };
  return { root, metrics, sheet };
}
function worlds(root: ShapeGroupDrawing, metrics: ReturnType<typeof createPictureSheetMetrics>) {
  const result = new Map<string, ResolvedShapeGroupNode>();
  function visit(node: ResolvedShapeGroupNode) {
    result.set(node.node.id, node);
    if ("members" in node) node.members.forEach(visit);
  }
  visit(resolveShapeGroup(root, metrics));
  return result;
}
function expectWorld(actual: ResolvedShapeGroupNode, expected: ResolvedShapeGroupNode) {
  expect(actual.layout).not.toBeNull();
  for (const key of ["x", "y", "width", "height"] as const)
    expect(actual.layout!.rect[key]).toBeCloseTo(expected.layout!.rect[key], 8);
  expect(actual.layout!.angleDeg).toBeCloseTo(expected.layout!.angleDeg, 8);
}

describe("real nested shape container edits", () => {
  test("one-level Ungroup preserves every rotated world placement, stack slot, metadata and source", () => {
    const f = fixture(),
      before = JSON.stringify(f.root),
      original = worlds(f.root, f.metrics);
    const next = ungroupOwnedShapeContainer(f.root, ["root", "inner"], f.metrics);
    expect(next.members.map((node) => node.id)).toEqual(["left", "a", "sub", "b", "right"]);
    expect(next.shapeFrame).toEqual(f.root.shapeFrame);
    expect(next.rotation).toBe(f.root.rotation);
    const projected = worlds(next, f.metrics);
    for (const id of ["left", "a", "sub", "d", "e", "b", "right"])
      expectWorld(projected.get(id)!, original.get(id)!);
    for (const id of ["a", "sub", "b"])
      expect(getShapeObjectProperties(projected.get(id)!.node.shapeProperties)).toMatchObject({
        locked: false,
        printObject: false,
      });
    expect(projected.get("sub")!.path).toEqual(["root", "sub"]);
    expect(projected.get("d")!.path).toEqual(["root", "sub", "d"]);
    expect(projected.get("a")!.node).toMatchObject({ text: "Literal a" });
    expect(JSON.stringify(f.root)).toBe(before);
  });
  test("nested world edit retains root/siblings and changes only the actual owned subtree", () => {
    const f = fixture(),
      before = JSON.stringify(f.root),
      original = worlds(f.root, f.metrics),
      inner = original.get("inner")!.layout!;
    const next = updateOwnedShapeContainer(
      f.root,
      ["root", "inner"],
      {
        rect: { ...inner.rect, x: inner.rect.x + 31, y: inner.rect.y - 19 },
        angleDeg: inner.angleDeg + 15,
      },
      f.metrics,
    );
    const projected = worlds(next, f.metrics);
    expect(next.shapeFrame).toEqual(f.root.shapeFrame);
    expectWorld(projected.get("left")!, original.get("left")!);
    expectWorld(projected.get("right")!, original.get("right")!);
    expect(projected.get("inner")!.layout!.rect.x).toBeCloseTo(inner.rect.x + 31, 8);
    expect(projected.get("inner")!.layout!.rect.y).toBeCloseTo(inner.rect.y - 19, 8);
    expect(projected.get("inner")!.layout!.angleDeg).toBeCloseTo(inner.angleDeg + 15, 8);
    expect(JSON.stringify(f.root)).toBe(before);
  });
  test("missing/leaf/root targets and collapsed owners reject without source changes", () => {
    const f = fixture(),
      before = JSON.stringify(f.root),
      layout = resolveShapeGroup(f.root, f.metrics).layout;
    for (const path of [["root"], ["root", "missing"], ["root", "inner", "a"]]) {
      expect(() => ungroupOwnedShapeContainer(f.root, path, f.metrics)).toThrow();
      expect(() => updateOwnedShapeContainer(f.root, path, layout, f.metrics)).toThrow();
    }
    expect(JSON.stringify(f.root)).toBe(before);
    f.sheet.hiddenColumns = new Set(Array.from({ length: 20 }, (_, index) => index));
    const hiddenMetrics = createPictureSheetMetrics(f.sheet);
    expect(resolveShapeGroup(f.root, hiddenMetrics).layout.collapsed).toBe(true);
    expect(() => ungroupOwnedShapeContainer(f.root, ["root", "inner"], hiddenMetrics)).toThrow(
      /Expand/,
    );
    expect(JSON.stringify(f.root)).toBe(before);
  });
});
