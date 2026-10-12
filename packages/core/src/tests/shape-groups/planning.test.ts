import { describe, expect, test } from "vitest";
import { anchorShapeFrameRect } from "../../shape-frame.js";
import {
  groupShapeRoots,
  resolveShapeRootLayout,
  ungroupShapeRoot,
} from "../../shape-group-planning.js";
import { isShapeGroupDrawing, traverseShapeGroup } from "../../shape-group.js";
import { resolveShapeGroup } from "../../shape-group-layout.js";
import {
  isFramedShapeDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "../../sheet-drawings.js";
import { group, leaf, metrics, textModel, texture } from "./fixtures.js";

function legacy(
  id: string,
  x: number,
  y: number,
  kind: "shape" | "textBox" | "icon" = "shape",
): SheetGraphicDrawing {
  const { groupFrame: _frame, ...appearance } = leaf(id);
  return {
    ...appearance,
    kind,
    anchor: { row: 0, column: 0 },
    offsetX: x,
    offsetY: y,
    width: 80,
    height: 40,
  };
}
function grouped() {
  const a = legacy("a", 10, 20);
  a.rotation = 37;
  a.shapeText = { ...textModel(), style: { fill: { kind: "value", value: texture("glyph") } } };
  const b = legacy("b", 200, 60, "textBox");
  b.textDirection = "vertical";
  const result = groupShapeRoots(
    [a, legacy("middle", 100, 80, "icon"), b],
    ["b", "a"],
    { id: "g", name: "Group" },
    metrics(),
  );
  const root = result[1]!;
  if (!isShapeGroupDrawing(root)) throw Error("Expected group");
  return { a, b, result, root };
}

describe("explicit shape root grouping and one-level release", () => {
  test("noncontiguous grouping retains stack order, literal appearance and the unrotated union", () => {
    const f = grouped();
    expect(f.result.map((root) => root.id)).toEqual(["middle", "g"]);
    expect(f.root.members.map((member) => member.id)).toEqual(["a", "b"]);
    expect(f.root.shapeFrame.anchor.mode).toBe("move-and-size");
    expect(f.root).not.toHaveProperty("shapeProperties");
    const resolved = resolveShapeGroup(f.root, metrics());
    expect(resolved.layout.rect).toEqual({ x: 10, y: 20, width: 270, height: 80 });
    expect(resolved.members[0]!.layout!.angleDeg).toBe(37);
    expect(resolved.members[0]!.node).not.toHaveProperty("shapeGeometry");
    expect(resolved.members[0]!.node).toMatchObject({
      text: f.a.text,
      fontSize: 19,
      bold: true,
      italic: true,
      shapeText: f.a.shapeText,
    });
    expect(resolved.members[1]!.node).toMatchObject({ textDirection: "vertical", kind: "textBox" });
    expect(f.a).toHaveProperty("anchor");
    expect(f.b).toHaveProperty("width", 80);
    expect(f.result[0]).not.toHaveProperty("shapeFrame");
  });
  test("scaled rotated owner ungroup preserves child world corners, text size and inherited lock/print", () => {
    const f = grouped();
    const original = resolveShapeGroup(f.root, metrics());
    f.root.shapeFrame.anchor = anchorShapeFrameRect(
      "move-and-size",
      { ...original.layout.rect, width: original.layout.rect.width * 1.3 },
      metrics(),
    );
    f.root.rotation = 37;
    f.root.shapeProperties = { locked: false, printObject: false };
    f.root.members[0]!.shapeProperties = {
      lockAspectRatio: true,
      altTitle: "Child",
      altDescription: "Child details",
    };
    const scaled = resolveShapeGroup(f.root, metrics());
    const released = ungroupShapeRoot(f.result, "g", metrics());
    expect(released.map((root) => root.id)).toEqual(["middle", "a", "b"]);
    for (let index = 0; index < 2; index++) {
      const root = released[index + 1]!;
      if (!isFramedShapeDrawing(root)) throw Error("Expected framed leaf");
      const world = resolveShapeRootLayout(root, metrics()),
        before = scaled.members[index]!.layout!;
      world.corners.forEach((point, corner) => {
        expect(point.x).toBeCloseTo(before.corners[corner]!.x, 9);
        expect(point.y).toBeCloseTo(before.corners[corner]!.y, 9);
      });
      expect(root.fontSize).toBe(19);
      expect(root.shapeProperties).toMatchObject({ locked: false, printObject: false });
    }
    const second = released[1]!;
    if (!isFramedShapeDrawing(second)) throw Error("Expected released framed leaf");
    expect(second.shapeProperties).toMatchObject({
      lockAspectRatio: true,
      altTitle: "Child",
      altDescription: "Child details",
    });
  });
  test("existing owned groups remain nested and release exactly one level without changing local descendants", () => {
    const inner = group("inner");
    const before = structuredClone(inner);
    const grouped = groupShapeRoots(
      [legacy("a", 10, 20), inner],
      ["inner", "a"],
      { id: "outer", name: "Outer" },
      metrics(),
    );
    const outer = grouped[0]!;
    if (!isShapeGroupDrawing(outer)) throw Error("Expected outer group");
    expect(traverseShapeGroup(outer).map(({ node }) => node.id)).toEqual([
      "outer",
      "a",
      "inner",
      "inner-a",
      "inner-b",
    ]);
    const resolved = resolveShapeGroup(outer, metrics());
    const released = ungroupShapeRoot(grouped, "outer", metrics());
    expect(released.map((root) => root.id)).toEqual(["a", "inner"]);
    const root = released[1]!;
    if (!isShapeGroupDrawing(root)) throw Error("Nested owner must remain a group");
    expect(root.members).toEqual(before.members);
    expect(resolveShapeRootLayout(root, metrics()).rect).toEqual(resolved.members[1]!.layout!.rect);
    expect(inner).toEqual(before);
  });
  test("stale, ineligible, duplicate and forest-wide identity collisions fail atomically", () => {
    const roots: SheetDrawing[] = [
      legacy("a", 0, 0),
      legacy("ordinary", 10, 20, "icon"),
      group("inner"),
    ];
    const before = structuredClone(roots);
    for (const selected of [
      ["a"],
      ["a", "a"],
      ["a", "missing"],
      ["a", "ordinary"],
      ["a", "inner-a"],
    ])
      expect(() =>
        groupShapeRoots(roots, selected, { id: "new", name: "New" }, metrics()),
      ).toThrow();
    for (const id of ["ordinary", "inner-a", "a"])
      expect(() =>
        groupShapeRoots(roots, ["a", "inner"], { id, name: "Collision" }, metrics()),
      ).toThrow(/collid/);
    expect(() => ungroupShapeRoot(roots, "a", metrics())).toThrow(/root shape group/);
    expect(roots).toEqual(before);
  });
});
