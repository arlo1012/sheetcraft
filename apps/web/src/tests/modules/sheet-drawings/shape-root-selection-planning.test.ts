// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  createPictureSheetMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { shapeFrameLocalToWorld, type ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import {
  isShapeGroupDrawing,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import { resolveShapeGroup } from "@sheetcraft/core/shape-group-layout";
import {
  isShapeGroupEligibleRoot,
  normalizeShapeDrawingForest,
  resolveShapeRootLayout,
} from "@sheetcraft/core/shape-group-planning";
import {
  hasShapeObjectFrame,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { createSheet } from "@sheetcraft/core/workbook";
import {
  alignSelectedShapeRoots,
  equalizeSelectedShapeRoots,
  moveSelectedShapeRoots,
  resizeSelectedShapeRoots,
} from "../../../modules/sheet-drawings/shape-root-selection-planning";

function metrics(): PictureSheetMetrics {
  return createPictureSheetMetrics(createSheet("Synthetic", "sheet"));
}
function legacy(id: string, rect: ShapeFrameRect, rotation = 0): SheetGraphicDrawing {
  return {
    id,
    kind: "shape",
    name: id,
    anchor: { row: 0, column: 0 },
    offsetX: rect.x,
    offsetY: rect.y,
    width: rect.width,
    height: rect.height,
    text: "Literal text 中文",
    shape: "roundedRectangle",
    fill: "#abcdef",
    stroke: "#123456",
    strokeWidth: 2.5,
    color: "#654321",
    fontSize: 19,
    bold: true,
    italic: true,
    rotation,
  };
}
function framed(id: string, rect: ShapeFrameRect, rotation = 0): SheetFramedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _width,
    height: _height,
    ...appearance
  } = legacy(id, { x: 0, y: 0, width: 1, height: 1 }, rotation);
  return {
    ...appearance,
    kind: "shape",
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: {
        mode: "fixed",
        x: rect.x,
        y: rect.y,
        size: { width: rect.width, height: rect.height },
      },
    },
  };
}
function leaf(
  id: string,
  widthRatio = 0.5,
  heightRatio = 0.5,
  rotation = 0,
): SheetGroupedGraphicDrawing {
  const { shapeFrame: _frame, ...appearance } = framed(
    id,
    { x: 0, y: 0, width: 1, height: 1 },
    rotation,
  );
  return {
    ...appearance,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.1, yRatio: 0.2, widthRatio, heightRatio },
    },
  };
}
function group(id: string, rect: ShapeFrameRect, rotation = 0): ShapeGroupDrawing {
  return {
    id,
    name: id,
    kind: "shapeGroup",
    rotation,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: {
        mode: "fixed",
        x: rect.x,
        y: rect.y,
        size: { width: rect.width, height: rect.height },
      },
    },
    members: [leaf(`${id}-leaf`, 0.5, 0.5, 37)],
  };
}
function nested(id: string): ShapeGroupedGroup {
  return {
    id,
    name: id,
    kind: "shapeGroup",
    rotation: 337,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: -0.2, yRatio: 0.5, widthRatio: 0.5, heightRatio: 0.5 },
    },
    members: [leaf(`${id}-leaf`, 0.5, 0.5, 61)],
  };
}
function subpixel(id: string): SheetFramedGraphicDrawing {
  const value = framed(id, { x: 0, y: 0, width: 1, height: 1 });
  value.shapeFrame.anchor = {
    mode: "move-and-size",
    start: { column: { index: 0, offset: 10.75 }, row: { index: 0, offset: 7.25 } },
    end: { column: { index: 0, offset: 11 }, row: { index: 0, offset: 7.75 } },
  };
  return value;
}
function rootRect(
  values: readonly SheetDrawing[],
  id: string,
  m: PictureSheetMetrics,
): ShapeFrameRect {
  const root = values.find((value) => value.id === id);
  if (!root || !isShapeGroupEligibleRoot(root)) throw Error("Expected shape root.");
  return resolveShapeRootLayout(root, m).rect;
}
function expectPoint(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
}

