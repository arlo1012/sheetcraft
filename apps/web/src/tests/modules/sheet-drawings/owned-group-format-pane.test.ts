import { computed, effectScope, ref, shallowRef } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, createSheet, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  findShapeGroupNode,
  isShapeGroupDrawing,
  normalizeShapeGroup,
  traverseShapeGroup,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import {
  resolveShapeGroup,
  type ResolvedShapeGroupNode,
} from "@sheetcraft/core/shape-group-layout";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import type { ShapeFormatIntent } from "../../../modules/sheet-drawings/shape-format-pane-model";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { useOwnedShapeGroupFormatPane } from "../../../modules/sheet-drawings/useOwnedShapeGroupFormatPane";

const cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((stop) => stop()),
);
function leaf(id: string, kind: "shape" | "textBox" = "shape"): SheetGroupedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _width,
    height: _height,
    ...appearance
  } = createGraphicDrawing(id, kind, id, { row: 0, column: 0 });
  return {
    ...appearance,
    kind,
    text: "",
    rotation: 13,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.1, yRatio: 0.1, widthRatio: 0.4, heightRatio: 0.4 },
    },
  };
}
function group(): ShapeGroupDrawing {
  const line = leaf("line");
  line.shape = "line";
  line.shapeGeometry = { preset: "line" };
  return normalizeShapeGroup({
    kind: "shapeGroup",
    id: "root",
    name: "Root",
    rotation: 37,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 30, y: 20, size: { width: 320, height: 180 } },
    },
    members: [
      leaf("a"),
      line,
      {
        kind: "shapeGroup",
        id: "inner",
        name: "Inner",
        rotation: 29,
        shapeProperties: { locked: false, printObject: false, altTitle: "Inner local" },
        groupFrame: {
          kind: "shape-group-local-v1",
          rect: { xRatio: 0.3, yRatio: 0.3, widthRatio: 0.5, heightRatio: 0.5 },
        },
        members: [leaf("b"), leaf("text", "textBox")],
      },
    ],
  });
}
function fill(rgb = "#ABCDEF") {
  return { kind: "value", value: { kind: "solid", color: { kind: "rgb", rgb }, opacity: 0.5 } };
}
function pictureFill() {
  return {
    kind: "value",
    value: {
      kind: "picture",
      assetId: "texture",
      opacity: 1,
      rotateWithShape: true,
      layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
    },
  };
}
function fixture(initial = group()) {
  const workbook = ref(createWorkbook({ id: "group-pane", sheetId: "sheet" })),
    sheet = ref(getActiveSheet(workbook.value)),
    revision = ref(0),
    generation = ref(0),
    busy = ref(false);
  const sibling = createGraphicDrawing("sibling", "shape", "Sibling", { row: 0, column: 0 });
  sheet.value.drawings = [initial, sibling];
  const metrics = shallowRef(createPictureSheetMetrics(sheet.value));
  const metricsAvailable = ref(true);
  const session = createWorkbookSession({
    workbook: workbook.value,
    idFactory: createSequentialIdFactory(),
  });
  const flush = vi.fn(() => true),
    assets = vi.fn((_id: string) => true),
    prepare = vi.fn((next: SheetDrawing, _owner?: SheetDrawing) => next),
    execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
      const changed = executeWorkbookCommand(session, command);
      if (changed) revision.value++;
      return changed;
    });
  const scope = effectScope();
  const actions = scope.run(() =>
    useDrawingActions({
      getWorkbook: () => workbook.value,
      getSheet: () => sheet.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getMetrics: () => (metricsAvailable.value ? metrics.value : undefined),
      getAddress: () => ({ row: 0, column: 0 }),
      isBusy: () => busy.value,
      flush,
      execute,
      name: (kind) => kind,
      prepareDrawing: prepare,
    }),
  )!;
  const replace = vi.fn(actions.replaceCollection);
  const pane = scope.run(() =>
    useOwnedShapeGroupFormatPane({
      getWorkbook: () => workbook.value,
      getSheet: () => sheet.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getMetrics: () => (metricsAvailable.value ? metrics.value : undefined),
      isBusy: () => busy.value,
      flush,
      replaceCollection: replace,
      isAssetAvailable: assets,
      getUnsupportedReason: () => "Unavailable",
      getScopeDescription: ({ descendantCount, bodyEligibleCount, textEligibleCount, nested }) =>
        `${nested ? "Nested" : "Root"}: ${descendantCount} leaves; ${bodyEligibleCount} shapes; ${textEligibleCount} text frames`,
    }),
  )!;
  cleanup.push(() => scope.stop());
  const source = () => {
    const value = sheet.value.drawings![0]!;
    if (!isShapeGroupDrawing(value)) throw new Error("Expected actual root");
    return value;
  };
  const node = (id: string) =>
    traverseShapeGroup(source()).find((entry) => entry.node.id === id)!.node;
  const graphic = (id: string) => {
    const value = node(id);
    if (value.kind === "shapeGroup") throw new Error("Expected actual leaf");
    return value;
  };
  const intent = (body: Record<string, unknown>): ShapeFormatIntent =>
    ({
      ...body,
      owner: { ...pane.snapshot.value!.owner },
      baseRevision: revision.value,
      intentId: `intent-${revision.value}`,
    }) as ShapeFormatIntent;
  const field = (name: string, value: unknown) =>
    pane.onIntent(intent({ type: "set-field", field: name, value }));
  const open = (path: ShapeGroupPath = ["root"]) => pane.open(source(), path);
  const state = () => serializeWorkbook(workbook.value);
  const layout = (path: ShapeGroupPath = ["root"]) => {
    const all = resolveShapeGroup(source(), metrics.value);
    function find(entry: ResolvedShapeGroupNode): ResolvedShapeGroupNode | undefined {
      if (JSON.stringify(entry.path) === JSON.stringify(path)) return entry;
      if ("members" in entry)
        for (const member of entry.members) {
          const found = find(member);
          if (found) return found;
        }
    }
    return find(all)!.layout!;
  };
  return {
    workbook,
    sheet,
    revision,
    generation,
    busy,
    metrics,
    metricsAvailable,
    session,
    flush,
    assets,
    prepare,
    execute,
    replace,
    pane,
    source,
    node,
    graphic,
    intent,
    field,
    open,
    state,
    layout,
  };
}

