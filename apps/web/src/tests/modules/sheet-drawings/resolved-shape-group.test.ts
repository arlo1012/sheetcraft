// @vitest-environment node
import { describe, expect, test } from "vitest";
import { reactive } from "vue";
import {
  collectShapeGroupAssetIds,
  findShapeGroupNode,
  normalizeShapeGroup,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import { resolveShapeGroup } from "@sheetcraft/core/shape-group-layout";
import { leaseShapeGroupNode } from "@sheetcraft/core/shape-group-edit";
import {
  createPictureSheetMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { createSheet } from "@sheetcraft/core/workbook";
import type { ShapePaint } from "@sheetcraft/core/shape-style";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  resolveShapeGroupProjection,
  updateResolvedShapeGroupLeaf,
  type ResolvedShapeGroupLeaf,
} from "../../../modules/sheet-drawings/resolved-shape-group";

function leaf(id: string, kind: "shape" | "textBox" = "shape"): SheetGroupedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _w,
    height: _h,
    shapeGeometry: _geometry,
    ...appearance
  } = createGraphicDrawing(id, kind, `Object ${id}`, { row: 0, column: 0 });
  return {
    ...appearance,
    kind,
    text: "Literal 中文",
    fontSize: 19,
    rotation: 13,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: -0.25, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.25 },
    },
  };
}

function fixture() {
  const sheet = createSheet("Groups", "sheet");
  sheet.columnWidths = new Map([
    [0, 80],
    [1, 100],
    [2, 60],
  ]);
  sheet.rowHeights = new Map([
    [0, 20],
    [1, 30],
    [2, 40],
  ]);
  const a = leaf("a");
  const b = leaf("b", "textBox");
  const inner: ShapeGroupedGroup = {
    kind: "shapeGroup",
    id: "inner",
    name: "Inner",
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.1, yRatio: -0.2, widthRatio: 0.75, heightRatio: 0.5 },
    },
    rotation: 23,
    members: [a, b],
  };
  const root: ShapeGroupDrawing = {
    kind: "shapeGroup",
    id: "root",
    name: "Root",
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 97.25, y: 28.5, size: { width: 320, height: 100 } },
    },
    rotation: 37,
    members: [leaf("first"), inner, leaf("last")],
  };
  return { sheet, metrics: createPictureSheetMetrics(sheet), root, inner, a, b };
}

function viewOf(value: ResolvedShapeGroupLeaf): SheetGraphicDrawing {
  if (!value.view) throw new Error("Expected a placed leaf view.");
  return value.view;
}
function rectOf(view: SheetGraphicDrawing, metrics: PictureSheetMetrics) {
  return {
    x: metrics.columns.visiblePrefix(view.anchor.column) + view.offsetX,
    y: metrics.rows.visiblePrefix(view.anchor.row) + view.offsetY,
    width: view.width,
    height: view.height,
  };
}
function target(root: ShapeGroupDrawing, metrics: PictureSheetMetrics): ResolvedShapeGroupLeaf {
  const found = resolveShapeGroupProjection(root, metrics).leaves.find(
    (value) => value.sourceNode.id === "a",
  );
  if (!found) throw new Error("Expected test target.");
  return found;
}
function paint(assetId: string): ShapePaint {
  return {
    kind: "picture",
    assetId,
    opacity: 1,
    rotateWithShape: true,
    layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
  };
}

