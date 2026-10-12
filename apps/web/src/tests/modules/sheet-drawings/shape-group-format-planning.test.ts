// @vitest-environment node
import { describe, expect, test } from "vitest";
import { reactive } from "vue";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { anchorShapeFrameRect, shapeFrameLocalToWorld } from "@sheetcraft/core/shape-frame";
import {
  collectShapeGroupAssetIds,
  findShapeGroupNode,
  MAX_SHAPE_GROUP_DEPTH,
  MAX_SHAPE_GROUP_NODES,
  normalizeShapeGroup,
  traverseShapeGroup,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type ShapeGroupPath,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import { createSheet } from "@sheetcraft/core/workbook";
import type { ShapePaint } from "@sheetcraft/core/shape-style";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  aggregateShapeGroupFormatSnapshot,
  getShapeGroupFormatEligibleLeaves,
  isShapeGroupFormatContextCurrent,
  planShapeGroupFormatIntent,
  resolveShapeGroupFormatContext,
  type ShapeGroupFormatEdit,
} from "../../../modules/sheet-drawings/shape-group-format-planning";

function leaf(id: string, kind: "shape" | "textBox" = "shape"): SheetGroupedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _w,
    height: _h,
    ...appearance
  } = createGraphicDrawing(id, kind, `Object ${id}`, { row: 0, column: 0 });
  return {
    ...appearance,
    kind,
    text: `Literal ${id} 中文`,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: -0.25, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.5 },
    },
  };
}
function fixture() {
  const sheet = createSheet("Groups", "sheet");
  const a = leaf("a"),
    b = leaf("b", "textBox");
  const inner: ShapeGroupedGroup = {
    kind: "shapeGroup",
    id: "inner",
    name: "Inner",
    rotation: 0,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.1, yRatio: -0.2, widthRatio: 0.5, heightRatio: 0.5 },
    },
    members: [a, b],
  };
  const root: ShapeGroupDrawing = {
    kind: "shapeGroup",
    id: "root",
    name: "Root",
    rotation: 37,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: -17.25, y: -8.5, size: { width: 320, height: 160 } },
    },
    members: [leaf("first"), inner, leaf("last")],
  };
  return { sheet, metrics: createPictureSheetMetrics(sheet), root, inner, a, b };
}
function apply(
  f: ReturnType<typeof fixture>,
  path: ShapeGroupPath,
  intent: ShapeGroupFormatEdit,
  baseline = { width: 320, height: 160 },
) {
  return planShapeGroupFormatIntent(
    resolveShapeGroupFormatContext(f.root, path, f.metrics),
    intent,
    baseline,
  );
}
function node(root: ShapeGroupDrawing, path: ShapeGroupPath): SheetGroupedGraphicDrawing {
  return findShapeGroupNode(root, path)!.node as SheetGroupedGraphicDrawing;
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
function closePoint(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}

describe("actual container formatting context", () => {
  test("exposes exact reactive root and nested owners, full world geometry and real leaves", () => {
    const f = fixture();
    const root = reactive(f.root);
    const outer = resolveShapeGroupFormatContext(root, ["root"], f.metrics);
    const nested = resolveShapeGroupFormatContext(root, ["root", "inner"], f.metrics);
    expect(outer.sourceRoot).toBe(root);
    expect(outer.sourceNode).toBe(root);
    expect(nested.sourceNode).toBe(root.members[1]);
    expect(nested.layout!.angleDeg).toBe(37);
    expect(nested.layout!.rect.width).toBe(160);
    expect(nested.layout!.rect.height).toBe(80);
    expect(nested.leaves.map((entry) => entry.sourceNode.id)).toEqual(["a", "b"]);
    expect(outer.leaves.map((entry) => entry.sourceNode.id)).toEqual(["first", "a", "b", "last"]);
    for (const field of ["view", "fill", "stroke", "fontSize", "text"])
      expect(nested).not.toHaveProperty(field);
    expect(() => resolveShapeGroupFormatContext(root, ["root", "inner", "a"], f.metrics)).toThrow(
      /container/,
    );
    expect(() => resolveShapeGroupFormatContext(root, ["root", "missing"], f.metrics)).toThrow(
      /missing/,
    );
  });

  test("captures whole-root CAS, including nested replacement with equal content and stale siblings", () => {
    const f = fixture();
    const context = resolveShapeGroupFormatContext(f.root, ["root", "inner"], f.metrics);
    expect(isShapeGroupFormatContextCurrent(context, f.root)).toBe(true);
    expect(isShapeGroupFormatContextCurrent(context, normalizeShapeGroup(f.root))).toBe(false);
    expect(isShapeGroupFormatContextCurrent(context, f.root, ["root"])).toBe(false);
    f.root.members[1] = structuredClone(f.inner);
    expect(isShapeGroupFormatContextCurrent(context, f.root)).toBe(false);
    f.root.members[1] = f.inner;
    f.root.members[0]!.name = "Changed sibling";
    expect(() =>
      planShapeGroupFormatIntent(
        context,
        { type: "set-field", field: "altTitle", value: "Title" },
        { width: 160, height: 80 },
      ),
    ).toThrow(/stale/);
  });

  test("validates the complete tree before exposing a selected container", () => {
    const f = fixture();
    f.root.members[2]!.id = "a";
    expect(() => resolveShapeGroupFormatContext(f.root, ["root", "inner"], f.metrics)).toThrow(
      /Duplicate/,
    );
    f.root.members[2]!.id = "last";
    (f.root.members[2] as SheetGroupedGraphicDrawing).fontSize = 0;
    expect(() => resolveShapeGroupFormatContext(f.root, ["root", "inner"], f.metrics)).toThrow();
  });

  test("rejects shared ownership, depth and node budgets, including unselected descendants", () => {
    const f = fixture();
    f.root.members.push(f.a);
    expect(() => resolveShapeGroupFormatContext(f.root, ["root"], f.metrics)).toThrow(/shared/);
    f.root.members.pop();
    let child = f.inner;
    for (let depth = 0; depth < MAX_SHAPE_GROUP_DEPTH; depth++) {
      child = { ...child, id: `deep-${depth}`, members: [child] };
    }
    f.root.members = [child];
    expect(() => resolveShapeGroupFormatContext(f.root, ["root"], f.metrics)).toThrow(/depth/);
    f.root.members = Array.from({ length: MAX_SHAPE_GROUP_NODES }, (_, index) => ({
      ...leaf(`n-${index}`),
    }));
    expect(() => resolveShapeGroupFormatContext(f.root, ["root"], f.metrics)).toThrow(
      /node budget/,
    );
  });
});

describe("root and nested container geometry and properties", () => {
  test.each([[["root"]], [["root", "inner"]]])(
    "numeric size at 37 degrees pins the actual local northwest corner for %j",
    (path) => {
      const f = fixture();
      const before = JSON.stringify(f.root);
      const context = resolveShapeGroupFormatContext(f.root, path, f.metrics);
      const fixed = shapeFrameLocalToWorld(context.layout!.rect, 37, { x: 0, y: 0 });
      const plan = apply(f, path, { type: "set-field", field: "sizeWidthPt", value: 240 });
      const actual = resolveShapeGroupFormatContext(plan.root, path, f.metrics);
      expect(actual.layout!.rect.width).toBeCloseTo(320, 9);
      expect(actual.layout!.rect.height).toBe(context.layout!.rect.height);
      closePoint(
        shapeFrameLocalToWorld(actual.layout!.rect, actual.layout!.angleDeg, { x: 0, y: 0 }),
        fixed,
      );
      expect(JSON.stringify(f.root)).toBe(before);
      expect(plan.affectedPaths).toEqual([path]);
      expect(plan.root).not.toBe(f.root);
      if (path.length > 1) expect(plan.root.shapeFrame).toEqual(f.root.shapeFrame);
    },
  );

  test.each([[["root"]], [["root", "inner"]]])(
    "world rotation keeps the local layout center for %j",
    (path) => {
      const f = fixture();
      f.inner.rotation = 23;
      const before = resolveShapeGroupFormatContext(f.root, path, f.metrics).layout!;
      const plan = apply(f, path, { type: "set-field", field: "rotationDeg", value: 123 });
      const after = resolveShapeGroupFormatContext(plan.root, path, f.metrics).layout!;
      expect(after.angleDeg).toBe(123);
      closePoint(
        { x: after.rect.x + after.rect.width / 2, y: after.rect.y + after.rect.height / 2 },
        { x: before.rect.x + before.rect.width / 2, y: before.rect.y + before.rect.height / 2 },
      );
      if (path.length > 1) expect(findShapeGroupNode(plan.root, path)!.node.rotation).toBe(86);
    },
  );

  test("selection scale uses the supplied baseline, with local aspect ratio and a pinned northwest corner", () => {
    const f = fixture();
    f.inner.shapeProperties = { lockAspectRatio: true };
    const path = ["root", "inner"];
    const before = resolveShapeGroupFormatContext(f.root, path, f.metrics).layout!;
    let plan = apply(
      f,
      path,
      { type: "set-field", field: "scaleWidthPercent", value: 150 },
      { width: 160, height: 80 },
    );
    f.root = plan.root;
    plan = apply(
      f,
      path,
      { type: "set-field", field: "scaleWidthPercent", value: 200 },
      { width: 160, height: 80 },
    );
    const after = resolveShapeGroupFormatContext(plan.root, path, f.metrics).layout!;
    expect(after.rect.width).toBeCloseTo(320, 9);
    expect(after.rect.height).toBeCloseTo(160, 9);
    closePoint(
      shapeFrameLocalToWorld(after.rect, after.angleDeg, { x: 0, y: 0 }),
      shapeFrameLocalToWorld(before.rect, before.angleDeg, { x: 0, y: 0 }),
    );
    expect(() =>
      apply(
        f,
        path,
        { type: "set-field", field: "scaleWidthPercent", value: 10 },
        { width: 0, height: 80 },
      ),
    ).toThrow(/baseline/);
  });

  test.each(["move-size", "move", "fixed"] as const)(
    "root %s anchor conversion preserves negative world rect and angle",
    (anchor) => {
      const f = fixture();
      const before = resolveShapeGroupFormatContext(f.root, ["root"], f.metrics).layout!;
      const plan = apply(f, ["root"], { type: "set-field", field: "anchor", value: anchor });
      const after = resolveShapeGroupFormatContext(plan.root, ["root"], f.metrics).layout!;
      expect(after).toEqual(before);
      expect(
        aggregateShapeGroupFormatSnapshot(
          resolveShapeGroupFormatContext(plan.root, ["root"], f.metrics),
          { width: 320, height: 160 },
        ).values.anchor,
      ).toBe(anchor);
    },
  );

  test("nested worksheet flags and anchor inherit root while local aspect/alternate text are editable", () => {
    const f = fixture();
    f.root.shapeProperties = { locked: false, printObject: false, altTitle: "Outer" };
    f.inner.shapeProperties = {
      lockAspectRatio: true,
      altTitle: "Inner",
      altDescription: "Details",
    };
    const context = resolveShapeGroupFormatContext(f.root, ["root", "inner"], f.metrics);
    expect(
      aggregateShapeGroupFormatSnapshot(context, { width: 160, height: 80 }).values,
    ).toMatchObject({
      locked: false,
      printObject: false,
      anchor: "fixed",
      altTitle: "Inner",
      altDescription: "Details",
      lockAspectRatio: true,
    });
    for (const intent of [
      { type: "set-field", field: "anchor", value: "move" },
      { type: "set-field", field: "locked", value: true },
      { type: "set-field", field: "printObject", value: true },
    ] as const)
      expect(() => planShapeGroupFormatIntent(context, intent, { width: 160, height: 80 })).toThrow(
        /inherit/,
      );
    const plan = apply(f, context.path, {
      type: "set-field",
      field: "altTitle",
      value: "New inner",
    });
    expect(findShapeGroupNode(plan.root, context.path)!.node.shapeProperties).toMatchObject({
      altTitle: "New inner",
      altDescription: "Details",
      lockAspectRatio: true,
    });
    expect(plan.root.shapeProperties).toEqual(f.root.shapeProperties);
    expect(() =>
      apply(f, ["root"], { type: "set-field", field: "altDescription", value: "a".repeat(32769) }),
    ).toThrow(/bounded/);
  });

  test("metadata keeps collapsed trees, geometry rejects collapse, and subpixel leaves survive non-size edits", () => {
    const f = fixture();
    f.root.shapeFrame.anchor = anchorShapeFrameRect(
      "move-and-size",
      { x: 0, y: 0, width: 64, height: 24 },
      f.metrics,
    );
    f.sheet.hiddenColumns = new Set([0]);
    f.metrics = createPictureSheetMetrics(f.sheet);
    const context = resolveShapeGroupFormatContext(f.root, ["root", "inner"], f.metrics);
    expect(context.collapsed).toBe(true);
    expect(context.layout).toBeNull();
    expect(
      apply(f, context.path, { type: "set-field", field: "altTitle", value: "Accessible" }).root
        .members,
    ).toHaveLength(3);
    expect(() =>
      apply(f, context.path, { type: "set-field", field: "rotationDeg", value: 20 }),
    ).toThrow(/collapsed/);
    expect(() =>
      apply(f, context.path, { type: "set-field", field: "textBold", value: true }),
    ).toThrow(/eligible/);
    f.sheet.hiddenColumns.clear();
    f.metrics = createPictureSheetMetrics(f.sheet);
    f.root.shapeFrame.anchor = {
      mode: "fixed",
      x: -0.25,
      y: -0.5,
      size: { width: 40, height: 20 },
    };
    f.root.members = [f.a];
    f.a.groupFrame.rect = { xRatio: 0, yRatio: 0, widthRatio: 0.0125, heightRatio: 0.025 };
    expect(
      apply(f, ["root"], { type: "set-field", field: "rotationDeg", value: 21 }).root.members[0],
    ).toEqual(normalizeShapeGroup(f.root).members[0]);
    expect(() =>
      apply(f, ["root"], { type: "set-field", field: "sizeWidthPt", value: 0.75 }),
    ).toThrow(/size/);
  });
});

describe("genuine descendant fill/line and text batches", () => {
  test("body batch edits only eligible shapes inside the chosen subtree and preserves ownership and assets", () => {
    const f = fixture();
    f.a.shapeStyle = { line: { kind: "none" }, fill: { kind: "value", value: paint("old-body") } };
    f.a.shapeText!.style = { fill: { kind: "value", value: paint("glyph") } };
    f.a.shapeProperties = { altDescription: "Leaf metadata", locked: false };
    const before = normalizeShapeGroup(f.root);
    const plan = apply(f, ["root", "inner"], {
      type: "set-style",
      target: "shape",
      category: "fill",
      value: { kind: "value", value: paint("new-body") },
    });
    expect(plan.eligibleCount).toBe(1);
    expect(plan.descendantCount).toBe(2);
    expect(plan.affectedPaths).toEqual([["root", "inner", "a"]]);
    const changed = node(plan.root, ["root", "inner", "a"]);
    expect(changed.shapeStyle!.line).toEqual({ kind: "none" });
    expect(changed.shapeText).toEqual(f.a.shapeText);
    expect(changed.shapeProperties).toEqual(f.a.shapeProperties);
    expect(changed.groupFrame).toEqual(f.a.groupFrame);
    expect(changed.text).toBe(f.a.text);
    expect(plan.root.members[0]).toEqual(before.members[0]);
    expect(node(plan.root, ["root", "inner", "b"])).toEqual(f.b);
    expect([...collectShapeGroupAssetIds(plan.root)]).toEqual(["new-body", "glyph"]);
    expect(f.root).toEqual(before);
    for (const visit of traverseShapeGroup(plan.root))
      expect(visit.node).not.toBe(findShapeGroupNode(f.root, visit.path)!.node);
    for (const field of ["source", "shapeStyle", "shapeText", "fill", "stroke"])
      expect(findShapeGroupNode(plan.root, ["root", "inner"])!.node).not.toHaveProperty(field);
  });

  test("text layout and font batches preserve each literal and body style, without editing lines/open paths", () => {
    const f = fixture();
    const line = leaf("line");
    line.shapeGeometry = { preset: "line" };
    line.text = "Line literal must stay";
    const open = leaf("open");
    delete open.shapeGeometry;
    open.shapePath = {
      tool: "freeform",
      viewBox: { width: 100, height: 100 },
      commands: [
        ["M", 0, 0],
        ["L", 100, 100],
      ],
    };
    open.text = "Open path literal must stay";
    f.inner.members.push(line, open);
    f.a.shapeStyle = { fill: { kind: "value", value: paint("body") } };
    const before = normalizeShapeGroup(f.root);
    let plan = apply(f, ["root", "inner"], {
      type: "set-field",
      field: "textVerticalAlignment",
      value: "bottom",
    });
    expect(plan.eligibleCount).toBe(2);
    expect(node(plan.root, ["root", "inner", "a"]).shapeText!.layout.blockAlignment).toBe("end");
    expect(node(plan.root, ["root", "inner", "b"]).shapeText!.layout.blockAlignment).toBe("end");
    expect(node(plan.root, ["root", "inner", "line"])).toEqual(line);
    expect(node(plan.root, ["root", "inner", "open"])).toEqual(open);
    f.root = plan.root;
    plan = apply(f, ["root", "inner"], { type: "set-field", field: "fontSizePt", value: 24 });
    expect(node(plan.root, ["root", "inner", "a"]).fontSize).toBe(32);
    expect(node(plan.root, ["root", "inner", "b"]).fontSize).toBe(32);
    expect(node(plan.root, ["root", "inner", "a"]).shapeStyle).toEqual(f.a.shapeStyle);
    for (const visit of traverseShapeGroup(plan.root))
      if (visit.node.kind !== "shapeGroup")
        expect(visit.node.text).toBe(node(before, visit.path).text);
  });

  test("explicit text fill None and grouped margins remain real leaf edits with no inherited paint leak", () => {
    const f = fixture();
    f.a.shapeText!.style = {
      fill: { kind: "value", value: paint("glyph") },
      line: { kind: "none" },
    };
    const none = apply(f, ["root", "inner"], {
      type: "set-style",
      target: "text",
      category: "fill",
      value: { kind: "none" },
    });
    expect(none.eligibleCount).toBe(2);
    for (const id of ["a", "b"]) {
      const current = node(none.root, ["root", "inner", id]);
      expect(current.shapeText!.style!.fill).toEqual({ kind: "none" });
      expect(current.color).toBe(id === "a" ? f.a.color : f.b.color);
      expect(current.text).toBe(id === "a" ? f.a.text : f.b.text);
    }
    f.root = none.root;
    const margins = apply(f, ["root", "inner"], {
      type: "set-text-margins",
      value: { leftPt: 1, rightPt: 2, topPt: 3, bottomPt: 4 },
    });
    expect(node(margins.root, ["root", "inner", "a"]).shapeText!.layout.marginsPt).toEqual({
      leftPt: 1,
      rightPt: 2,
      topPt: 3,
      bottomPt: 4,
    });
    expect(node(margins.root, ["root", "inner", "a"]).shapeText!.style!.fill).toEqual({
      kind: "none",
    });
    const before = JSON.stringify(f.root);
    expect(() =>
      apply(f, ["root", "inner"], {
        type: "set-text-margins",
        value: { leftPt: -1, rightPt: 2, topPt: 3, bottomPt: 4 },
      }),
    ).toThrow();
    expect(JSON.stringify(f.root)).toBe(before);
  });

  test("unsupported all-target edits and invalid batch values reject atomically", () => {
    const f = fixture();
    f.inner.members = [f.a];
    f.a.shapeGeometry = { preset: "line" };
    const before = JSON.stringify(f.root);
    expect(() =>
      apply(f, ["root", "inner"], {
        type: "set-style",
        target: "shape",
        category: "fill",
        value: { kind: "none" },
      }),
    ).toThrow(/eligible/);
    expect(() =>
      apply(f, ["root", "inner"], { type: "set-field", field: "textBold", value: true }),
    ).toThrow(/eligible/);
    expect(() =>
      apply(f, ["root"], {
        type: "set-style",
        target: "shape",
        category: "fill",
        value: {
          kind: "value",
          value: { kind: "solid", color: { kind: "rgb", rgb: "#ff0000" }, opacity: 2 },
        },
      }),
    ).toThrow();
    expect(JSON.stringify(f.root)).toBe(before);
  });

  test("unverified body and text effects reject rather than invent leaf effects", () => {
    const f = fixture();
    const before = JSON.stringify(f.root);
    for (const target of ["shape", "text"] as const)
      for (const category of ["reflection", "glow", "softEdges", "format3d", "rotation3d"] as const)
        expect(() =>
          apply(f, ["root"], { type: "set-style", target, category, value: { kind: "none" } }),
        ).toThrow(/group effect model/);
    expect(JSON.stringify(f.root)).toBe(before);
  });

  test("body shadow edits only the selected real owner and never aggregates descendant shadows", () => {
    const f = fixture();
    f.a.shapeStyle = { shadow: { kind: "none" } };
    const before = JSON.stringify(f.root);
    const initial = aggregateShapeGroupFormatSnapshot(
      resolveShapeGroupFormatContext(f.root, ["root", "inner"], f.metrics),
      { width: 160, height: 80 },
    );
    expect(initial.shapeStyle.shadow).toBeUndefined();
    expect(initial.mixedStyleCategories.shape).not.toContain("shadow");
    const result = apply(f, ["root", "inner"], {
      type: "set-style",
      target: "shape",
      category: "shadow",
      value: { kind: "none" },
    });
    expect(result.affectedPaths).toEqual([["root", "inner"]]);
    expect(findShapeGroupNode(result.root, ["root", "inner"])!.node).toHaveProperty(
      "groupEffects.shadow.kind",
      "none",
    );
    expect(result.root.groupEffects).toBeUndefined();
    expect(node(result.root, ["root", "inner", "a"]).shapeStyle).toEqual(f.a.shapeStyle);
    const aggregate = aggregateShapeGroupFormatSnapshot(
      resolveShapeGroupFormatContext(result.root, ["root", "inner"], f.metrics),
      { width: 160, height: 80 },
    );
    expect(aggregate.shapeStyle.shadow).toEqual({ kind: "none" });
    expect(JSON.stringify(f.root)).toBe(before);
    expect(f.inner).not.toHaveProperty("groupEffects");
  });

  test("text shadow batches only eligible real leaves without inventing a container style", () => {
    const f = fixture();
    const before = JSON.stringify(f.root);
    const result = apply(f, ["root", "inner"], {
      type: "set-style",
      target: "text",
      category: "shadow",
      value: { kind: "none" },
    });
    expect(result.affectedPaths).toEqual([
      ["root", "inner", "a"],
      ["root", "inner", "b"],
    ]);
    expect(node(result.root, ["root", "inner", "a"]).shapeText?.style?.shadow).toEqual({
      kind: "none",
    });
    expect(node(result.root, ["root", "inner", "b"]).shapeText?.style?.shadow).toEqual({
      kind: "none",
    });
    expect(node(result.root, ["root", "first"]).shapeText?.style).toBeUndefined();
    expect(result.root).not.toHaveProperty("shapeStyle");
    expect(JSON.stringify(f.root)).toBe(before);
  });

  test("aggregates common text and genuine per-category styles, exposing explicit mixed fields", () => {
    const f = fixture();
    f.a.fill = "#ff0000";
    f.a.fontSize = 32;
    f.a.bold = true;
    f.b.fontSize = 20;
    f.b.shapeText!.layout.blockAlignment = "end";
    const context = resolveShapeGroupFormatContext(f.root, ["root", "inner"], f.metrics);
    const aggregate = aggregateShapeGroupFormatSnapshot(context, { width: 160, height: 80 });
    expect(aggregate.values).toMatchObject({
      sizeWidthPt: 120,
      sizeHeightPt: 60,
      rotationDeg: 37,
      scaleWidthPercent: 100,
      scaleHeightPercent: 100,
      textWrap: true,
    });
    expect(aggregate.values).not.toHaveProperty("fontSizePt");
    expect(aggregate.values).not.toHaveProperty("textBold");
    expect(aggregate.values).not.toHaveProperty("textVerticalAlignment");
    expect(aggregate.mixedFields).toEqual(
      expect.arrayContaining(["fontSizePt", "textBold", "textVerticalAlignment"]),
    );
    expect(aggregate.bodyEligibleCount).toBe(1);
    expect(aggregate.textEligibleCount).toBe(2);
    expect(aggregate.shapeStyle.fill).toMatchObject({
      kind: "value",
      value: { color: { rgb: "#FF0000" } },
    });
    f.root.members[0] = leaf("other");
    const outer = aggregateShapeGroupFormatSnapshot(
      resolveShapeGroupFormatContext(f.root, ["root"], f.metrics),
      { width: 320, height: 160 },
    );
    expect(outer.shapeStyle).not.toHaveProperty("fill");
    expect(outer.mixedStyleCategories.shape).toContain("fill");
    const leaves = getShapeGroupFormatEligibleLeaves(context, "text");
    expect(leaves.map((entry) => entry.sourceNode.id)).toEqual(["a", "b"]);
    expect(
      getShapeGroupFormatEligibleLeaves(context, "shape", "fill").map(
        (entry) => entry.sourceNode.id,
      ),
    ).toEqual(["a"]);
  });

  test("conditional text fields target only actual supported descendants and preserve the rest", () => {
    const f = fixture();
    f.a.shapeText!.layout.direction = "stacked";
    f.b.shapeText!.paragraph.lineSpacing = { kind: "exact", pt: 20 };
    const lineOrder = apply(f, ["root", "inner"], {
      type: "set-field",
      field: "textLineOrder",
      value: "ltr",
    });
    expect(lineOrder.affectedPaths).toEqual([["root", "inner", "a"]]);
    expect(node(lineOrder.root, ["root", "inner", "b"])).toEqual(f.b);
    const aggregate = aggregateShapeGroupFormatSnapshot(
      resolveShapeGroupFormatContext(lineOrder.root, ["root", "inner"], f.metrics),
      { width: 160, height: 80 },
    );
    expect(aggregate.values.textLineOrder).toBe("ltr");
    expect(aggregate.values.paragraphLineSpacingPt).toBe(20);
    expect(aggregate.mixedFields).not.toContain("textLineOrder");
    const spacing = apply(f, ["root", "inner"], {
      type: "set-field",
      field: "paragraphLineSpacingPt",
      value: 24,
    });
    expect(spacing.affectedPaths).toEqual([["root", "inner", "b"]]);
    expect(node(spacing.root, ["root", "inner", "a"])).toEqual(f.a);
  });
});
