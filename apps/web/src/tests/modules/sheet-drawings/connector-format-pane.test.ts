// @vitest-environment node
import { effectScope, ref, shallowRef } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { anchorShapeFrameRect } from "@sheetcraft/core/shape-frame";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { findShapeGroupNode, traverseShapeGroup } from "@sheetcraft/core/shape-group";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { normalizeSheetDrawings, type SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import { framedShape } from "./framed-shape-fixture";
import type { ShapeFormatIntent } from "../../../modules/sheet-drawings/shape-format-pane-model";
import { resolveShapeForestForRender } from "../../../modules/sheet-drawings/resolved-shape-render-source";
import * as paint from "../../../modules/sheet-drawings/shape-detailed-paint";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { useOwnedShapeConnectorFormatPane } from "../../../modules/sheet-drawings/useOwnedShapeConnectorFormatPane";

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((stop) => stop());
  vi.restoreAllMocks();
});
function initialForest() {
  const target = { ...framedShape(), id: "target", text: "" };
  target.shapeFrame.anchor = {
    mode: "fixed",
    x: 40,
    y: 40,
    size: { width: 80, height: 50 },
  };
  const connector = {
    ...framedShape(),
    id: "connection",
    text: "",
    rotation: 17,
    shapeGeometry: { preset: "bentConnector3" as const },
    shapeFlipX: true as const,
    shapeFrame: {
      kind: "shape-frame-v1" as const,
      anchor: { mode: "fixed" as const, x: 10, y: 200, size: { width: 140, height: 80 } },
    },
    shapeConnector: {
      kind: "shape-connector-v1" as const,
      begin: { kind: "site" as const, targetId: "target", preset: "rect" as const, siteIndex: 3 },
      end: { kind: "free" as const, xRatio: 1, yRatio: 1 },
    },
  };
  return normalizeSheetDrawings([target, connector]);
}
function fixture(owned = false) {
  const workbook = shallowRef(createWorkbook({ id: "connector-pane", sheetId: "sheet" }));
  const sheet = shallowRef(getActiveSheet(workbook.value));
  const revision = ref(0),
    generation = ref(0),
    busy = ref(false),
    metricsAvailable = ref(true);
  sheet.value.drawings = initialForest();
  const metrics = shallowRef(createPictureSheetMetrics(sheet.value));
  if (owned)
    sheet.value.drawings = groupShapeRoots(
      sheet.value.drawings,
      ["target", "connection"],
      { id: "owner", name: "Owner" },
      metrics.value,
    );
  const session = createWorkbookSession({
    workbook: workbook.value,
    idFactory: createSequentialIdFactory(),
  });
  const flush = vi.fn(() => true),
    available = vi.fn((_id: string) => true);
  const size = vi.fn((_id: string) => ({ width: 16, height: 16 }));
  const decode = vi.fn();
  const prepare = vi.fn((next: SheetDrawing) => next);
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  const scope = effectScope();
  const actions = scope.run(() =>
    useDrawingActions({
      getWorkbook: () => workbook.value,
      getSheet: () => sheet.value,
      getRevision: () => revision.value,
      getGeneration: () => generation.value,
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
    useOwnedShapeConnectorFormatPane({
      getWorkbook: () => workbook.value,
      getSheet: () => sheet.value,
      getRevision: () => revision.value,
      getGeneration: () => generation.value,
      getMetrics: () => (metricsAvailable.value ? metrics.value : undefined),
      isBusy: () => busy.value,
      flush,
      replaceCollection: replace,
      isAssetAvailable: available,
      getPaintResources: () => ({ getAssetSize: size, getAssetImage: decode }),
      getUnsupportedReason: () => "Unavailable",
    }),
  )!;
  cleanup.push(() => scope.stop());
  const root = () => sheet.value.drawings![owned ? 0 : 1]!;
  const drawing = () => {
    const owner = root();
    const source =
      owner.kind === "shapeGroup"
        ? findShapeGroupNode(owner, [owner.id, "connection"])!.node
        : owner;
    if (source.kind !== "shape" || !("shapeFrame" in source || "groupFrame" in source))
      throw Error("Expected connector source");
    return source;
  };
  const path = owned ? ["owner", "connection"] : ["connection"];
  const open = () => pane.open(root(), path);
  const intent = (body: Record<string, unknown>): ShapeFormatIntent =>
    ({
      ...body,
      owner: { ...pane.snapshot.value!.owner },
      baseRevision: revision.value,
      intentId: `intent-${revision.value}`,
    }) as ShapeFormatIntent;
  const style = (category: string, value: unknown, target = "shape") =>
    pane.onIntent(intent({ type: "set-style", target, category, value }));
  const field = (name: string, value: unknown) =>
    pane.onIntent(intent({ type: "set-field", field: name, value }));
  const state = () => serializeWorkbook(workbook.value);
  const route = () =>
    resolveShapeForestForRender({
      drawings: sheet.value.drawings!,
      metrics: metrics.value,
      revision: revision.value,
    }).getLeaf("connection")!.connector;
  return {
    workbook,
    sheet,
    revision,
    generation,
    busy,
    metricsAvailable,
    metrics,
    session,
    flush,
    available,
    size,
    decode,
    prepare,
    execute,
    replace,
    pane,
    root,
    drawing,
    path,
    open,
    intent,
    style,
    field,
    state,
    route,
  };
}
function line(picture = false) {
  return {
    kind: "value",
    value: {
      paint: picture
        ? {
            kind: "picture",
            assetId: "texture",
            opacity: 1,
            rotateWithShape: true,
            layout: {
              kind: "stretch",
              offsetXRatio: 0,
              offsetYRatio: 0,
              widthRatio: 1,
              heightRatio: 1,
            },
          }
        : { kind: "solid", color: { kind: "rgb", rgb: "#123456" }, opacity: 0.5 },
      widthPt: 2,
      compound: "single",
      dash: "dash",
      cap: "round",
      join: "round",
      miterLimit: 4,
    },
  };
}
const effects: ShapeDetailedStyle = {
  shadow: {
    kind: "value",
    value: {
      kind: "outer",
      color: { kind: "rgb", rgb: "#000000" },
      opacity: 0.3,
      scale: 1,
      blurPt: 1,
      distancePt: 2,
      angleDeg: 45,
      anchor: "center",
    },
  },
  reflection: { kind: "value", value: { size: 0.5, opacity: 0.2, blurPt: 1, distancePt: 1 } },
  glow: {
    kind: "value",
    value: { color: { kind: "rgb", rgb: "#FF0000" }, opacity: 0.4, sizePt: 2 },
  },
  softEdges: { kind: "value", value: { sizePt: 1 } },
};

describe("exact canonical connector format session", () => {
  test.each([false, true])(
    "root/owned=%s snapshots expose actual sources and explicit closed controls",
    (owned) => {
      const f = fixture(owned),
        before = f.state(),
        root = f.root(),
        source = f.drawing();
      expect(f.open()).toBe(true);
      expect(f.pane.root.value).toBe(root);
      expect(f.pane.drawing.value).toBe(source);
      expect(f.pane.snapshot.value!.drawing).toBe(source);
      expect(f.pane.path.value).toEqual(f.path);
      expect(f.pane.snapshot.value!.owner.drawingId).toBe("connection");
      for (const category of ["line", "shadow", "reflection", "glow", "softEdges"] as const)
        expect(f.pane.capabilities.value.styles!.shape![category]!.enabled).toBe(true);
      for (const category of ["fill", "format3d", "rotation3d"] as const)
        expect(f.pane.capabilities.value.styles!.shape![category]!.enabled).toBe(false);
      for (const category of Object.keys(f.pane.capabilities.value.styles!.text!))
        expect(
          f.pane.capabilities.value.styles!.text![category as keyof ShapeDetailedStyle]!.enabled,
        ).toBe(false);
      for (const field of [
        "anchor",
        "sizeWidthPt",
        "sizeHeightPt",
        "rotationDeg",
        "scaleWidthPercent",
        "fontSizePt",
        "textWrap",
      ] as const)
        expect(f.pane.capabilities.value.fields[field]!.enabled).toBe(false);
      expect(f.pane.capabilities.value.fields.altTitle!.enabled).toBe(!owned);
      expect(f.pane.capabilities.value.lineEnds!.enabled).toBe(true);
      expect(f.state()).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );

  test.each([false, true])(
    "root/owned=%s line/effects/markers keep frame, flips, bindings and order; real undo/redo",
    (owned) => {
      const f = fixture(owned),
        original = f.state();
      expect(f.open()).toBe(true);
      const structural = JSON.stringify(
        {
          frame: f.drawing(),
          forest: normalizeSheetDrawings(f.sheet.value.drawings),
        },
        (key, value) => (["shapeStyle", "shapeLineEnds"].includes(key) ? undefined : value),
      );
      expect(f.style("line", line())).toBe(true);
      for (const category of Object.keys(effects))
        expect(f.style(category, effects[category as keyof ShapeDetailedStyle])).toBe(true);
      const ends = { begin: { kind: "open" }, end: { kind: "triangle", width: "large" } };
      expect(f.pane.onIntent(f.intent({ type: "set-line-ends", value: ends }))).toBe(true);
      expect(f.drawing().shapeLineEnds).toEqual(ends);
      expect(
        JSON.stringify(
          { frame: f.drawing(), forest: normalizeSheetDrawings(f.sheet.value.drawings) },
          (key, value) => (["shapeStyle", "shapeLineEnds"].includes(key) ? undefined : value),
        ),
      ).toBe(structural);
      expect(f.session.history.undoStack).toHaveLength(6);
      expect(f.pane.snapshot.value!.acceptedIntentId).toBe("intent-5");
      const applied = f.state();
      for (let index = 0; index < 6; index++) {
        expect(undoWorkbookCommand(f.session)).toBe(true);
        f.revision.value++;
      }
      expect(f.state()).toEqual(original);
      expect(f.pane.snapshot.value!.drawing).toBe(f.drawing());
      for (let index = 0; index < 6; index++) {
        expect(redoWorkbookCommand(f.session)).toBe(true);
        f.revision.value++;
      }
      expect(f.state()).toEqual(applied);
      expect(f.pane.snapshot.value!.drawing).toBe(f.drawing());
      expect(f.decode).not.toHaveBeenCalled();
    },
  );

  test("pure preflight consumes the actual re-resolved route identity, never preset carrier geometry", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const planner = vi.spyOn(paint, "planShapeDetailedPaint");
    expect(f.style("line", line())).toBe(true);
    const call = planner.mock.calls.at(-1)![0];
    expect(call.connectorRoute!.geometry).toBe(call.geometry);
    expect(call.drawing.width).toBe(call.connectorRoute!.paintLayout.rect.width);
    expect(call.drawing.height).toBe(call.connectorRoute!.paintLayout.rect.height);
    expect(call.drawing.rotation).toBe(call.connectorRoute!.paintLayout.angleDeg);
    expect(call.drawing.shapeFlipX).toBeUndefined();
    expect(call.geometry.width).not.toBe(140);
    expect(f.drawing().shapeFlipX).toBe(true);
  });

  test("only root object properties are writable, owned values inherit the root", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    expect(f.field("lockAspectRatio", true)).toBe(true);
    expect(f.field("printObject", false)).toBe(true);
    expect(f.field("locked", false)).toBe(true);
    expect(f.field("altTitle", "Connector title")).toBe(true);
    expect(f.field("altDescription", "Connector description")).toBe(true);
    expect(f.drawing().shapeProperties).toEqual({
      lockAspectRatio: true,
      printObject: false,
      locked: false,
      altTitle: "Connector title",
      altDescription: "Connector description",
    });
    const g = fixture(true);
    const owner = g.root();
    if (owner.kind !== "shapeGroup") throw Error("Expected owner");
    owner.shapeProperties = { locked: false, printObject: false, altTitle: "Owner title" };
    g.drawing().shapeProperties = { lockAspectRatio: true, altTitle: "Local title" };
    expect(g.open()).toBe(true);
    expect(g.pane.snapshot.value!.values).toMatchObject({
      locked: false,
      printObject: false,
      lockAspectRatio: false,
      altTitle: "Owner title",
    });
    const before = g.state();
    expect(g.field("altTitle", "Attempted local title")).toBe(false);
    expect(g.state()).toEqual(before);
  });

  test.each([
    { type: "set-style", target: "shape", category: "fill", value: { kind: "none" } },
    { type: "set-style", target: "text", category: "line", value: { kind: "none" } },
    { type: "set-style", target: "shape", category: "rotation3d", value: { kind: "none" } },
    { type: "set-field", field: "sizeWidthPt", value: 400 },
    { type: "set-field", field: "anchor", value: "move" },
    { type: "set-field", field: "textWrap", value: true },
    { type: "set-field", field: "locked", value: "false" },
    { type: "set-field", field: "altTitle", value: "x".repeat(32769) },
    { type: "set-style", target: "shape", category: "line", value: { kind: "value", value: {} } },
    { type: "set-line-ends", value: { end: { kind: "invalid" } } },
    { type: "set-text-margins", value: { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 } },
  ])(
    "unsupported/illegal intent rejects without data or history changes: $type $field $category",
    (body) => {
      const f = fixture();
      expect(f.open()).toBe(true);
      const before = f.state();
      expect(f.pane.onIntent(f.intent(body))).toBe(false);
      expect(f.state()).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.replace).not.toHaveBeenCalled();
    },
  );

  test("resource availability and actual paint budget failures are atomic", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const before = f.state();
    f.available.mockReturnValue(false);
    expect(f.style("line", line(true))).toBe(false);
    f.available.mockReturnValue(true);
    f.size.mockReturnValue(undefined as unknown as { width: number; height: number });
    expect(f.style("line", line(true))).toBe(false);
    const excessiveDashes = line();
    excessiveDashes.value.widthPt = 0.000001;
    expect(f.style("line", excessiveDashes)).toBe(false);
    expect(f.state()).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.replace).not.toHaveBeenCalled();
    expect(f.decode).not.toHaveBeenCalled();
    f.size.mockReturnValue({ width: 16, height: 16 });
    expect(f.style("line", line(true))).toBe(true);
  });

  test.each([
    "source",
    "target",
    "source-data",
    "target-data",
    "owned",
    "collection",
    "metrics",
    "metric-data",
    "missing-metrics",
    "generation",
    "revision",
    "owner",
    "busy",
    "protection",
    "sheet",
    "workbook",
  ])("%s change invalidates previously captured intent", (change) => {
    const f = fixture(change === "owned" || change === "owner" || change === "metric-data");
    expect(f.open()).toBe(true);
    const captured = f.intent({
      type: "set-style",
      target: "shape",
      category: "line",
      value: line(),
    });
    if (change === "source") f.sheet.value.drawings![1] = structuredClone(f.root());
    if (change === "target")
      f.sheet.value.drawings![0] = structuredClone(f.sheet.value.drawings![0]!);
    if (change === "source-data") f.drawing().rotation++;
    if (change === "target-data") f.sheet.value.drawings![0]!.rotation++;
    if (change === "owned") {
      const root = f.root();
      if (root.kind !== "shapeGroup") throw Error("Expected owner");
      root.members[1] = structuredClone(root.members[1]!);
    }
    if (change === "collection") f.sheet.value.drawings = [...f.sheet.value.drawings!];
    if (change === "metrics") f.metrics.value = createPictureSheetMetrics(f.sheet.value);
    if (change === "missing-metrics") f.metricsAvailable.value = false;
    if (change === "metric-data") {
      const prefix = f.metrics.value.columns.visiblePrefix;
      f.metrics.value.columns.visiblePrefix = (index) => prefix(index) * 2;
    }
    if (change === "generation") f.generation.value++;
    if (change === "revision") f.revision.value++;
    if (change === "owner") {
      const root = f.root();
      if (root.kind !== "shapeGroup") throw Error("Expected owner");
      root.members.reverse();
    }
    if (change === "busy") f.busy.value = true;
    if (change === "protection") f.sheet.value.properties.protected = true;
    if (change === "sheet") f.sheet.value = { ...f.sheet.value };
    if (change === "workbook") f.workbook.value = { ...f.workbook.value };
    const before = f.state();
    expect(f.pane.onIntent(captured)).toBe(false);
    expect(f.state()).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.replace).not.toHaveBeenCalled();
  });

  test("a rebuilt render metric opens a fresh visible lease and rejects old callbacks without losing the next edit", () => {
    const f = fixture(true);
    expect(f.open()).toBe(true);
    const old = f.intent({ type: "set-line-ends", value: { end: { kind: "triangle" } } });
    const initialSession = f.pane.snapshot.value!.owner.sessionId;
    f.metrics.value = createPictureSheetMetrics(f.sheet.value);
    expect(f.pane.snapshot.value!.drawing.id).toBe("connection");
    expect(f.pane.snapshot.value!.owner.sessionId).not.toBe(initialSession);
    const before = f.state();
    expect(f.pane.onIntent(old)).toBe(false);
    expect(f.state()).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.style("line", line())).toBe(true);
    const afterLine = f.state();
    const acceptedSession = f.pane.snapshot.value!.owner.sessionId;
    f.metrics.value = createPictureSheetMetrics(f.sheet.value);
    expect(f.pane.snapshot.value!.owner.sessionId).not.toBe(acceptedSession);
    expect(f.pane.snapshot.value!.drawing).toBe(f.drawing());
    expect(f.state()).toEqual(afterLine);
    expect(
      f.pane.onIntent(f.intent({ type: "set-line-ends", value: { end: { kind: "diamond" } } })),
    ).toBe(true);
    expect(f.drawing().shapeLineEnds?.end?.kind).toBe("diamond");
    expect(f.session.history.undoStack).toHaveLength(2);
  });

  test("flush and collection preparation cannot switch source, metric, revision or selection under an intent", () => {
    for (const hook of ["flush", "prepare"] as const) {
      const f = fixture();
      expect(f.open()).toBe(true);
      const captured = f.intent({
        type: "set-style",
        target: "shape",
        category: "line",
        value: line(),
      });
      if (hook === "flush")
        f.flush.mockImplementation(() => {
          f.metrics.value = createPictureSheetMetrics(f.sheet.value);
          return true;
        });
      else
        f.prepare.mockImplementation((next) => {
          f.revision.value++;
          return next;
        });
      const before = f.state();
      expect(f.pane.onIntent(captured)).toBe(false);
      expect(f.state()).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    }
  });

  test("nested exact path edits preserve all ancestors and leaf carrier data", () => {
    const f = fixture(true);
    const root = f.root();
    if (root.kind !== "shapeGroup") throw Error("Expected owner");
    root.rotation = 21;
    root.members = [
      {
        kind: "shapeGroup",
        id: "inner",
        name: "Inner",
        rotation: 31,
        groupFrame: {
          kind: "shape-group-local-v1",
          rect: { xRatio: 0.1, yRatio: 0.1, widthRatio: 0.8, heightRatio: 0.8 },
        },
        members: root.members,
      },
    ];
    f.sheet.value.drawings = normalizeSheetDrawings(f.sheet.value.drawings);
    const path = ["owner", "inner", "connection"];
    const before = JSON.stringify(f.sheet.value.drawings, (key, value) =>
      key === "shapeStyle" ? undefined : value,
    );
    expect(f.pane.open(f.root(), path)).toBe(true);
    expect(f.pane.path.value).toEqual(path);
    expect(f.style("line", line())).toBe(true);
    expect(
      JSON.stringify(f.sheet.value.drawings, (key, value) =>
        key === "shapeStyle" ? undefined : value,
      ),
    ).toBe(before);
    expect(f.pane.snapshot.value!.drawing).toBe(
      findShapeGroupNode(f.root() as typeof root, path)!.node,
    );
  });

  test("selection replacement during resource lookup cannot commit an old asynchronous owner", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const captured = f.intent({
      type: "set-style",
      target: "shape",
      category: "line",
      value: line(true),
    });
    f.size.mockImplementation(() => {
      f.pane.close();
      f.open();
      return { width: 16, height: 16 };
    });
    const before = f.state();
    expect(f.pane.onIntent(captured)).toBe(false);
    expect(f.state()).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.replace).not.toHaveBeenCalled();
  });

  test("failed replace and no-op success leave history unchanged", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const before = f.state();
    f.replace.mockReturnValue(false);
    expect(f.style("line", line())).toBe(false);
    expect(f.state()).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    f.replace.mockImplementation(() => {
      throw Error("rejected");
    });
    expect(f.style("line", line())).toBe(false);
    expect(f.state()).toEqual(before);
    expect(f.style("shadow", undefined)).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("scope uses outer-root protection, never local unlocked leaf metadata", () => {
    const f = fixture(true);
    f.sheet.value.properties.protected = true;
    f.drawing().shapeProperties = { locked: false };
    expect(f.open()).toBe(false);
    const owner = f.root();
    if (owner.kind !== "shapeGroup") throw Error("Expected owner");
    owner.shapeProperties = { locked: false };
    expect(f.open()).toBe(true);
    expect(f.style("line", line())).toBe(true);
    expect(f.field("locked", false)).toBe(false);
    const g = fixture();
    g.drawing().shapeProperties = { locked: false };
    g.sheet.value.properties.protected = true;
    expect(g.open()).toBe(true);
    expect(g.pane.capabilities.value.fields.locked!.enabled).toBe(false);
    expect(g.field("locked", true)).toBe(false);
    g.sheet.value.protection = { editableRanges: [], editObjects: true };
    expect(g.field("locked", true)).toBe(true);
  });

  test.each(["text", "3d", "degenerate", "suspended"])(
    "%s connector cannot open or manufacture a carrier paint",
    (state) => {
      const f = fixture();
      if (state === "text") f.drawing().text = "Historical label";
      if (state === "3d")
        f.drawing().shapeStyle = {
          rotation3d: {
            kind: "value",
            value: {
              projection: "parallel",
              xDeg: 10,
              yDeg: 20,
              zDeg: 0,
              distanceFromGroundPt: 0,
            },
          },
        };
      if (state === "degenerate")
        f.drawing().shapeConnector = {
          kind: "shape-connector-v1",
          begin: { kind: "free", xRatio: 0, yRatio: 0 },
          end: { kind: "free", xRatio: 0, yRatio: 0 },
        };
      if (state === "suspended") {
        const target = f.sheet.value.drawings![0]!;
        if (!("shapeFrame" in target)) throw Error("Expected framed target");
        target.shapeFrame.anchor = anchorShapeFrameRect(
          "move-and-size",
          { x: 40, y: 40, width: 80, height: 50 },
          f.metrics.value,
        );
        f.sheet.value.hiddenColumns = new Set(Array.from({ length: 11 }, (_, index) => index));
        f.sheet.value.hiddenRows = new Set(Array.from({ length: 11 }, (_, index) => index));
        f.metrics.value = createPictureSheetMetrics(f.sheet.value);
      }
      const before = f.state();
      const planner = vi.spyOn(paint, "planShapeDetailedPaint");
      expect(f.pane.open(f.sheet.value.drawings!.at(-1)!)).toBe(false);
      expect(f.pane.snapshot.value).toBeNull();
      expect(f.state()).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(planner).not.toHaveBeenCalled();
    },
  );

  test("reopen changes owner; removed/reparented path closes after revision", () => {
    const f = fixture(true);
    expect(f.open()).toBe(true);
    const old = f.intent({ type: "set-style", target: "shape", category: "line", value: line() });
    f.pane.close();
    expect(f.open()).toBe(true);
    expect(f.pane.onIntent(old)).toBe(false);
    const root = f.root();
    if (root.kind !== "shapeGroup") throw Error("Expected owner");
    root.members = root.members.filter((node) => node.id !== "connection");
    f.revision.value++;
    expect(f.pane.snapshot.value).toBeNull();
    expect(f.pane.path.value).toBeUndefined();
    expect(traverseShapeGroup(root).some(({ node }) => node.id === "connection")).toBe(false);
  });
});