describe("owned shape group world projection", () => {
  test("keeps exact reactive root/node ownership and DFS order while detaching appearance", () => {
    const f = fixture();
    f.a.shapeGeometry = { preset: "roundRect", adjustments: { adj: 35000 } };
    f.a.shapeFlipX = true;
    f.a.shapeFlipY = true;
    f.a.shapeStyle = { fill: { kind: "value", value: paint("body") } };
    f.a.shapeText = {
      ...f.a.shapeText!,
      fontFamily: "SheetcraftLocal_0123456789abcdef",
      style: { fill: { kind: "value", value: paint("glyph") } },
    };
    f.a.shapeProperties = { altTitle: "A", locked: false, printObject: false };
    const source = reactive(f.root);
    const before = JSON.stringify(source);
    const projection = resolveShapeGroupProjection(source, f.metrics);
    const resolved = projection.leaves[1]!;
    const original = findShapeGroupNode(source, ["root", "inner", "a"])!.node;
    expect(projection.sourceRoot).toBe(source);
    expect(projection.metrics).toBe(f.metrics);
    expect(projection.leaves.map((value) => value.sourceNode.id)).toEqual([
      "first",
      "a",
      "b",
      "last",
    ]);
    expect(resolved.sourceRoot).toBe(source);
    expect(resolved.sourceNode).toBe(original);
    expect(resolved.metrics).toBe(f.metrics);
    expect(resolved.path).toEqual(["root", "inner", "a"]);
    expect(resolved.parentPath).toEqual(["root", "inner"]);
    expect(resolved.lease).toEqual(leaseShapeGroupNode(source, resolved.path));
    expect(resolved.lease).toBe(resolved.lease);
    expect(resolved.lease.node).not.toBe(original);
    const view = viewOf(resolved);
    expect(view).not.toBe(original);
    expect(view.rotation).toBe(73);
    expect(view.shapeGeometry).toEqual(f.a.shapeGeometry);
    expect(view.shapeStyle).toEqual(f.a.shapeStyle);
    expect(view.shapeText).toEqual(f.a.shapeText);
    expect(view.shapeText).not.toBe(f.a.shapeText);
    expect(view.shapeStyle).not.toBe(f.a.shapeStyle);
    expect(view.fontSize).toBe(19);
    expect(view.shapeFlipX).toBe(true);
    expect(view.shapeFlipY).toBe(true);
    for (const field of ["groupFrame", "shapeFrame", "shapeProperties", "members", "source"])
      expect(view).not.toHaveProperty(field);
    expect([...collectShapeGroupAssetIds(source)]).toEqual(["body", "glyph"]);
    expect(viewOf(projection.leaves[0]!)).not.toHaveProperty("shapeGeometry");
    view.name = "Disposable";
    view.shapeText!.layout.marginsPt.leftPt = 123;
    Object.assign(view.shapeGeometry!.adjustments!, { adj: 40000 });
    expect(JSON.stringify(source)).toBe(before);
  });

  test("owner outline records expose root/nested geometry without fake paint or leaf views", () => {
    const f = fixture();
    const projection = resolveShapeGroupProjection(f.root, f.metrics);
    expect(projection.owners.map((owner) => owner.path)).toEqual([["root"], ["root", "inner"]]);
    const [root, inner] = projection.owners;
    expect(root!.sourceNode).toBe(f.root);
    expect(root!.layout).toBe(projection.layout);
    expect(root!.parentPath).toBeNull();
    expect(root!.parentLayout).toBeNull();
    expect(inner!.sourceNode).toBe(f.inner);
    expect(inner!.parentLayout).toBe(projection.layout);
    expect(inner!.layout!.angleDeg).toBe(60);
    expect(inner!.layout!.rect.width).toBe(240);
    expect(inner!.layout!.rect.height).toBe(50);
    expect(projection.leaves[1]!.parentLayout).toBe(inner!.layout);
    for (const owner of projection.owners)
      for (const field of ["view", "shape", "fill", "stroke", "text", "fontSize"])
        expect(owner).not.toHaveProperty(field);
  });

  test("uses Core's orthogonal nested world layout under nonuniform parent scale", () => {
    const f = fixture();
    const projection = resolveShapeGroupProjection(f.root, f.metrics);
    const core = resolveShapeGroup(f.root, f.metrics);
    const inner = core.members[1]!;
    if (!("members" in inner)) throw new Error("Expected an owner.");
    const projected = projection.leaves[1]!;
    expect(projected.layout).toEqual(inner.members[0]!.layout);
    expect(rectOf(viewOf(projected), f.metrics)).toEqual(projected.layout!.rect);
    expect(viewOf(projected).width).toBe(120);
    expect(viewOf(projected).height).toBe(12.5);
    const [p, q, r] = projected.layout!.corners;
    expect((q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y)).toBeCloseTo(0, 8);
    expect(f.root.rotation).toBe(37);
    expect(f.inner.rotation).toBe(23);
    expect(f.a.rotation).toBe(13);
  });

  test.each(["leading", "terminal"] as const)(
    "retains exact %s free offsets and subpixel spans without legacy normalization",
    (space) => {
      const f = fixture();
      const x =
        space === "leading"
          ? -11.5
          : f.metrics.columns.visiblePrefix(f.metrics.columns.count) + 35.5;
      const y =
        space === "leading" ? -4.25 : f.metrics.rows.visiblePrefix(f.metrics.rows.count) + 12.25;
      f.root.shapeFrame.anchor = { mode: "fixed", x, y, size: { width: 40, height: 20 } };
      f.root.rotation = 0;
      f.a.rotation = 0;
      f.a.groupFrame.rect = { xRatio: 0, yRatio: 0, widthRatio: 0.0125, heightRatio: 0.025 };
      f.root.members = [f.a];
      const projected = target(f.root, f.metrics);
      const view = viewOf(projected);
      expect(view.anchor).toEqual({
        column: space === "leading" ? 0 : f.metrics.columns.count,
        row: space === "leading" ? 0 : f.metrics.rows.count,
      });
      expect(rectOf(view, f.metrics)).toEqual({ x, y, width: 0.5, height: 0.5 });
      expect(view.offsetX).toBe(space === "leading" ? -11.5 : 35.5);
      expect(view.offsetY).toBe(space === "leading" ? -4.25 : 12.25);
      expect(projected.collapsed).toBe(false);
      expect(updateResolvedShapeGroupLeaf(projected, view, f.metrics)).toEqual(f.root);
    },
  );

  test("collapsed owners retain source paths but never invent unplaced descendant world views", () => {
    const f = fixture();
    f.root.shapeFrame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    const before = structuredClone(f.root);
    const visible = resolveShapeGroupProjection(f.root, f.metrics);
    f.sheet.hiddenColumns = new Set([0]);
    const hiddenMetrics = createPictureSheetMetrics(f.sheet);
    const projection = resolveShapeGroupProjection(f.root, hiddenMetrics);
    expect(projection.layout.rect).toEqual({ x: 0, y: 0, width: 0, height: 20 });
    expect(projection.owners.every((owner) => owner.collapsed)).toBe(true);
    expect(projection.owners[1]!.layout).toBeNull();
    expect(projection.leaves).toHaveLength(4);
    expect(
      projection.leaves.every((value) => value.collapsed && !value.layout && !value.view),
    ).toBe(true);
    expect(projection.leaves[1]!.sourceNode).toBe(f.a);
    expect(() =>
      updateResolvedShapeGroupLeaf(
        projection.leaves[1]!,
        viewOf(visible.leaves[1]!),
        hiddenMetrics,
      ),
    ).toThrow(/collapsed/);
    expect(f.root).toEqual(before);
    f.sheet.hiddenColumns.clear();
    expect(resolveShapeGroupProjection(f.root, createPictureSheetMetrics(f.sheet)).layout).toEqual(
      visible.layout,
    );
  });

  test.each(["offscreen", "collapsed"] as const)(
    "validates malformed deep nodes beneath an %s owner",
    (scenario) => {
      const f = fixture();
      if (scenario === "offscreen")
        f.root.shapeFrame.anchor = {
          mode: "fixed",
          x: -10000,
          y: -10000,
          size: { width: 320, height: 100 },
        };
      else {
        f.root.shapeFrame.anchor = {
          mode: "move-and-size",
          start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
          end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
        };
        f.sheet.hiddenColumns = new Set([0]);
      }
      f.a.fontSize = 0;
      expect(() => resolveShapeGroupProjection(f.root, createPictureSheetMetrics(f.sheet))).toThrow(
        /Invalid sheet drawing/,
      );
    },
  );

  test("exposes only root-level effective lock/print behavior", () => {
    const f = fixture();
    f.a.shapeProperties = { locked: false, printObject: false };
    f.inner.shapeProperties = { locked: false, printObject: false };
    expect(resolveShapeGroupProjection(f.root, f.metrics)).toMatchObject({
      locked: true,
      printObject: true,
    });
    f.root.shapeProperties = { locked: false, printObject: false };
    expect(resolveShapeGroupProjection(f.root, f.metrics)).toMatchObject({
      locked: false,
      printObject: false,
    });
  });
});