describe("exact-owner actual shape group format pane", () => {
  test("root/nested snapshots expose real containers and common descendant fields without read history", () => {
    const f = fixture(),
      before = f.state(),
      root = f.source();
    expect(f.open()).toBe(true);
    expect(f.pane.root.value).toBe(root);
    expect(f.pane.drawing.value).toBe(root);
    expect(f.pane.snapshot.value!.drawing).toBe(root);
    expect(f.pane.snapshot.value!.values).toMatchObject({
      sizeWidthPt: 240,
      sizeHeightPt: 135,
      rotationDeg: 37,
      scaleWidthPercent: 100,
      scaleHeightPercent: 100,
      anchor: "fixed",
      locked: true,
      printObject: true,
    });
    expect(f.pane.snapshot.value!.scopeDescription).toContain("4 leaves");
    const nested = findShapeGroupNode(root, ["root", "inner"])!.node;
    expect(f.open(["root", "inner"])).toBe(true);
    expect(f.pane.snapshot.value!.drawing).toBe(nested);
    expect(f.pane.snapshot.value!.owner.drawingId).toBe("inner");
    expect(f.pane.path.value).toEqual(["root", "inner"]);
    expect(f.pane.snapshot.value!.values).toMatchObject({
      sizeWidthPt: 120,
      sizeHeightPt: 67.5,
      rotationDeg: 66,
      locked: true,
      printObject: true,
      anchor: "fixed",
      altTitle: "Inner local",
    });
    for (const key of ["width", "height", "fill", "text", "anchor", "shape"])
      expect(Object.hasOwn(f.pane.snapshot.value!.drawing, key)).toBe(false);
    expect(f.state()).toEqual(before);
    expect(f.session.history.undoStack).toEqual([]);
    expect(f.pane.capabilities.value.lineEnds?.enabled).toBe(false);
  });
  test.each([{ path: ["root"] }, { path: ["root", "inner"] }])(
    "world dimensions, session scales and NW-pinned aspect resize are atomic at $path",
    ({ path }) => {
      const f = fixture(),
        before = f.state();
      expect(f.open(path)).toBe(true);
      const owner = f.pane.snapshot.value!.owner,
        original = f.layout(path),
        corner = original.corners[0];
      expect(f.field("lockAspectRatio", true)).toBe(true);
      expect(f.field("scaleWidthPercent", 150)).toBe(true);
      expect(f.layout(path).rect.width).toBeCloseTo(original.rect.width * 1.5, 7);
      expect(f.layout(path).rect.height).toBeCloseTo(original.rect.height * 1.5, 7);
      expect(f.layout(path).corners[0].x).toBeCloseTo(corner.x, 7);
      expect(f.layout(path).corners[0].y).toBeCloseTo(corner.y, 7);
      expect(f.pane.snapshot.value!.owner).toEqual(owner);
      expect(f.pane.snapshot.value!.values.scaleWidthPercent).toBeCloseTo(150, 7);
      const after = f.state();
      expect(f.session.history.undoStack).toHaveLength(2);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      f.revision.value++;
      expect(f.state()).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      f.revision.value++;
      expect(f.state()).toEqual(after);
      expect(f.open(path)).toBe(true);
      expect(f.pane.snapshot.value!.owner.sessionId).not.toBe(owner.sessionId);
      expect(f.pane.snapshot.value!.values.scaleWidthPercent).toBe(100);
    },
  );
  test("nested anchor/lock/print inherit root while aspect and alt remain local", () => {
    const f = fixture();
    expect(f.open(["root", "inner"])).toBe(true);
    for (const name of ["anchor", "locked", "printObject"])
      expect(f.pane.capabilities.value.fields[name as "anchor"]?.enabled).toBe(false);
    const before = f.state();
    expect(f.field("anchor", "move")).toBe(false);
    expect(f.field("locked", false)).toBe(false);
    expect(f.field("printObject", false)).toBe(false);
    expect(f.state()).toEqual(before);
    expect(f.field("altDescription", "Nested description")).toBe(true);
    expect(f.field("lockAspectRatio", true)).toBe(true);
    expect(getShapeObjectProperties(f.node("inner").shapeProperties)).toMatchObject({
      altDescription: "Nested description",
      lockAspectRatio: true,
      locked: false,
      printObject: false,
    });
    expect(f.source().shapeProperties).toBeUndefined();
  });
  test("nested numeric dimensions and world rotation use its actual immediate owner", () => {
    const f = fixture();
    expect(f.open(["root", "inner"])).toBe(true);
    const before = f.layout(["root", "inner"]),
      corner = before.corners[0],
      frame = JSON.stringify(f.source().shapeFrame),
      untouched = JSON.stringify(f.graphic("a"));
    expect(f.field("sizeWidthPt", 150)).toBe(true);
    expect(f.field("sizeHeightPt", 90)).toBe(true);
    const resized = f.layout(["root", "inner"]);
    expect(resized.rect.width).toBeCloseTo(200, 8);
    expect(resized.rect.height).toBeCloseTo(120, 8);
    expect(resized.corners[0].x).toBeCloseTo(corner.x, 8);
    expect(resized.corners[0].y).toBeCloseTo(corner.y, 8);
    expect(f.field("rotationDeg", 110)).toBe(true);
    expect(f.layout(["root", "inner"]).angleDeg).toBeCloseTo(110, 8);
    expect(f.node("inner").rotation).toBeCloseTo(73, 8);
    expect(JSON.stringify(f.source().shapeFrame)).toBe(frame);
    expect(JSON.stringify(f.graphic("a"))).toBe(untouched);
    expect(f.session.history.undoStack).toHaveLength(3);
  });
  test("root object properties change only root and undo/redo in one command", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const members = JSON.stringify(f.source().members),
      before = f.state();
    expect(f.field("printObject", false)).toBe(true);
    expect(f.source().shapeProperties).toEqual({ printObject: false });
    expect(JSON.stringify(f.source().members)).toBe(members);
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = f.state();
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.state()).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.state()).toEqual(after);
  });
  test("fill and text batches apply to real eligible subtree leaves once, retaining frame and line/textbox bodies", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const before = f.state(),
      original = f.source(),
      frame = JSON.stringify(original.shapeFrame),
      line = JSON.stringify(f.graphic("line")),
      textbox = JSON.stringify(f.graphic("text"));
    const edit = f.intent({ type: "set-style", target: "shape", category: "fill", value: fill() });
    expect(f.pane.onIntent(edit)).toBe(true);
    expect(f.graphic("a").shapeStyle?.fill).toEqual(fill());
    expect(f.graphic("b").shapeStyle?.fill).toEqual(fill());
    expect(JSON.stringify(f.graphic("line"))).toBe(line);
    expect(JSON.stringify(f.graphic("text"))).toBe(textbox);
    expect(JSON.stringify(f.source().shapeFrame)).toBe(frame);
    expect(f.replace.mock.calls[0]![1][0]).toBe(original);
    expect(f.pane.snapshot.value!.acceptedIntentId).toBe(edit.intentId);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.open(["root", "inner"])).toBe(true);
    expect(f.field("textBold", true)).toBe(true);
    expect(f.graphic("a").bold).toBe(false);
    expect(f.graphic("b").bold).toBe(true);
    expect(f.graphic("text").bold).toBe(true);
    const after = f.state();
    expect(f.session.history.undoStack).toHaveLength(2);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.state()).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.state()).toEqual(after);
  });
  test("mixed fields/styles omit representatives and an explicit text-layout choice commits once", () => {
    const f = fixture();
    f.graphic("a").bold = true;
    f.graphic("a").fill = "#ff0000";
    f.graphic("b").shapeText!.layout.blockAlignment = "end";
    f.revision.value++;
    expect(f.open()).toBe(true);
    const snapshot = f.pane.snapshot.value!;
    expect(snapshot.mixedFields).toContain("textBold");
    expect(snapshot.values.textBold).toBeUndefined();
    expect(snapshot.mixedFields).toContain("textVerticalAlignment");
    expect(snapshot.values.textVerticalAlignment).toBeUndefined();
    expect(snapshot.mixedStyleCategories?.shape).toContain("fill");
    expect(snapshot.shapeStyle?.fill).toBeUndefined();
    expect(f.pane.capabilities.value.fields.textVerticalAlignment?.enabled).toBe(true);
    expect(f.field("textVerticalAlignment", "bottom")).toBe(true);
    for (const id of ["a", "b", "text"])
      expect(f.graphic(id).shapeText!.layout.blockAlignment).toBe("end");
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test("four text margins are one eligible-leaf transaction; no invented container line ends/effects", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const value = { leftPt: 2, rightPt: 3, topPt: 4, bottomPt: 5 };
    expect(f.pane.onIntent(f.intent({ type: "set-text-margins", value }))).toBe(true);
    for (const id of ["a", "b", "text"])
      expect(f.graphic(id).shapeText!.layout.marginsPt).toEqual(value);
    expect(f.session.history.undoStack).toHaveLength(1);
    const before = f.state();
    for (const category of ["reflection", "glow", "softEdges", "format3d", "rotation3d"])
      for (const target of ["shape", "text"]) {
        if (target === "shape" && (category === "reflection" || category === "glow")) continue;
        expect(
          f.pane.onIntent(
            f.intent({ type: "set-style", target, category, value: { kind: "none" } }),
          ),
        ).toBe(false);
      }
    expect(f.state()).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test.each(["reflection", "glow"] as const)(
    "container %s is an atomic owned edit with exact Undo/Redo",
    (category) => {
      const f = fixture();
      expect(f.open(["root", "inner"])).toBe(true);
      expect(f.pane.capabilities.value.styles?.shape?.[category]?.enabled).toBe(true);
      const before = f.state();
      expect(
        f.pane.onIntent(
          f.intent({ type: "set-style", target: "shape", category, value: { kind: "none" } }),
        ),
      ).toBe(true);
      const after = f.state();
      expect(after.version).toBe(65);
      expect(f.node("inner")).toHaveProperty(`groupEffects.${category}.kind`, "none");
      expect(f.graphic("b").shapeStyle?.[category]).toBeUndefined();
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(f.state()).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(f.state()).toEqual(after);
    },
  );

  test("connected root and nested panes apply one endpoint without dropping the other binding or decoration", () => {
    const initial = group();
    const bound = initial.members[1]! as SheetGroupedGraphicDrawing;
    bound.rotation = 0;
    bound.shapeConnector = {
      kind: "shape-connector-v1",
      begin: { kind: "free", xRatio: 0, yRatio: 0 },
      end: { kind: "free", xRatio: 1, yRatio: 1 },
    };
    bound.shapeLineEnds = { end: { kind: "diamond", width: "large" } };
    const f = fixture(initial);
    expect(f.open()).toBe(true);
    expect(f.pane.capabilities.value.lineEnds?.enabled).toBe(true);
    const before = f.state();
    expect(
      f.pane.onIntent(
        f.intent({ type: "set-line-end", endpoint: "begin", value: { kind: "open" } }),
      ),
    ).toBe(true);
    expect(f.graphic("line").shapeConnector).toEqual(bound.shapeConnector);
    expect(f.graphic("line").shapeLineEnds).toEqual({
      begin: { kind: "open" },
      end: bound.shapeLineEnds.end,
    });
    const after = f.state();
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.state()).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.state()).toEqual(after);
    expect(f.open(["root", "inner"])).toBe(true);
    expect(f.pane.capabilities.value.lineEnds?.enabled).toBe(false);
    expect(f.pane.capabilities.value.styles?.shape?.fill?.enabled).toBe(true);
  });

  test("text shadow is a genuine atomic descendant edit with exact history", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    expect(f.pane.capabilities.value.styles?.text?.shadow?.enabled).toBe(true);
    expect(f.pane.capabilities.value.styles?.shape?.shadow?.enabled).toBe(true);
    const before = f.state();
    expect(
      f.pane.onIntent(
        f.intent({
          type: "set-style",
          target: "text",
          category: "shadow",
          value: { kind: "none" },
        }),
      ),
    ).toBe(true);
    for (const id of ["a", "b", "text"])
      expect(f.graphic(id).shapeText?.style?.shadow).toEqual({ kind: "none" });
    expect(f.graphic("line").shapeText?.style).toBeUndefined();
    expect(f.source()).not.toHaveProperty("textStyle");
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = f.state();
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.state()).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.state()).toEqual(after);
  });

  test("body Shadow is one nested-container transaction and explicit None remains durable", () => {
    const f = fixture();
    expect(f.open(["root", "inner"])).toBe(true);
    expect(f.pane.capabilities.value.styles?.shape?.shadow?.enabled).toBe(true);
    const before = f.state();
    const edit = () =>
      f.pane.onIntent(
        f.intent({
          type: "set-style",
          target: "shape",
          category: "shadow",
          value: { kind: "none" },
        }),
      );
    expect(edit()).toBe(true);
    expect(f.node("inner")).toHaveProperty("groupEffects.shadow.kind", "none");
    expect(f.source().groupEffects).toBeUndefined();
    for (const id of ["a", "b", "text", "line"]) expect(f.graphic(id).shapeStyle).toBeUndefined();
    const after = f.state();
    expect(after.version).toBe(62);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(edit()).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.state()).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.state()).toEqual(after);
  });

  test("a textBox-only container has a real body Shadow owner without eligible shape leaves", () => {
    const root = group();
    root.members = [leaf("text-only", "textBox")];
    const f = fixture(root);
    expect(f.open()).toBe(true);
    expect(f.pane.capabilities.value.styles?.shape?.fill?.enabled).toBe(false);
    expect(f.pane.capabilities.value.styles?.shape?.shadow?.enabled).toBe(true);
    expect(
      f.pane.onIntent(
        f.intent({
          type: "set-style",
          target: "shape",
          category: "shadow",
          value: { kind: "none" },
        }),
      ),
    ).toBe(true);
    expect(f.source()).toHaveProperty("groupEffects.shadow.kind", "none");
    expect(f.graphic("text-only")).not.toHaveProperty("shapeStyle");
  });

  test("zero eligible leaf styles/text stay disabled while real container metadata remains active", () => {
    const initial = group();
    initial.members = [initial.members[1]!];
    const f = fixture(initial);
    expect(f.open()).toBe(true);
    expect(f.pane.capabilities.value.styles?.shape?.fill?.enabled).toBe(false);
    expect(f.pane.capabilities.value.styles?.shape?.line?.enabled).toBe(true);
    expect(f.pane.capabilities.value.fields.textWrap?.enabled).toBe(false);
    expect(f.pane.capabilities.value.fields.altTitle?.enabled).toBe(true);
    expect(f.field("altTitle", "A real line group")).toBe(true);
    expect(f.field("textBold", true)).toBe(false);
  });
  test("worksheet permission follows root, ignores private leaf lock and forbids root authorization edits", () => {
    const f = fixture();
    f.source().shapeProperties = { locked: false };
    f.graphic("b").shapeProperties = undefined;
    f.sheet.value.properties.protected = true;
    f.revision.value++;
    expect(f.open(["root", "inner"])).toBe(true);
    expect(f.field("textBold", true)).toBe(true);
    expect(f.field("altTitle", "Allowed local metadata")).toBe(true);
    expect(f.open()).toBe(true);
    expect(f.pane.capabilities.value.fields.locked?.enabled).toBe(false);
    expect(f.field("locked", true)).toBe(false);
    expect(f.field("sizeWidthPt", 288)).toBe(true);
    f.source().shapeProperties = undefined;
    f.revision.value++;
    expect(f.open()).toBe(false);
    f.sheet.value.protection = { editableRanges: [], editObjects: true };
    expect(f.open()).toBe(true);
    expect(f.field("locked", false)).toBe(true);
  });
  test("false/throw replacement preserves selection, committed values, acknowledgement and history", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const before = f.state(),
      snapshot = f.pane.snapshot.value!,
      edit = f.intent({ type: "set-field", field: "sizeWidthPt", value: 288 });
    f.replace.mockReturnValueOnce(false);
    expect(f.pane.onIntent(edit)).toBe(false);
    f.replace.mockImplementationOnce(() => {
      throw new Error("Rejected");
    });
    expect(f.pane.onIntent(edit)).toBe(false);
    f.replace.mockReturnValueOnce(true);
    expect(f.pane.onIntent(edit)).toBe(false);
    expect(f.pane.snapshot.value!.owner).toEqual(snapshot.owner);
    expect(f.pane.snapshot.value!.drawing).toBe(snapshot.drawing);
    expect(f.pane.snapshot.value!.acceptedIntentId).toBeUndefined();
    expect(f.state()).toEqual(before);
    expect(f.session.history.undoStack).toEqual([]);
  });
  test.each([
    "revision",
    "generation",
    "metrics",
    "workbook",
    "sheet",
    "membership",
    "busy",
    "root",
    "order",
    "sibling",
    "path",
    "leaf",
    "protection",
  ])("rejects stale %s around flush before any command", (change) => {
    const f = fixture();
    expect(f.open(["root", "inner"])).toBe(true);
    const edit = f.intent({ type: "set-field", field: "textBold", value: true });
    f.flush.mockImplementationOnce(() => {
      if (change === "revision") f.revision.value++;
      else if (change === "generation") f.generation.value++;
      else if (change === "metrics") f.metrics.value = createPictureSheetMetrics(f.sheet.value);
      else if (change === "workbook")
        f.workbook.value = createWorkbook({ id: "other", sheetId: "sheet" });
      else if (change === "sheet") f.sheet.value = createSheet("Other", "sheet");
      else if (change === "membership")
        f.workbook.value.sheets.set("sheet", createSheet("Other", "sheet"));
      else if (change === "busy") f.busy.value = true;
      else if (change === "root") f.sheet.value.drawings![0] = { ...f.source() };
      else if (change === "order") f.sheet.value.drawings!.reverse();
      else if (change === "sibling")
        f.sheet.value.drawings![1] = { ...f.sheet.value.drawings![1]! };
      else if (change === "path") f.source().members.reverse();
      else if (change === "leaf") f.graphic("a").color = "#ff0000";
      else if (change === "protection") f.sheet.value.properties.protected = true;
      return true;
    });
    expect(f.pane.onIntent(edit)).toBe(false);
    expect(f.replace).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toEqual([]);
  });
  test("stale callbacks cannot affect or acknowledge a newer same-root nested selection", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const stale = f.intent({ type: "set-field", field: "altTitle", value: "Stale" });
    expect(f.open(["root", "inner"])).toBe(true);
    const selected = f.pane.snapshot.value!.owner;
    expect(f.pane.onIntent(stale)).toBe(false);
    expect(f.pane.snapshot.value!.owner).toEqual(selected);
    expect(f.session.history.undoStack).toEqual([]);
  });
  test.each(["root", "sibling", "leaf", "metrics"])(
    "same-revision %s changes cannot impersonate the exposed owner snapshot",
    (change) => {
      const f = fixture();
      expect(f.open()).toBe(true);
      const edit = f.intent({ type: "set-field", field: "altTitle", value: "Stale" });
      if (change === "root") f.sheet.value.drawings![0] = { ...f.source() };
      else if (change === "sibling")
        f.sheet.value.drawings![1] = { ...f.sheet.value.drawings![1]! };
      else if (change === "leaf") f.graphic("a").color = "#ff0000";
      else f.metrics.value = createPictureSheetMetrics(f.sheet.value);
      expect(f.pane.onIntent(edit)).toBe(false);
      expect(f.replace).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toEqual([]);
    },
  );
  test("asset failure/new selection/epoch/reentrant intent reject before atomic replacement", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const before = f.state();
    const edit = () =>
      f.intent({ type: "set-style", target: "shape", category: "fill", value: pictureFill() });
    f.assets.mockReturnValueOnce(false);
    expect(f.pane.onIntent(edit())).toBe(false);
    f.assets.mockImplementationOnce(() => {
      f.generation.value++;
      return true;
    });
    expect(f.pane.onIntent(edit())).toBe(false);
    expect(f.open()).toBe(true);
    const stale = edit();
    f.assets.mockImplementationOnce(() => {
      expect(f.pane.onIntent(stale)).toBe(false);
      f.pane.close();
      expect(f.open(["root", "inner"])).toBe(true);
      return true;
    });
    expect(f.pane.onIntent(stale)).toBe(false);
    expect(f.pane.snapshot.value!.owner.drawingId).toBe("inner");
    expect(f.state()).toEqual(before);
    expect(f.replace).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toEqual([]);
  });
  test("selection changes during real collection preflight reject before command and retain the new pane", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const before = f.state(),
      edit = f.intent({ type: "set-field", field: "altTitle", value: "Stale preflight" });
    f.prepare.mockImplementationOnce((next) => {
      expect(f.open(["root", "inner"])).toBe(true);
      return next;
    });
    expect(f.pane.onIntent(edit)).toBe(false);
    expect(f.pane.snapshot.value!.owner.drawingId).toBe("inner");
    expect(f.pane.snapshot.value!.acceptedIntentId).toBeUndefined();
    expect(f.state()).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toEqual([]);
    expect(f.replace.mock.calls[0]![3]).toBeTypeOf("function");
  });
  test("late whole-group preparation failure preserves committed data and current owner", () => {
    const f = fixture();
    expect(f.open(["root", "inner"])).toBe(true);
    const before = f.state(),
      owner = f.pane.snapshot.value!.owner;
    f.prepare.mockImplementationOnce(() => {
      throw new Error("Late leaf render budget rejected");
    });
    expect(f.field("textBold", true)).toBe(false);
    expect(f.pane.snapshot.value!.owner).toEqual(owner);
    expect(f.pane.snapshot.value!.acceptedIntentId).toBeUndefined();
    expect(f.state()).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toEqual([]);
  });
  test("canonical no-op acknowledges exactly without replacement, preparation or history", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const before = f.state(),
      edit = f.intent({ type: "set-field", field: "altTitle", value: "" });
    expect(f.pane.onIntent(edit)).toBe(true);
    expect(f.pane.snapshot.value!.acceptedIntentId).toBe(edit.intentId);
    expect(f.state()).toEqual(before);
    expect(f.replace).not.toHaveBeenCalled();
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toEqual([]);
  });
  test("unknown path, stale root and missing world metrics never create a synthetic owner", () => {
    const f = fixture();
    expect(f.open(["root", "missing"])).toBe(false);
    expect(f.pane.open({ ...f.source() })).toBe(false);
    f.metricsAvailable.value = false;
    expect(f.open()).toBe(false);
    expect(f.pane.snapshot.value).toBeNull();
    expect(f.session.history.undoStack).toEqual([]);
  });
  test("opening captures committed dimensions after a successful flush", () => {
    const f = fixture();
    f.flush.mockImplementationOnce(() => {
      const anchor = f.source().shapeFrame.anchor;
      if (anchor.mode !== "fixed") throw new Error("Expected fixed root");
      anchor.size.width = 400;
      f.revision.value++;
      return true;
    });
    expect(f.open()).toBe(true);
    expect(f.pane.snapshot.value!.values.sizeWidthPt).toBe(300);
    expect(f.pane.snapshot.value!.values.scaleWidthPercent).toBe(100);
    expect(f.session.history.undoStack).toEqual([]);
  });
  test("reactive history updates preserve actual selected path and invalidate vanished membership", () => {
    const f = fixture();
    expect(f.open(["root", "inner"])).toBe(true);
    const actual = computed(() => findShapeGroupNode(f.source(), ["root", "inner"])!.node);
    expect(f.field("altTitle", "New title")).toBe(true);
    expect(f.pane.drawing.value).toBe(actual.value);
    f.workbook.value.sheets.set(f.sheet.value.id, createSheet("Replacement", f.sheet.value.id));
    expect(f.pane.snapshot.value).toBeNull();
    expect(f.pane.root.value).toBeUndefined();
  });
});

test("explicit ordinary leaf pane keeps canonical owner, sibling styles and exact text history", () => {
  const f = fixture(),
    before = f.state();
  const sibling = JSON.stringify(f.graphic("b"));
  expect(f.open(["root", "a"])).toBe(true);
  expect(f.pane.drawing.value).toBe(f.graphic("a"));
  expect(f.pane.capabilities.value.fields.locked?.enabled).toBe(false);
  expect(f.pane.capabilities.value.fields.paragraphAlignment?.enabled).toBe(true);
  expect(f.pane.capabilities.value.styles?.shape?.softEdges?.enabled).toBe(true);
  const old = f.intent({ type: "set-field", field: "paragraphAlignment", value: "right" });
  expect(f.pane.onIntent(old)).toBe(true);
  expect(f.graphic("a").shapeText?.paragraph.alignment).toBe("right");
  expect(JSON.stringify(f.graphic("b"))).toBe(sibling);
  expect(f.session.history.undoStack).toHaveLength(1);
  expect(f.pane.onIntent(old)).toBe(false);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  f.revision.value++;
  expect(f.state()).toEqual(before);
});