describe("pure ordered shape root selection transforms", () => {
  test("movement shares a legacy-constrained delta across real roots and preserves unselected trees", () => {
    const m = metrics();
    const old = legacy("old", { x: 30, y: 50, width: 240, height: 160 });
    const owner = group("owner", { x: -90, y: 100, width: 160, height: 96 }, 37);
    const untouched = group("untouched", { x: 500, y: 200, width: 200, height: 100 });
    untouched.members.push(nested("untouched-nested"));
    const foreign = {
      ...legacy("icon", { x: 1, y: 1, width: 40, height: 40 }),
      kind: "icon" as const,
    };
    const roots = [old, untouched, foreign, owner];
    const before = structuredClone(roots),
      canonical = normalizeShapeDrawingForest(roots);
    const next = moveSelectedShapeRoots(roots, [owner.id, old.id], { x: -100, y: -100 }, m);
    expect(rootRect(next, old.id, m)).toEqual({ x: 0, y: 0, width: 240, height: 160 });
    expect(rootRect(next, owner.id, m)).toEqual({ x: -120, y: 50, width: 160, height: 96 });
    expect(next.map((root) => root.id)).toEqual(roots.map((root) => root.id));
    expect(JSON.stringify(next[1])).toBe(JSON.stringify(canonical[1]));
    expect(JSON.stringify(next[2])).toBe(JSON.stringify(canonical[2]));
    expect(isShapeGroupDrawing(next[3]) && next[3].members).toEqual(owner.members);
    expect(next[0]).not.toHaveProperty("shapeFrame");
    expect(roots).toEqual(before);
  });

  test("canonical roots freely move to negative sheet coordinates without a legacy limiter", () => {
    const m = metrics();
    const a = framed("a", { x: 10, y: 20, width: 100, height: 50 });
    const b = group("b", { x: 30, y: 40, width: 200, height: 100 });
    const next = moveSelectedShapeRoots([a, b], [a.id, b.id], { x: -100, y: -100 }, m);
    expect(rootRect(next, "a", m)).toEqual({ x: -90, y: -80, width: 100, height: 50 });
    expect(rootRect(next, "b", m)).toEqual({ x: -70, y: -60, width: 200, height: 100 });
  });

  test("legacy terminal origins use the final real cell and retain a free offset", () => {
    const m = metrics();
    const a = legacy("a", { x: 10, y: 10, width: 100, height: 50 });
    const target = m.columns.visiblePrefix(m.columns.count) + 50;
    const next = moveSelectedShapeRoots([a], [a.id], { x: target - 10, y: 0 }, m);
    const root = next[0]!;
    expect(hasShapeObjectFrame(root)).toBe(false);
    if (hasShapeObjectFrame(root)) throw Error("Expected legacy.");
    expect(root.anchor.column).toBe(m.columns.count - 1);
    expect(root.offsetX).toBe(target - m.columns.visiblePrefix(m.columns.count - 1));
    expect(root.offsetY).toBe(10);
    expect(rootRect(next, a.id, m).x).toBe(target);
  });

  test("clamped movement and zero/perpendicular/sub-ulp resize preserve free anchors and subpixel metadata", () => {
    const m = metrics();
    const old = legacy("old", { x: 0, y: 180, width: 80, height: 40 });
    const tiny = subpixel("tiny");
    tiny.shapeProperties = { altTitle: "Tiny", lockAspectRatio: true };
    const roots = [old, tiny],
      canonical = normalizeShapeDrawingForest(roots);
    expect(moveSelectedShapeRoots(roots, [old.id, tiny.id], { x: -20, y: 0 }, m)).toEqual(
      canonical,
    );
    expect(
      resizeSelectedShapeRoots(roots, [old.id, tiny.id], tiny.id, "e", { x: 0, y: 10 }, m),
    ).toEqual(canonical);
    expect(
      resizeSelectedShapeRoots(roots, [old.id, tiny.id], tiny.id, "se", { x: 0, y: 0 }, m),
    ).toEqual(canonical);
    expect(
      resizeSelectedShapeRoots(
        roots,
        [old.id, tiny.id],
        tiny.id,
        "e",
        { x: Number.MIN_VALUE, y: 0 },
        m,
      ),
    ).toEqual(canonical);
    const moved = moveSelectedShapeRoots([tiny], [tiny.id], { x: 3, y: 4 }, m);
    expect(rootRect(moved, tiny.id, m)).toEqual({ x: 13.75, y: 11.25, width: 0.25, height: 0.5 });
  });

  test.each(["n", "s", "e", "w", "nw", "ne", "sw", "se"] as const)(
    "%s resize uses common local factors at every root's own rotated fixed point",
    (direction) => {
      const m = metrics();
      const a = framed("a", { x: 300, y: 250, width: 200, height: 100 }, 37);
      const b = framed("b", { x: 700, y: 300, width: 80, height: 160 }, -61);
      b.kind = "textBox";
      const owner = group("owner", { x: 500, y: 650, width: 160, height: 96 }, 90);
      owner.members.push(nested("nested"));
      const roots = [a, owner, b],
        before = structuredClone(roots);
      const dx = (direction.includes("w") ? -1 : 1) * 40;
      const dy = (direction.includes("n") ? -1 : 1) * 10;
      const rad = (a.rotation * Math.PI) / 180;
      const delta = {
        x: Math.cos(rad) * dx - Math.sin(rad) * dy,
        y: Math.sin(rad) * dx + Math.cos(rad) * dy,
      };
      const next = resizeSelectedShapeRoots(
        roots,
        [b.id, owner.id, a.id],
        a.id,
        direction,
        delta,
        m,
      );
      const horizontal = direction.includes("w") || direction.includes("e");
      const vertical = direction.includes("n") || direction.includes("s");
      const fx = direction.includes("w") ? 1 : direction.includes("e") ? 0 : 0.5;
      const fy = direction.includes("n") ? 1 : direction.includes("s") ? 0 : 0.5;
      for (const root of roots) {
        const from = rootRect(roots, root.id, m),
          to = rootRect(next, root.id, m);
        expect(to.width / from.width).toBeCloseTo(horizontal ? 1.2 : 1, 10);
        expect(to.height / from.height).toBeCloseTo(vertical ? 1.1 : 1, 10);
        expectPoint(
          shapeFrameLocalToWorld(to, root.rotation, { x: to.width * fx, y: to.height * fy }),
          shapeFrameLocalToWorld(from, root.rotation, { x: from.width * fx, y: from.height * fy }),
        );
        expect(next.find((value) => value.id === root.id)?.rotation).toBe(root.rotation);
      }
      expect(isShapeGroupDrawing(next[1]) && next[1].members).toEqual(owner.members);
      expect(roots).toEqual(before);
    },
  );

  test("only the primary's aspect lock or Shift controls the common corner factor; sides keep one axis", () => {
    const m = metrics();
    const a = framed("a", { x: 300, y: 250, width: 200, height: 100 });
    const b = framed("b", { x: 700, y: 300, width: 80, height: 160 });
    b.shapeProperties = { lockAspectRatio: true, locked: false, altTitle: "B" };
    const ids = [b.id, a.id];
    const free = resizeSelectedShapeRoots([a, b], ids, a.id, "se", { x: 40, y: 10 }, m);
    expect(rootRect(free, b.id, m)).toMatchObject({ width: 96, height: 176 });
    const shifted = resizeSelectedShapeRoots([a, b], ids, a.id, "se", { x: 40, y: 10 }, m, true);
    expect(rootRect(shifted, b.id, m)).toMatchObject({ width: 96, height: 192 });
    a.shapeProperties = { lockAspectRatio: true };
    expect(resizeSelectedShapeRoots([a, b], ids, a.id, "se", { x: 40, y: 10 }, m)).toEqual(
      resizeSelectedShapeRoots([a, b], ids, a.id, "se", { x: 40, y: 10 }, m, true),
    );
    const side = resizeSelectedShapeRoots([a, b], ids, a.id, "e", { x: 40, y: 100 }, m, true);
    expect(rootRect(side, b.id, m)).toMatchObject({ width: 96, height: 160 });
    const sideB = side.find((root) => root.id === b.id)!;
    expect(hasShapeObjectFrame(sideB) && sideB.shapeProperties).toEqual(b.shapeProperties);
  });

  test("shared shrink caps at a deep descendant's 1px width while its orthogonal ratios stay fixed", () => {
    const m = metrics();
    const a = legacy("a", { x: 300, y: 100, width: 240, height: 160 });
    const owner = group("owner", { x: 700, y: 200, width: 8, height: 96 }, 37);
    owner.members = [nested("nested")];
    const before = structuredClone([a, owner]);
    const next = resizeSelectedShapeRoots(
      [a, owner],
      [owner.id, a.id],
      a.id,
      "e",
      { x: -239, y: 50 },
      m,
    );
    expect(rootRect(next, a.id, m).width).toBe(120);
    expect(rootRect(next, owner.id, m).width).toBe(4);
    const updated = next[1]!;
    if (!isShapeGroupDrawing(updated)) throw Error("Expected group.");
    const tree = resolveShapeGroup(updated, m),
      branch = tree.members[0]!;
    if (!("members" in branch)) throw Error("Expected nested group.");
    expect(branch.members[0]!.layout!.rect.width).toBe(1);
    expect(branch.members[0]!.layout!.rect.height).toBe(24);
    expect(updated.members).toEqual(owner.members);
    expect([a, owner]).toEqual(before);
  });

  test("a descendant at maximum size caps the common requested growth to an exact no-op", () => {
    const m = metrics();
    const a = framed("a", { x: 300, y: 100, width: 100, height: 80 });
    const owner = group("owner", { x: 700, y: 100, width: 128, height: 96 });
    owner.members[0]!.groupFrame.rect.widthRatio = 128;
    const roots = [a, owner];
    expect(
      resizeSelectedShapeRoots(
        roots,
        [owner.id, a.id],
        a.id,
        "e",
        { x: Number.MAX_VALUE, y: 0 },
        m,
      ),
    ).toEqual(normalizeShapeDrawingForest(roots));
  });

  test("infeasible subpixel and maximum descendant intervals reject a real resize without mutation", () => {
    const m = metrics();
    const tiny = subpixel("tiny");
    const owner = group("owner", { x: 100, y: 100, width: 128, height: 96 });
    owner.members[0]!.groupFrame.rect.widthRatio = 128;
    const roots = [tiny, owner],
      before = structuredClone(roots);
    expect(() =>
      resizeSelectedShapeRoots(roots, [tiny.id, owner.id], owner.id, "e", { x: 30, y: 0 }, m),
    ).toThrow(RangeError);
    expect(roots).toEqual(before);
  });

  test("a shared lower factor remains inside the 1px budget after inverse multiplication rounding", () => {
    const m = metrics();
    const a = framed("a", { x: 300, y: 100, width: 100, height: 80 });
    const owner = group("owner", { x: 700, y: 100, width: 1, height: 96 });
    owner.members[0]!.groupFrame.rect.widthRatio = 0.013;
    const next = resizeSelectedShapeRoots(
      [a, owner],
      [owner.id, a.id],
      a.id,
      "e",
      { x: 100, y: 0 },
      m,
    );
    const result = next[1]!;
    if (!isShapeGroupDrawing(result)) throw Error("Expected group.");
    expect(resolveShapeGroup(result, m).members[0]!.layout!.rect.width).toBeGreaterThanOrEqual(1);
    expect(rootRect(next, a.id, m).width / 100).toBeCloseTo(rootRect(next, owner.id, m).width, 10);
    expect(result.members).toEqual(owner.members);
  });

  test("an unlocked one-axis corner drag preserves unchanged subpixel widths, including the primary", () => {
    const m = metrics();
    const tiny = subpixel("tiny");
    const owner = group("owner", { x: 100, y: 100, width: 128, height: 96 });
    owner.members[0]!.groupFrame.rect.widthRatio = 128;
    const roots = [tiny, owner];
    const next = resizeSelectedShapeRoots(
      roots,
      [owner.id, tiny.id],
      tiny.id,
      "se",
      { x: 0, y: 0.5 },
      m,
    );
    expect(rootRect(next, tiny.id, m)).toEqual({ x: 10.75, y: 7.25, width: 0.25, height: 1 });
    expect(rootRect(next, owner.id, m)).toEqual({ x: 100, y: 100, width: 128, height: 192 });
    const result = next[1]!;
    if (!isShapeGroupDrawing(result)) throw Error("Expected group.");
    expect(result.members).toEqual(owner.members);
    expect(() =>
      resizeSelectedShapeRoots(
        roots,
        [owner.id, tiny.id],
        tiny.id,
        "se",
        { x: 0, y: 0.5 },
        m,
        true,
      ),
    ).toThrow(RangeError);
  });

  test("rotated legacy leading-space limits cap all factors together, without independent origin clamps", () => {
    const m = metrics();
    const old = legacy("old", { x: 0, y: 100, width: 100, height: 50 }, 90);
    const other = framed("other", { x: 300, y: 100, width: 200, height: 100 });
    const before = [old, other];
    // Growing local height at 90 degrees would push this legacy unrotated x below zero.
    expect(
      resizeSelectedShapeRoots(before, [old.id, other.id], other.id, "s", { x: 0, y: 100 }, m),
    ).toEqual(normalizeShapeDrawingForest(before));
    old.offsetX = 25;
    const next = resizeSelectedShapeRoots(
      before,
      [old.id, other.id],
      other.id,
      "s",
      { x: 0, y: 200 },
      m,
    );
    expect(rootRect(next, old.id, m).x).toBeGreaterThanOrEqual(0);
    expect(rootRect(next, old.id, m).height / 50).toBeCloseTo(2, 10);
    expect(rootRect(next, other.id, m).height / 100).toBeCloseTo(2, 10);
  });

  test.each(["left", "center", "right", "top", "middle", "bottom", "both"] as const)(
    "%s arrangement uses the last clicked real root and unrotated bounds",
    (action) => {
      const m = metrics();
      const a = framed("a", { x: 300, y: 250, width: 200, height: 100 }, 61);
      const b = group("b", { x: 700, y: 300, width: 80, height: 160 }, -37);
      b.members[0]!.groupFrame.rect.xRatio = 5;
      const next = alignSelectedShapeRoots([a, b], [b.id, a.id], action, m, "last-selected");
      const base = rootRect([a], a.id, m),
        actual = rootRect(next, b.id, m);
      const expected = { x: 700, y: 300 };
      if (action === "left") expected.x = base.x;
      if (action === "center" || action === "both") expected.x = base.x + 60;
      if (action === "right") expected.x = base.x + 120;
      if (action === "top") expected.y = base.y;
      if (action === "middle" || action === "both") expected.y = base.y - 30;
      if (action === "bottom") expected.y = base.y - 60;
      expect(actual).toEqual({ ...expected, width: 80, height: 160 });
      expect(next[0]).toEqual(normalizeShapeDrawingForest([a])[0]);
      expect(isShapeGroupDrawing(next[1]) && next[1].members).toEqual(b.members);
    },
  );

  test("selection-reference alignment uses the root union while stable distributions ignore reference mode", () => {
    const m = metrics();
    const a = framed("a", { x: 100, y: 100, width: 80, height: 40 });
    const b = group("b", { x: 100, y: 120, width: 100, height: 60 });
    const c = framed("c", { x: 600, y: 400, width: 120, height: 80 });
    const roots = [a, b, c],
      ids = [c.id, b.id, a.id];
    const aligned = alignSelectedShapeRoots(roots, ids, "both", m);
    expect(rootRect(aligned, a.id, m)).toMatchObject({ x: 370, y: 270 });
    const horizontal = alignSelectedShapeRoots(roots, ids, "horizontal", m, "last-selected");
    expect(horizontal).toEqual(alignSelectedShapeRoots(roots, ids, "horizontal", m));
    expect(rootRect(horizontal, a.id, m).x).toBe(100);
    expect(rootRect(horizontal, b.id, m).x).toBe(340);
    expect(rootRect(horizontal, c.id, m).x).toBe(600);
    const vertical = alignSelectedShapeRoots(roots, ids, "vertical", m);
    expect(rootRect(vertical, a.id, m).y).toBe(100);
    expect(rootRect(vertical, b.id, m).y).toBe(240);
    expect(rootRect(vertical, c.id, m).y).toBe(400);
    expect(alignSelectedShapeRoots([a, b], [a.id, b.id], "horizontal", m)).toEqual(
      normalizeShapeDrawingForest([a, b]),
    );
  });

  test("an unrepresentable last-reference arrangement rejects the whole forest", () => {
    const m = metrics();
    const a = legacy("a", { x: 10, y: 10, width: 200, height: 100 });
    const b = framed("b", { x: 0, y: 0, width: 20, height: 20 });
    const roots = [a, b],
      before = structuredClone(roots);
    expect(() =>
      alignSelectedShapeRoots(roots, [a.id, b.id], "center", m, "last-selected"),
    ).toThrow(RangeError);
    expect(roots).toEqual(before);
  });

  test.each(["selection", "last-selected"] as const)(
    "equal dimensions always use the last ordered root under %s reference",
    (reference) => {
      const m = metrics();
      const a = framed("a", { x: 100, y: 200, width: 100, height: 50 }, 37);
      a.shapeProperties = {
        lockAspectRatio: true,
        locked: false,
        printObject: false,
        altTitle: "A",
      };
      const b = group("b", { x: 500, y: 300, width: 120, height: 80 }, -23);
      const untouched = legacy("untouched", { x: 1, y: 1, width: 50, height: 30 });
      const roots = [b, untouched, a],
        ids = [a.id, b.id],
        canonical = normalizeShapeDrawingForest(roots);
      const width = equalizeSelectedShapeRoots(roots, ids, "equal-width", m, reference);
      expect(rootRect(width, a.id, m)).toEqual({ x: 100, y: 200, width: 120, height: 60 });
      const height = equalizeSelectedShapeRoots(roots, ids, "equal-height", m, reference);
      expect(rootRect(height, a.id, m)).toEqual({ x: 100, y: 200, width: 160, height: 80 });
      const size = equalizeSelectedShapeRoots(roots, ids, "equal-size", m, reference);
      expect(rootRect(size, a.id, m)).toEqual({ x: 100, y: 200, width: 120, height: 80 });
      const resized = size[2]!;
      expect(hasShapeObjectFrame(resized) && resized.shapeProperties).toEqual(a.shapeProperties);
      for (const next of [width, height, size]) {
        expect(JSON.stringify(next[0])).toBe(JSON.stringify(canonical[0]));
        expect(JSON.stringify(next[1])).toBe(JSON.stringify(canonical[1]));
        expect(next[2]?.rotation).toBe(37);
      }
    },
  );

  test("equal dimensions keep legacy free placement and unchanged subpixel targets", () => {
    const m = metrics();
    const a = legacy("a", { x: 180, y: 90, width: 100, height: 50 }, 61);
    const b = legacy("b", { x: 300, y: 100, width: 120, height: 80 });
    const next = equalizeSelectedShapeRoots([a, b], [a.id, b.id], "equal-size", m);
    expect(next[0]).toMatchObject({
      anchor: a.anchor,
      offsetX: 180,
      offsetY: 90,
      width: 120,
      height: 80,
      rotation: 61,
    });
    expect(next[0]).not.toHaveProperty("shapeFrame");
    const tinyA = subpixel("tiny-a"),
      tinyB = subpixel("tiny-b");
    expect(
      equalizeSelectedShapeRoots([tinyA, tinyB], [tinyA.id, tinyB.id], "equal-size", m),
    ).toEqual(normalizeShapeDrawingForest([tinyA, tinyB]));
    expect(() => equalizeSelectedShapeRoots([a, tinyA], [a.id, tinyA.id], "equal-size", m)).toThrow(
      RangeError,
    );
  });

  test("equal dimensions reject complete group descendant overflow before returning any plan", () => {
    const m = metrics();
    const a = group("a", { x: 100, y: 100, width: 128, height: 96 });
    a.members[0]!.groupFrame.rect.widthRatio = 128;
    const b = framed("b", { x: 500, y: 100, width: 256, height: 120 });
    const roots = [a, b],
      before = structuredClone(roots);
    expect(() => equalizeSelectedShapeRoots(roots, [a.id, b.id], "equal-width", m)).toThrow(
      RangeError,
    );
    expect(roots).toEqual(before);
  });

  test("missing, duplicate, foreign and child targets, collapsed geometry and malformed owned data reject atomically", () => {
    const m = metrics();
    const a = legacy("a", { x: 100, y: 100, width: 200, height: 100 });
    const owner = group("owner", { x: 500, y: 100, width: 200, height: 100 });
    const foreign = {
      ...legacy("icon", { x: 1, y: 1, width: 40, height: 40 }),
      kind: "icon" as const,
    };
    const roots = [a, owner, foreign],
      before = structuredClone(roots);
    for (const ids of [
      [a.id, a.id],
      [a.id, "missing"],
      [a.id, foreign.id],
      [a.id, owner.members[0]!.id],
    ])
      expect(() => moveSelectedShapeRoots(roots, ids, { x: 1, y: 1 }, m)).toThrow();
    expect(() =>
      resizeSelectedShapeRoots(
        roots,
        [a.id, owner.id],
        owner.members[0]!.id,
        "e",
        { x: 1, y: 0 },
        m,
      ),
    ).toThrow();
    expect(() => moveSelectedShapeRoots([a, { ...a }], [a.id], { x: 1, y: 1 }, m)).toThrow();
    const bad = structuredClone(owner);
    bad.members[0]!.groupFrame.rect.widthRatio = Number.MAX_VALUE;
    expect(() => moveSelectedShapeRoots([a, bad], [a.id], { x: 1, y: 1 }, m)).toThrow();
    const hiddenSheet = createSheet("Hidden", "hidden");
    hiddenSheet.hiddenColumns!.add(0);
    const hiddenMetrics = createPictureSheetMetrics(hiddenSheet);
    const collapsed = framed("collapsed", { x: 0, y: 0, width: 1, height: 1 });
    collapsed.shapeFrame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    expect(() =>
      moveSelectedShapeRoots([a, collapsed], [a.id, collapsed.id], { x: 1, y: 1 }, hiddenMetrics),
    ).toThrow(RangeError);
    const unselected = moveSelectedShapeRoots(
      [a, collapsed],
      [a.id],
      { x: 1, y: 1 },
      hiddenMetrics,
    );
    expect(unselected[1]).toEqual(normalizeShapeDrawingForest([collapsed])[0]);
    expect(roots).toEqual(before);
  });

  test("malformed selection and input coordinates never execute getters or accept invalid actions", () => {
    const m = metrics(),
      a = legacy("a", { x: 10, y: 10, width: 100, height: 50 });
    let reads = 0;
    const ids = [a.id];
    Object.defineProperty(ids, "0", {
      get() {
        reads++;
        return a.id;
      },
    });
    expect(() => moveSelectedShapeRoots([a], ids, { x: 1, y: 1 }, m)).toThrow(TypeError);
    const delta = {
      get x() {
        reads++;
        return 1;
      },
      y: 1,
    };
    expect(() => moveSelectedShapeRoots([a], [a.id], delta, m)).toThrow(TypeError);
    expect(reads).toBe(0);
    expect(() => moveSelectedShapeRoots([a], [a.id], { x: NaN, y: 1 }, m)).toThrow(RangeError);
    expect(() => alignSelectedShapeRoots([a], [a.id], "both", m)).toThrow(TypeError);
    expect(() =>
      equalizeSelectedShapeRoots([a, { ...a, id: "b" }], [a.id, "b"], "wrong" as never, m),
    ).toThrow(TypeError);
  });
});