describe("inverse owned shape leaf edits", () => {
  test("repeated exact world no-ops retain canonical local placement without numeric drift", () => {
    const f = fixture();
    const before = structuredClone(f.root);
    let next = f.root;
    for (let iteration = 0; iteration < 20; iteration++) {
      const projected = target(next, f.metrics);
      next = updateResolvedShapeGroupLeaf(projected, viewOf(projected), f.metrics);
    }
    expect(next).toEqual(normalizeShapeGroup(f.root));
    expect(next).not.toBe(f.root);
    expect(findShapeGroupNode(next, ["root", "inner", "a"])!.node).toEqual(f.a);
    expect(f.root).toEqual(before);
  });

  test("equivalent free-pixel origins and appearance-only edits preserve all owner frames", () => {
    const f = fixture();
    f.a.shapeProperties = { altTitle: "Original", lockAspectRatio: true };
    const projected = target(f.root, f.metrics);
    const next = updateResolvedShapeGroupLeaf(
      projected,
      {
        ...viewOf(projected),
        anchor: { column: 0, row: 0 },
        offsetX: projected.layout!.rect.x,
        offsetY: projected.layout!.rect.y,
        text: "Edited text",
        fontSize: 24,
      },
      f.metrics,
    );
    const updated = findShapeGroupNode(next, projected.path)!.node as SheetGroupedGraphicDrawing;
    expect(updated.groupFrame).toEqual(f.a.groupFrame);
    expect(updated.rotation).toBe(f.a.rotation);
    expect(updated.shapeProperties).toEqual(f.a.shapeProperties);
    expect(updated.shapeProperties).not.toBe(f.a.shapeProperties);
    expect(updated.text).toBe("Edited text");
    expect(updated.fontSize).toBe(24);
    expect(next.shapeFrame).toEqual(f.root.shapeFrame);
    expect(
      (findShapeGroupNode(next, projected.parentPath)!.node as ShapeGroupedGroup).groupFrame,
    ).toEqual(f.inner.groupFrame);
    for (const key of ["anchor", "offsetX", "offsetY", "width", "height", "shapeFrame", "source"])
      expect(updated).not.toHaveProperty(key);
  });

  test("nested rotated world move/resize/angle edits inverse only the immediate owner", () => {
    const f = fixture();
    const before = structuredClone(f.root);
    const projected = target(f.root, f.metrics);
    const nextView = {
      ...viewOf(projected),
      offsetX: viewOf(projected).offsetX - 123.25,
      offsetY: viewOf(projected).offsetY + 44.5,
      width: 216,
      height: 144,
      rotation: 323,
    };
    const next = updateResolvedShapeGroupLeaf(projected, nextView, f.metrics);
    const actual = target(next, f.metrics);
    if (actual.sourceNode.kind !== "shape" && actual.sourceNode.kind !== "textBox")
      throw new Error("Expected graphic test target.");
    const expected = rectOf(nextView, f.metrics);
    for (const key of ["x", "y", "width", "height"] as const)
      expect(actual.layout!.rect[key]).toBeCloseTo(expected[key], 9);
    expect(actual.layout!.angleDeg).toBe(323);
    expect(actual.sourceNode.rotation).toBe(263);
    expect(actual.sourceNode.fontSize).toBe(19);
    expect(actual.sourceNode.shapeText).toEqual(f.a.shapeText);
    expect(next.shapeFrame).toEqual(f.root.shapeFrame);
    expect(next.rotation).toBe(f.root.rotation);
    expect(
      (findShapeGroupNode(next, ["root", "inner"])!.node as ShapeGroupedGroup).groupFrame,
    ).toEqual(f.inner.groupFrame);
    expect(findShapeGroupNode(next, ["root", "inner", "b"])!.node).toEqual(f.b);
    expect(f.root).toEqual(before);
  });

  test("copies optional appearance edits and removal without inventing absent geometry", () => {
    const f = fixture();
    const projected = target(f.root, f.metrics);
    const nextView: SheetGraphicDrawing = {
      ...viewOf(projected),
      shapeGeometry: { preset: "roundRect", adjustments: { adj: 30000 } },
      shapeFlipX: true,
      shapeStyle: { fill: { kind: "value", value: paint("replacement") } },
      shapeText: {
        ...viewOf(projected).shapeText!,
        fontFamily: "SheetcraftLocal_0123456789abcdef",
        layout: { ...viewOf(projected).shapeText!.layout, wrap: false },
      },
    };
    const next = updateResolvedShapeGroupLeaf(projected, nextView, f.metrics);
    const updated = target(next, f.metrics);
    if (updated.sourceNode.kind !== "shape" && updated.sourceNode.kind !== "textBox")
      throw new Error("Expected graphic test target.");
    expect(updated.sourceNode.shapeGeometry).toEqual(nextView.shapeGeometry);
    expect(updated.sourceNode.shapeStyle).toEqual(nextView.shapeStyle);
    expect(updated.sourceNode.shapeStyle).not.toBe(nextView.shapeStyle);
    expect(updated.sourceNode.shapeText).not.toBe(nextView.shapeText);
    const {
      shapeGeometry: _geometry,
      shapeFlipX: _flip,
      shapeStyle: _style,
      ...plain
    } = viewOf(updated);
    const removed = target(updateResolvedShapeGroupLeaf(updated, plain, f.metrics), f.metrics);
    expect(removed.sourceNode).not.toHaveProperty("shapeGeometry");
    expect(removed.sourceNode).not.toHaveProperty("shapeFlipX");
    expect(removed.sourceNode).not.toHaveProperty("shapeStyle");
    expect(f.a).not.toHaveProperty("shapeGeometry");
    expect(f.a).not.toHaveProperty("shapeStyle");
  });

  test("in-place view edits leave the original layout and lazy canonical lease unchanged", () => {
    const f = fixture();
    const projected = target(f.root, f.metrics);
    const view = viewOf(projected);
    const originalLayout = structuredClone(projected.layout);
    view.offsetX += 25;
    view.width += 10;
    view.shapeText!.layout.wrap = false;
    expect(projected.lease.node).toEqual(f.a);
    const next = updateResolvedShapeGroupLeaf(projected, view, f.metrics);
    const updated = target(next, f.metrics);
    if (updated.sourceNode.kind !== "shape" && updated.sourceNode.kind !== "textBox")
      throw new Error("Expected graphic test target.");
    expect(updated.layout!.rect.x).toBeCloseTo(originalLayout!.rect.x + 25, 9);
    expect(updated.layout!.rect.width).toBeCloseTo(originalLayout!.rect.width + 10, 9);
    expect(updated.sourceNode.shapeText!.layout.wrap).toBe(false);
    expect(projected.layout).toEqual(originalLayout);
    expect(f.a.shapeText!.layout.wrap).toBe(true);
  });

  test.each(["target", "owner", "order", "reparent"] as const)(
    "rejects a stale %s mutation even when the lease is first read after mutation",
    (scenario) => {
      const f = fixture();
      const projected = target(f.root, f.metrics);
      if (scenario === "target") f.a.text = "Concurrent text";
      if (scenario === "owner") f.root.rotation = 99;
      if (scenario === "order") f.inner.members.reverse();
      if (scenario === "reparent") {
        f.inner.members.shift();
        f.root.members.push(f.a);
      }
      const before = structuredClone(f.root);
      expect(() => updateResolvedShapeGroupLeaf(projected, viewOf(projected), f.metrics)).toThrow(
        /stale|missing|reparented/,
      );
      expect(f.root).toEqual(before);
    },
  );

  test("rejects equivalent or changed metrics snapshots before applying any view edit", () => {
    const f = fixture();
    const projected = target(f.root, f.metrics);
    expect(() =>
      updateResolvedShapeGroupLeaf(
        projected,
        viewOf(projected),
        createPictureSheetMetrics(f.sheet),
      ),
    ).toThrow(/metrics snapshot/);
    f.sheet.hiddenColumns = new Set([0]);
    expect(() =>
      updateResolvedShapeGroupLeaf(
        projected,
        viewOf(projected),
        createPictureSheetMetrics(f.sheet),
      ),
    ).toThrow(/metrics snapshot/);
  });

  test.each([
    "shapeFrame",
    "groupFrame",
    "shapeProperties",
    "members",
    "source",
    "frame",
    "assetId",
    "unknown",
  ])("rejects injected %s authority without mutation", (field) => {
    const f = fixture();
    const projected = target(f.root, f.metrics);
    const before = structuredClone(f.root);
    expect(() =>
      updateResolvedShapeGroupLeaf(projected, { ...viewOf(projected), [field]: {} }, f.metrics),
    ).toThrow(/Unsupported/);
    expect(f.root).toEqual(before);
  });

  test.each([
    { id: "wrong" },
    { kind: "textBox" },
    { kind: "shapeGroup" },
    { offsetX: NaN },
    { offsetY: Infinity },
    { width: -1 },
    { width: 0 },
    { width: 16385 },
    { height: NaN },
    { rotation: Infinity },
    { anchor: { row: -1, column: 0 } },
    { anchor: { row: 0.5, column: 0 } },
    { fill: "invalid" },
    { fontSize: 0 },
    { shapeGeometry: { preset: "unknown" } },
  ])("rejects invalid edited candidates %j", (patch) => {
    const f = fixture();
    const projected = target(f.root, f.metrics);
    const before = structuredClone(f.root);
    const viewBefore = structuredClone(viewOf(projected));
    const candidate = { ...viewOf(projected), ...patch } as SheetGraphicDrawing;
    expect(() => updateResolvedShapeGroupLeaf(projected, candidate, f.metrics)).toThrow();
    expect(f.root).toEqual(before);
    expect(projected.view).toEqual(viewBefore);
  });

  test("rejects inherited/accessor/symbol view fields without evaluating accessors", () => {
    const f = fixture();
    const projected = target(f.root, f.metrics);
    let reads = 0;
    for (const location of ["view", "anchor"]) {
      const candidate = { ...viewOf(projected), anchor: { ...viewOf(projected).anchor } };
      Object.defineProperty(
        location === "view" ? candidate : candidate.anchor,
        location === "view" ? "width" : "column",
        {
          get: () => {
            reads++;
            return 100;
          },
        },
      );
      expect(() => updateResolvedShapeGroupLeaf(projected, candidate, f.metrics)).toThrow(
        /accessors/,
      );
    }
    const inherited = Object.create(viewOf(projected)) as SheetGraphicDrawing;
    expect(() => updateResolvedShapeGroupLeaf(projected, inherited, f.metrics)).toThrow(
      /ordinary data record/,
    );
    const symbolic = { ...viewOf(projected), [Symbol("authority")]: true };
    expect(() => updateResolvedShapeGroupLeaf(projected, symbolic, f.metrics)).toThrow(
      /Unsupported/,
    );
    expect(reads).toBe(0);
  });
});
