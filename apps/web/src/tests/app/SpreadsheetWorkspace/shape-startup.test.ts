import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { nextTick, toRaw } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import DrawingEditorDialog from "../../../modules/sheet-drawings/components/DrawingEditorDialog.vue";
import ShapeGallery from "../../../modules/sheet-drawings/components/ShapeGallery.vue";
import ShapeToolsToolbar from "../../../modules/sheet-drawings/components/ShapeToolsToolbar.vue";
import ShapeSelectionPane from "../../../modules/sheet-drawings/components/ShapeSelectionPane.vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { resolveSheetShapeConnections } from "@sheetcraft/core/shape-connector-layout";
import { planShapeConnectorRouteAdjustment } from "@sheetcraft/core/shape-connector-editing";
import { shapeFrameLocalToWorld } from "@sheetcraft/core/shape-frame";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  createWorkbook,
  createSheet,
  insertSheet,
  getActiveSheet,
} from "@sheetcraft/core/workbook";
import { isShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import { groupShapeRoots, ungroupShapeRoot } from "@sheetcraft/core/shape-group-planning";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { framedShape } from "../../modules/sheet-drawings/framed-shape-fixture";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import ShapeFormatPane from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import ShapeFormatNumberField from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatNumberField.vue";
import PicturePaintNumber from "../../../modules/sheet-images/components/format-pane/PicturePaintNumber.vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import ShapeLineEndsControls from "../../../modules/sheet-drawings/components/ShapeLineEndsControls.vue";
import { isFramedShapeDrawing } from "@sheetcraft/core/sheet-drawings";
import { normalizeSheetDrawings } from "@sheetcraft/core/sheet-drawings";
import SheetShapeCreationLayer from "../../../modules/sheet-drawings/components/SheetShapeCreationLayer.vue";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import {
  createMemoryImageAssetStore,
  type ImageAssetStore,
} from "../../../modules/image-assets/imageAssetStore";
import * as imagePainter from "../../../modules/sheet-grid/canvas/image-painter";
import { materializeDrawingShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import type { useShapeCreation } from "../../../modules/sheet-drawings/useShapeCreation";
import { SHAPE_GALLERY } from "../../../modules/sheet-drawings/shape-gallery";
import { createAppI18n } from "../../../shared/i18n";
import FreeShapePointSelection from "../../../modules/sheet-drawings/components/FreeShapePointSelection.vue";
import ShapeCanvasTextEditor from "../../../modules/sheet-drawings/components/ShapeCanvasTextEditor.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import * as shapeMeasure from "../../../modules/sheet-drawings/shape-text-measure";
import type { useShapeTextEditSession } from "../../../modules/sheet-drawings/useShapeTextEditSession";
import { actualPng } from "../../modules/image-assets/image-header-fixtures";

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

// Mount the real Workspace and its children: no shape-creation or watch mocks.
function setupState(wrapper: VueWrapper) {
  return (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    shapeCreation: ReturnType<typeof useShapeCreation>;
    shapeTextEdit: ReturnType<typeof useShapeTextEditSession>;
    onSelectSheet: (id: string) => void;
    cellEditSession: { state: { active: boolean; composing: boolean; draft: string } };
    findDialogVisible: boolean;
    cellFormatSelection: unknown;
    shapeInteractionBlocked: boolean;
    sheetGridRef: {
      selectDrawing: (id: string | null) => void;
      selectShapeObjects: (paths: readonly (readonly string[])[]) => boolean;
    };
    undo: () => void;
    redo: () => void;
    drawingActions: ReturnType<
      typeof import("../../../modules/sheet-drawings/useDrawingActions").useDrawingActions
    >;
    shapeGroupFormatPane: ReturnType<
      typeof import("../../../modules/sheet-drawings/useOwnedShapeGroupFormatPane").useOwnedShapeGroupFormatPane
    >;
    shapeConnectorFormatPane: ReturnType<
      typeof import("../../../modules/sheet-drawings/useOwnedShapeConnectorFormatPane").useOwnedShapeConnectorFormatPane
    >;
    shapePaintAssets: ReturnType<
      typeof import("../../../modules/sheet-drawings/shape-paint-asset-source").createShapePaintAssetSource
    >;
    setViewMode: (mode: "page-layout") => void;
    fileActions: ReturnType<
      typeof import("../../../modules/workbook-persistence/useWorkbookFileActions").useWorkbookFileActions
    >;
    xlsxActions: ReturnType<
      typeof import("../../../modules/workbook-xlsx/useWorkbookXlsxActions").useWorkbookXlsxActions
    >;
    session: { workbook: ReturnType<typeof createWorkbook> };
  };
}
function fixture(
  load: () => Promise<
    | undefined
    | { revision: number; savedAt: number; snapshot: ReturnType<typeof serializeWorkbook> }
  >,
  imageAssetStore: ImageAssetStore = createMemoryImageAssetStore(),
  attached = false,
) {
  const wrapper = mount(SpreadsheetWorkspace, {
    ...(attached ? { attachTo: document.body } : {}),
    props: {
      workbookStore: {
        load,
        save: vi.fn(async () => ({ revision: 1, savedAt: 1 })),
        replace: vi.fn(async () => ({ revision: 1, savedAt: 1 })),
      },
      imageAssetStore,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe("Workspace shape startup", () => {
  test("initializes the real shape watch before persistence resolves and keeps all busy gates", async () => {
    let finishLoad!: (value: undefined) => void;
    const wrapper = fixture(
      () =>
        new Promise<undefined>((resolve) => {
          finishLoad = resolve;
        }),
    );
    const state = setupState(wrapper);
    const choice = SHAPE_GALLERY[0]!.items[0]!;
    expect(state.shapeCreation.start(choice, false)).toBe(false);
    expect(state.shapeCreation.request.value).toBeUndefined();
    await flushPromises();
    finishLoad(undefined);
    await flushPromises();
    expect(state.shapeCreation.start(choice, false)).toBe(true);
    expect(state.shapeCreation.request.value?.choice).toBe(choice);
    let rejectJson!: (error: Error) => void;
    const jsonPending = state.fileActions.importJson({
      text: () =>
        new Promise<string>((_, reject) => {
          rejectJson = reject;
        }),
    });
    expect(state.shapeCreation.request.value).toBeUndefined();
    expect(state.shapeCreation.start(choice, false)).toBe(false);
    rejectJson(new Error("Synthetic read cancelled"));
    await jsonPending;
    expect(state.shapeCreation.start(choice, false)).toBe(true);
    let rejectBytes!: (error: Error) => void;
    const xlsxPending = state.xlsxActions.importXlsx({
      size: 1,
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((_, reject) => {
          rejectBytes = reject;
        }),
    });
    expect(state.shapeCreation.request.value).toBeUndefined();
    expect(state.shapeCreation.start(choice, false)).toBe(false);
    rejectBytes(new Error("Synthetic read cancelled"));
    await xlsxPending;
    expect(state.shapeCreation.start(choice, false)).toBe(true);
    state.shapeInteractionBlocked = true;
    expect(state.shapeCreation.request.value).toBeUndefined();
    expect(state.shapeCreation.start(choice, false)).toBe(false);
    state.shapeInteractionBlocked = false;
    expect(state.shapeCreation.start(choice, false)).toBe(true);
    state.shapeCreation.cancel();
    expect(getActiveSheet(state.session.workbook).drawings ?? []).toEqual([]);
  });
  test("starts from a saved workbook and creates a shape through the real command port", async () => {
    const workbook = createWorkbook({ id: "startup", sheetId: "startup-sheet" });
    const wrapper = fixture(async () => ({
      revision: 1,
      savedAt: 1,
      snapshot: serializeWorkbook(workbook),
    }));
    await flushPromises();
    const state = setupState(wrapper);
    const choice = SHAPE_GALLERY[0]!.items[0]!;
    expect(state.shapeCreation.start(choice, false)).toBe(true);
    const request = state.shapeCreation.request.value!;
    expect(
      state.shapeCreation.commit(request, {
        ...request.base,
        shapeGeometry: { preset: "line" },
        width: 100,
        height: 50,
      }),
    ).toBe(true);
    expect(getActiveSheet(state.session.workbook).drawings).toHaveLength(1);
    expect(state.shapeCreation.request.value).toBeUndefined();
  });
  test("real Workspace page-layout creation receives shape metrics and commits a source-free frame", async () => {
    const wrapper = fixture(async () => undefined);
    await flushPromises();
    const state = setupState(wrapper);
    state.setViewMode("page-layout");
    await flushPromises();
    const choice = SHAPE_GALLERY.flatMap((group) => group.items).find(
      (item) => item.kind === "preset" && item.preset === "rect",
    )!;
    expect(state.shapeCreation.start(choice, false)).toBe(true);
    await flushPromises();
    const layer = wrapper.getComponent(SheetShapeCreationLayer);
    expect(layer.props("metrics")).toBeDefined();
    expect(layer.props("pageProjection")).toBeDefined();
    const request = state.shapeCreation.request.value!;
    expect(
      state.shapeCreation.commit(request, {
        ...request.base,
        anchor: { row: 1, column: 1 },
        offsetX: 12,
        offsetY: 5,
        width: 100,
        height: 50,
        shapeGeometry: { preset: "rect" },
      }),
    ).toBe(true);
    const source = getActiveSheet(state.session.workbook).drawings?.[0];
    expect(isFramedShapeDrawing(source!)).toBe(true);
    expect(serializeWorkbook(state.session.workbook).version).toBe(60);
  });
});

test("saved group starts in real Workspace and its collection command port performs genuine Ungroup", async () => {
  const workbook = createWorkbook({ id: "saved-group", sheetId: "group-sheet" });
  const sheet = getActiveSheet(workbook);
  const a = framedShape();
  a.id = "a";
  a.text = "";
  a.rotation = 0;
  a.shapeGeometry = { preset: "rect" };
  const b = framedShape();
  b.id = "b";
  b.text = "";
  b.rotation = 0;
  b.shapeGeometry = { preset: "rect" };
  b.shapeFrame.anchor = { mode: "fixed", x: 350, y: 50, size: { width: 100, height: 70 } };
  sheet.drawings = groupShapeRoots(
    [a, b],
    ["a", "b"],
    { id: "group", name: "Group" },
    createPictureSheetMetrics(sheet),
  );
  const snapshot = serializeWorkbook(workbook);
  expect(snapshot.version).toBe(61);
  const wrapper = fixture(async () => ({ revision: 1, savedAt: 1, snapshot }));
  await flushPromises();
  const state = setupState(wrapper),
    current = getActiveSheet(state.session.workbook);
  expect(isShapeGroupDrawing(current.drawings![0])).toBe(true);
  const layer = wrapper.getComponent(SheetDrawingLayer);
  expect(layer.findAll("[data-sheet-drawing-id]")).toHaveLength(2);
  const expected = layer.props("drawings"),
    metrics = layer.props("metrics");
  const root = expected[0]!;
  if (!isShapeGroupDrawing(root)) throw new Error("Expected persisted group.");
  layer.vm.$emit("formatGroup", root, [root.id]);
  await flushPromises();
  expect(state.shapeGroupFormatPane.root.value).toBe(root);
  const pane = wrapper.getComponent(ShapeFormatPane);
  expect(pane.props("snapshot")?.drawing).toBe(root);
  expect(pane.props("snapshot")?.scopeDescription).toContain("2");
  expect(pane.props("snapshot")?.drawing).not.toHaveProperty("text");
  state.shapeGroupFormatPane.close();
  await flushPromises();
  const next = ungroupShapeRoot(expected, "group", metrics!);
  expect(layer.props("applyCollection")!(next, expected, metrics!)).toBe(true);
  await flushPromises();
  expect(getActiveSheet(state.session.workbook).drawings!.map((d) => d.id)).toEqual(["a", "b"]);
  expect(serializeWorkbook(state.session.workbook).version).toBe(60);
});

test("opening a nested pane warms sibling glyph assets required by whole-root preflight without changing edit scope", async () => {
  const createCache = imagePainter.createCanvasImageCache;
  const caches: ReturnType<typeof createCache>[] = [];
  vi.spyOn(imagePainter, "createCanvasImageCache").mockImplementation((onChange) => {
    const cache = createCache(onChange);
    const observed = { ...cache, get: vi.fn(cache.get), retain: vi.fn(cache.retain) };
    caches.push(observed);
    return observed;
  });
  const workbook = createWorkbook({ id: "saved-texture", sheetId: "texture-sheet" });
  const sheet = getActiveSheet(workbook),
    a = framedShape(),
    b = framedShape();
  a.id = "a";
  b.id = "b";
  a.text = "Glyph";
  b.text = "";
  const text = materializeDrawingShapeText({
    ...a,
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 100,
    height: 60,
  });
  text.style = {
    fill: {
      kind: "value",
      value: {
        kind: "picture",
        assetId: "glyph",
        opacity: 1,
        rotateWithShape: true,
        layout: {
          kind: "stretch",
          offsetXRatio: 0,
          offsetYRatio: 0,
          widthRatio: 1,
          heightRatio: 1,
        },
      },
    },
  };
  a.shapeText = text;
  b.shapeFrame.anchor = { mode: "fixed", x: 350, y: 30, size: { width: 100, height: 60 } };
  const c = framedShape();
  c.id = "c";
  c.text = "";
  const inner = groupShapeRoots(
    [b, c],
    ["b", "c"],
    { id: "inner", name: "Inner" },
    createPictureSheetMetrics(sheet),
  )[0]!;
  sheet.drawings = groupShapeRoots(
    [a, inner],
    ["a", "inner"],
    { id: "group", name: "Group" },
    createPictureSheetMetrics(sheet),
  );
  const assets = createMemoryImageAssetStore();
  await assets.put({
    id: "glyph",
    width: 1,
    height: 1,
    mimeType: "image/png",
    blob: new Blob(
      [
        Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
          ),
          (ch) => ch.charCodeAt(0),
        ),
      ],
      { type: "image/png" },
    ),
  });
  const wrapper = fixture(
    async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
    assets,
  );
  await flushPromises();
  const cache = caches[0]!;
  expect(cache.get).not.toHaveBeenCalled();
  const layer = wrapper.getComponent(SheetDrawingLayer),
    root = layer.props("drawings")[0]!;
  if (!isShapeGroupDrawing(root)) throw new Error("Expected texture group.");
  expect(setupState(wrapper).shapeGroupFormatPane.open(root, [root.id, "inner"])).toBe(true);
  await flushPromises();
  expect(wrapper.getComponent(ShapeFormatPane).props("snapshot")?.drawing.id).toBe("inner");
  expect(cache.get).toHaveBeenCalledWith(expect.stringMatching(/^blob:/));
  const url = vi.mocked(cache.get).mock.calls[0]![0];
  expect(cache.retain).toHaveBeenLastCalledWith(new Set([url]));
  setupState(wrapper).shapeGroupFormatPane.close();
  await flushPromises();
  expect(cache.retain).toHaveBeenLastCalledWith(new Set());
});

test("snapshot62 container Shadow starts the real Workspace and the pane clears only its owner effect", async () => {
  const workbook = createWorkbook({ id: "group-shadow-startup", sheetId: "shadow-sheet" });
  const sheet = getActiveSheet(workbook),
    a = framedShape(),
    b = framedShape();
  a.id = "a";
  b.id = "b";
  a.text = b.text = "";
  a.rotation = b.rotation = 0;
  a.shapeGeometry = b.shapeGeometry = { preset: "rect" };
  b.shapeFrame.anchor = { mode: "fixed", x: 350, y: 30, size: { width: 100, height: 60 } };
  const roots = groupShapeRoots(
    [a, b],
    ["a", "b"],
    { id: "group", name: "Group" },
    createPictureSheetMetrics(sheet),
  );
  const group = roots[0]!;
  if (!isShapeGroupDrawing(group)) throw Error("Expected actual group");
  group.groupEffects = {
    shadow: {
      kind: "value",
      value: {
        kind: "outer",
        color: { kind: "rgb", rgb: "#000000" },
        opacity: 0.6,
        blurPt: 4,
        distancePt: 3,
        angleDeg: 45,
        scale: 1,
        anchor: "center",
      },
    },
  };
  sheet.drawings = roots;
  const snapshot = serializeWorkbook(workbook);
  expect(snapshot.version).toBe(62);
  const wrapper = fixture(async () => ({ revision: 1, savedAt: 1, snapshot }));
  await flushPromises();
  const state = setupState(wrapper),
    current = getActiveSheet(state.session.workbook);
  const owner = current.drawings![0]!;
  if (!isShapeGroupDrawing(owner)) throw Error("Expected restored owner");
  expect(serializeWorkbook(state.session.workbook)).toEqual(snapshot);
  const layer = wrapper.getComponent(SheetDrawingLayer);
  expect(layer.findAll('[data-shape-group-paint="group"]')).toHaveLength(1);
  layer.vm.$emit("formatGroup", owner, [owner.id]);
  await flushPromises();
  const pane = wrapper.getComponent(ShapeFormatPane),
    control = state.shapeGroupFormatPane;
  expect(pane.props("snapshot")?.drawing).toBe(owner);
  expect(control.capabilities.value.styles?.shape?.shadow?.enabled).toBe(true);
  const beforeLeaves = JSON.parse(JSON.stringify(owner.members));
  const selection = control.snapshot.value!;
  expect(
    control.onIntent({
      type: "set-style",
      target: "shape",
      category: "shadow",
      value: { kind: "none" },
      owner: selection.owner,
      baseRevision: selection.revision,
      intentId: "startup-clear-group-shadow",
    }),
  ).toBe(true);
  await flushPromises();
  const updated = current.drawings![0]!;
  expect(updated).toHaveProperty("groupEffects.shadow.kind", "none");
  if (!isShapeGroupDrawing(updated)) throw Error("Expected owner retained");
  expect(updated.members).toEqual(beforeLeaves);
  expect(layer.findAll('[data-shape-group-paint="group"]')).toHaveLength(0);
  expect(serializeWorkbook(state.session.workbook).version).toBe(62);
});

function savedConnectorFixture(group = false, preset: "line" | "bentConnector3" = "line") {
  const workbook = createWorkbook({ id: "saved-bindings", sheetId: "binding-sheet" });
  const sheet = getActiveSheet(workbook),
    a = framedShape(),
    b = framedShape(),
    connector = framedShape();
  a.id = "a";
  b.id = "b";
  connector.id = "connector";
  a.text = b.text = connector.text = "";
  a.rotation = b.rotation = connector.rotation = 0;
  a.shapeGeometry = { preset: "rect" };
  b.shapeGeometry = { preset: "ellipse" };
  connector.shapeGeometry = { preset };
  a.shapeFrame.anchor = { mode: "fixed", x: 80, y: 40, size: { width: 80, height: 60 } };
  b.shapeFrame.anchor = { mode: "fixed", x: 280, y: 180, size: { width: 80, height: 60 } };
  connector.shapeFrame.anchor = { mode: "fixed", x: 30, y: 25, size: { width: 80, height: 70 } };
  connector.shapeConnector = {
    kind: "shape-connector-v1",
    begin: { kind: "site", targetId: "a", preset: "rect", siteIndex: 3 },
    end: { kind: "site", targetId: "b", preset: "ellipse", siteIndex: 0 },
  };
  sheet.drawings = [a, b, connector];
  if (group)
    sheet.drawings = groupShapeRoots(
      sheet.drawings,
      ["a", "connector"],
      { id: "group", name: "Group" },
      createPictureSheetMetrics(sheet),
    );
  return workbook;
}
test("snapshot65 group effects and connected group endpoint formatting use the real Workspace startup and history", async () => {
  const initial = savedConnectorFixture(true, "bentConnector3");
  const initialSheet = getActiveSheet(initial),
    owner = initialSheet.drawings!.find((item) => item.id === "group")!;
  if (!isShapeGroupDrawing(owner)) throw Error("Expected real group");
  owner.groupEffects = { reflection: { kind: "none" }, glow: { kind: "none" } };
  const snapshot = serializeWorkbook(initial);
  expect(snapshot.version).toBe(65);
  const wrapper = fixture(async () => ({ revision: 1, savedAt: 1, snapshot }));
  await flushPromises();
  const state = setupState(wrapper),
    sheet = getActiveSheet(state.session.workbook),
    root = sheet.drawings!.find((item) => item.id === "group")!;
  if (!isShapeGroupDrawing(root)) throw Error("Expected owner retained");
  expect(state.shapeGroupFormatPane.open(root)).toBe(true);
  const control = state.shapeGroupFormatPane;
  expect(control.capabilities.value.styles?.shape?.reflection?.enabled).toBe(true);
  expect(control.capabilities.value.styles?.shape?.glow?.enabled).toBe(true);
  expect(control.capabilities.value.lineEnds?.enabled).toBe(true);
  await nextTick();
  const pane = wrapper.getComponent(ShapeFormatPane),
    ends = pane.getComponent(ShapeLineEndsControls);
  expect(ends.props("disabled")).toBe(false);
  const before = serializeWorkbook(state.session.workbook);
  expect(ends.props("endpointHandler")!("end", { kind: "diamond" })).toBe(true);
  await flushPromises();
  const after = serializeWorkbook(state.session.workbook);
  expect(after).not.toEqual(before);
  const pass = resolveSheetShapeConnections(
    sheet.drawings!,
    wrapper.getComponent(SheetDrawingLayer).props("metrics")!,
  );
  const binding = pass.getConnector("connector")!;
  expect(binding.begin).toMatchObject({
    status: "ready",
    kind: "site",
    targetId: "a",
    identity: { preset: "rect", index: 3 },
  });
  expect(binding.end).toMatchObject({
    status: "ready",
    kind: "site",
    targetId: "b",
    identity: { preset: "ellipse", index: 0 },
  });
  const appliedRoot = sheet.drawings!.find((item) => item.id === "group")!;
  expect(appliedRoot).toHaveProperty("groupEffects", {
    reflection: { kind: "none" },
    glow: { kind: "none" },
  });
  if (!isShapeGroupDrawing(appliedRoot)) throw Error("Expected group retained");
  const connector = appliedRoot.members.find((item) => item.id === "connector");
  expect(connector).toHaveProperty("shapeConnector", {
    kind: "shape-connector-v1",
    begin: { kind: "site", targetId: "a", preset: "rect", siteIndex: 3 },
    end: { kind: "site", targetId: "b", preset: "ellipse", siteIndex: 0 },
  });
  state.undo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
  state.redo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(after);
});

function connectorInput(
  layer: {
    props: () => {
      layout: import("@sheetcraft/sheet-engine/viewport-layout").SheetViewportLayout;
      scale: number;
    };
    element: Element;
  },
  type: string,
  world: { x: number; y: number },
) {
  const layout = layer.props().layout,
    scale = layer.props().scale,
    translation = getPicturePaneTranslation("body", layout),
    box = layer.element.getBoundingClientRect();
  const input = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: box.left + (world.x + translation.x) * scale,
    clientY: box.top + (world.y + translation.y) * scale,
  });
  Object.defineProperty(input, "pointerId", { value: 73 });
  return input;
}
test.each([false, true])(
  "saved snapshot63 starts real Workspace; actual connector body drag, exact Undo and target Delete commit (owned=%s)",
  async (group) => {
    const initial = savedConnectorFixture(group),
      snapshot = serializeWorkbook(initial);
    expect(snapshot.version).toBe(63);
    const wrapper = fixture(async () => ({ revision: 1, savedAt: 1, snapshot }));
    await flushPromises();
    const state = setupState(wrapper),
      sheet = getActiveSheet(state.session.workbook);
    expect(sheet.id).toBe("binding-sheet");
    const layer = wrapper.getComponent(SheetDrawingLayer);
    const route = () => {
      const connection = resolveSheetShapeConnections(
        sheet.drawings!,
        layer.props("metrics")!,
      ).getConnector("connector")!;
      if (connection.status !== "ready" || connection.route.status !== "ready")
        throw Error("Expected exact visible route");
      return connection.route;
    };
    const before = serializeWorkbook(state.session.workbook),
      original = route();
    const commands = original.geometry.paths[0]!.commands,
      m = commands[0]!,
      l = commands[1]!;
    if (m[0] !== "M" || l[0] !== "L") throw Error("Expected ordered line");
    const origin = shapeFrameLocalToWorld(
      original.paintLayout.rect,
      original.paintLayout.angleDeg,
      { x: (m[1] + l[1]) / 2, y: (m[2] + l[2]) / 2 },
    );
    const object = layer.get('[data-sheet-drawing-id="connector"]').element;
    // First click selects a root. A second stationary click enters its owned member.
    object.dispatchEvent(connectorInput(layer, "pointerdown", origin));
    window.dispatchEvent(connectorInput(layer, "pointerup", origin));
    await nextTick();
    if (group) {
      object.dispatchEvent(connectorInput(layer, "pointerdown", origin));
      window.dispatchEvent(connectorInput(layer, "pointerup", origin));
      await nextTick();
      expect(layer.findAll("[data-shape-endpoint]")).toHaveLength(2);
    }
    object.dispatchEvent(connectorInput(layer, "pointerdown", origin));
    const destination = { x: origin.x + 30, y: origin.y + 20 };
    window.dispatchEvent(connectorInput(layer, "pointermove", destination));
    window.dispatchEvent(connectorInput(layer, "pointerup", destination));
    await flushPromises();
    const changed = serializeWorkbook(state.session.workbook);
    expect(changed).not.toEqual(before);
    const next = resolveSheetShapeConnections(
      sheet.drawings!,
      layer.props("metrics")!,
    ).getConnector("connector")!;
    expect(next.begin.kind).toBe("free");
    expect(next.end.kind).toBe("free");
    expect(route().begin.x).toBeCloseTo(original.begin.x + 30, 9);
    expect(route().begin.y).toBeCloseTo(original.begin.y + 20, 9);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(changed);
    state.undo();
    await flushPromises();
    // Single-root Delete also materializes a surviving connector's removed target.
    expect(state.drawingActions.remove("b")).toBe(true);
    await flushPromises();
    expect(sheet.drawings!.some((drawing) => drawing.id === "b")).toBe(false);
    const detached = resolveSheetShapeConnections(
      sheet.drawings!,
      layer.props("metrics")!,
    ).getConnector("connector")!;
    expect(detached.begin.kind).toBe("site");
    expect(detached.end.kind).toBe("free");
    expect(route().end.x).toBeCloseTo(original.end.x, 9);
    expect(route().end.y).toBeCloseTo(original.end.y, 9);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
  },
);

test.each([false, true])(
  "real Workspace connector format opens its canonical owner, commits arrowheads and restores exact history (owned=%s)",
  async (group) => {
    const initial = savedConnectorFixture(group),
      snapshot = serializeWorkbook(initial);
    const wrapper = fixture(async () => ({ revision: 1, savedAt: 1, snapshot }));
    await flushPromises();
    const state = setupState(wrapper),
      sheet = getActiveSheet(state.session.workbook),
      layer = wrapper.getComponent(SheetDrawingLayer),
      connection = resolveSheetShapeConnections(
        sheet.drawings!,
        layer.props("metrics")!,
      ).getConnector("connector")!;
    if (connection.status !== "ready" || connection.route.status !== "ready")
      throw Error("Expected exact visible connector");
    const route = connection.route,
      commands = route.geometry.paths[0]!.commands,
      first = commands[0]!,
      last = commands[1]!;
    if (first[0] !== "M" || last[0] !== "L") throw Error("Expected ordered line");
    const origin = shapeFrameLocalToWorld(route.paintLayout.rect, route.paintLayout.angleDeg, {
      x: (first[1] + last[1]) / 2,
      y: (first[2] + last[2]) / 2,
    });
    const object = layer.get('[data-sheet-drawing-id="connector"]').element;
    for (let count = 0; count < (group ? 2 : 1); count++) {
      object.dispatchEvent(connectorInput(layer, "pointerdown", origin));
      window.dispatchEvent(connectorInput(layer, "pointerup", origin));
      await nextTick();
    }
    await layer.get("[data-shape-format-trigger]").trigger("click");
    await flushPromises();
    const pane = wrapper.getComponent(ShapeFormatPane),
      control = state.shapeConnectorFormatPane,
      canonical = control.drawing.value!;
    expect(canonical.id).toBe("connector");
    expect(pane.props("snapshot")?.drawing).toBe(canonical);
    expect(pane.find("[data-shape-connector-size-limit]").text()).toContain("endpoint span");
    expect(pane.find("[data-shape-format-units]").exists()).toBe(true);
    expect(pane.findAll(".shape-format-pane__modes button")).toHaveLength(1);
    expect(pane.find('[id$="-text-box-panel"]').exists()).toBe(false);
    const before = serializeWorkbook(state.session.workbook);
    const tabs = pane.findAll('[role="tab"]');
    await tabs[0]!.trigger("click");
    const ends = pane.getComponent(ShapeLineEndsControls),
      selects = ends.findAllComponents(TSelect),
      obsolete = ends.props("handler");
    expect(ends.props("disabled")).toBe(false);
    selects[1]!.vm.$emit("change", "triangle");
    await flushPromises();
    await pane.get('[data-line-end-size="end-large-small"]').trigger("click");
    await flushPromises();
    const updated = control.drawing.value!,
      changed = serializeWorkbook(state.session.workbook);
    expect(updated.shapeLineEnds?.end).toEqual({
      kind: "triangle",
      width: "large",
      length: "small",
    });
    expect(updated.shapeConnector).toEqual(canonical.shapeConnector);
    expect(updated.rotation).toBe(canonical.rotation);
    expect("groupFrame" in updated ? updated.groupFrame : updated.shapeFrame).toEqual(
      "groupFrame" in canonical ? canonical.groupFrame : canonical.shapeFrame,
    );
    const proof = resolveSheetShapeConnections(
      sheet.drawings!,
      layer.props("metrics")!,
    ).getConnector("connector")!;
    expect(proof.begin).toEqual(connection.begin);
    expect(proof.end).toEqual(connection.end);
    state.undo();
    await flushPromises();
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    state.redo();
    await flushPromises();
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(changed);
    expect(obsolete({ begin: { kind: "diamond" } })).toBe(false);
    expect(serializeWorkbook(state.session.workbook)).toEqual(changed);
  },
);

test.each([false, true])(
  "real Workspace connector explicit disconnect and numeric fields preserve geometry, owned identity and reversible binding (owned=%s)",
  async (group) => {
    const initial = savedConnectorFixture(group),
      initialSnapshot = serializeWorkbook(initial);
    const wrapper = fixture(async () => ({ revision: 1, savedAt: 1, snapshot: initialSnapshot }));
    await flushPromises();
    const state = setupState(wrapper),
      sheet = getActiveSheet(state.session.workbook),
      layer = wrapper.getComponent(SheetDrawingLayer);
    const original = resolveSheetShapeConnections(
      sheet.drawings!,
      layer.props("metrics")!,
    ).getConnector("connector")!;
    if (
      original.status !== "ready" ||
      original.begin.status !== "ready" ||
      original.end.status !== "ready"
    )
      throw Error("Expected ready original tips");
    const middle = {
      x: (original.begin.position.x + original.end.position.x) / 2,
      y: (original.begin.position.y + original.end.position.y) / 2,
    };
    const object = layer.get('[data-sheet-drawing-id="connector"]').element;
    for (let count = 0; count < (group ? 2 : 1); count++) {
      object.dispatchEvent(connectorInput(layer, "pointerdown", middle));
      window.dispatchEvent(connectorInput(layer, "pointerup", middle));
      await nextTick();
    }
    await layer.get("[data-shape-format-trigger]").trigger("click");
    await flushPromises();
    const pane = wrapper.getComponent(ShapeFormatPane),
      control = state.shapeConnectorFormatPane;
    const before = serializeWorkbook(state.session.workbook),
      source = control.drawing.value!,
      path = control.path.value!;
    const numeric = (field: "sizeWidthPt" | "rotationDeg" | "scaleWidthPercent") =>
      pane
        .findAllComponents(ShapeFormatNumberField)
        .find((c) => c.props("field") === field)!
        .getComponent(PicturePaintNumber);
    expect(pane.get("[data-shape-connector-bindings]").findAll("li")).toHaveLength(2);
    expect(numeric("sizeWidthPt").props("disabled")).toBe(true);
    expect(numeric("rotationDeg").props("disabled")).toBe(true);
    const actualWidth = Math.abs(original.end.position.x - original.begin.position.x) * 0.75;
    expect(control.snapshot.value!.values.sizeWidthPt).toBeCloseTo(actualWidth, 9);
    await pane.get("[data-shape-connector-disconnect]").trigger("click");
    await flushPromises();
    expect(control.drawing.value!.shapeConnector!.begin.kind).toBe("free");
    expect(control.drawing.value!.shapeConnector!.end.kind).toBe("free");
    expect(control.path.value).toEqual(path);
    expect(numeric("sizeWidthPt").props("disabled")).toBe(false);
    const detached = serializeWorkbook(state.session.workbook);
    const widthInput = numeric("sizeWidthPt").getComponent(TInput);
    widthInput.vm.$emit("change", String(actualWidth * 1.25));
    widthInput.vm.$emit("enter");
    await flushPromises();
    expect(control.snapshot.value!.values.sizeWidthPt).toBeCloseTo(actualWidth * 1.25, 9);
    expect(control.snapshot.value!.values.scaleWidthPercent).toBeCloseTo(125, 9);
    expect(control.drawing.value!.rotation).toBe(source.rotation);
    expect(
      "groupFrame" in control.drawing.value!
        ? control.drawing.value!.groupFrame
        : control.drawing.value!.shapeFrame,
    ).toEqual("groupFrame" in source ? source.groupFrame : source.shapeFrame);
    const changed = serializeWorkbook(state.session.workbook);
    const current = resolveSheetShapeConnections(
      sheet.drawings!,
      layer.props("metrics")!,
    ).getConnector("connector")!;
    expect(current.begin).toMatchObject({ status: "ready", position: original.begin.position });
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(detached);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    expect(control.drawing.value!.shapeConnector).toEqual(source.shapeConnector);
    state.redo();
    await flushPromises();
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(changed);
  },
);

test.each([false, true])(
  "real Workspace yellow route drag commits only adjustments with exact Undo/Redo (owned=%s)",
  async (group) => {
    const initial = savedConnectorFixture(group, "bentConnector3"),
      snapshot = serializeWorkbook(initial);
    const wrapper = fixture(async () => ({ revision: 1, savedAt: 1, snapshot }));
    await flushPromises();
    const state = setupState(wrapper),
      sheet = getActiveSheet(state.session.workbook),
      layer = wrapper.getComponent(SheetDrawingLayer);
    const resolve = () => {
      const value = resolveSheetShapeConnections(
        sheet.drawings!,
        layer.props("metrics")!,
      ).getConnector("connector")!;
      if (value.status !== "ready" || value.route.status !== "ready") throw Error("Expected route");
      return value.route;
    };
    const route = resolve(),
      handle = shapeFrameLocalToWorld(
        route.paintLayout.rect,
        route.paintLayout.angleDeg,
        route.geometry.handles[0]!.position,
      ),
      object = layer.get('[data-sheet-drawing-id="connector"]').element;
    for (let count = 0; count < (group ? 2 : 1); count++) {
      object.dispatchEvent(connectorInput(layer, "pointerdown", handle));
      window.dispatchEvent(connectorInput(layer, "pointerup", handle));
      await nextTick();
    }
    const before = serializeWorkbook(state.session.workbook),
      destination = { x: handle.x + 30, y: handle.y + 20 };
    layer
      .get('[data-shape-adjustment="0"]')
      .element.dispatchEvent(connectorInput(layer, "pointerdown", handle));
    window.dispatchEvent(connectorInput(layer, "pointermove", destination));
    await nextTick();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    window.dispatchEvent(connectorInput(layer, "pointerup", destination));
    await flushPromises();
    const after = serializeWorkbook(state.session.workbook),
      changed = resolve();
    expect(after).not.toEqual(before);
    expect(changed.begin).toEqual(route.begin);
    expect(changed.end).toEqual(route.end);
    expect(changed.geometry.paths).not.toEqual(route.geometry.paths);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(after);
  },
);

test.each([false, true])(
  "real Workspace refuses a yellow route exceeding actual dash paint budget with no document or history changes (owned=%s)",
  async (group) => {
    const initial = savedConnectorFixture(group, "bentConnector3"),
      initialSheet = getActiveSheet(initial);
    const source = group
      ? initialSheet
          .drawings!.find((d) => d.kind === "shapeGroup")!
          .members.find((d) => d.id === "connector")!
      : initialSheet.drawings!.find((d) => d.id === "connector")!;
    if (source.kind !== "shape") throw Error("Expected connector");
    source.shapeStyle = {
      line: {
        kind: "value",
        value: {
          paint: { kind: "solid", color: { kind: "rgb", rgb: "#000000" }, opacity: 1 },
          widthPt: 0.01,
          compound: "single",
          dash: "dash",
          cap: "butt",
          join: "round",
          miterLimit: 4,
        },
      },
    };
    const snapshot = serializeWorkbook(initial),
      wrapper = fixture(async () => ({ revision: 1, savedAt: 1, snapshot }));
    await flushPromises();
    const state = setupState(wrapper),
      sheet = getActiveSheet(state.session.workbook),
      layer = wrapper.getComponent(SheetDrawingLayer),
      connection = resolveSheetShapeConnections(
        sheet.drawings!,
        layer.props("metrics")!,
      ).getConnector("connector")!;
    if (connection.status !== "ready" || connection.route.status !== "ready")
      throw Error("Expected route");
    const route = connection.route,
      handle = shapeFrameLocalToWorld(
        route.paintLayout.rect,
        route.paintLayout.angleDeg,
        route.geometry.handles[0]!.position,
      );
    const before = serializeWorkbook(state.session.workbook),
      destination = { x: handle.x + 500, y: handle.y };
    const next = planShapeConnectorRouteAdjustment(
      sheet.drawings!,
      {
        connectorId: "connector",
        path: group ? ["group", "connector"] : ["connector"],
      },
      0,
      destination,
      layer.props("metrics")!,
    );
    expect(
      state.drawingActions.replaceCollection(next, sheet.drawings!, layer.props("metrics")!),
    ).toBe(false);
    // Even when only a target changes, the final route of an unchanged connector must be checked.
    const movedTarget = normalizeSheetDrawings(sheet.drawings!);
    const target = movedTarget.find((d) => d.id === "b")!;
    if (!isFramedShapeDrawing(target)) throw Error("Expected framed target");
    target.shapeFrame.anchor = { mode: "fixed", x: 5000, y: 180, size: { width: 80, height: 60 } };
    expect(
      state.drawingActions.replaceCollection(movedTarget, sheet.drawings!, layer.props("metrics")!),
    ).toBe(false);
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
  },
);

test.each([false, true])(
  "real Workspace can first-reference an explicitly prepared connector texture before workbook URL metadata publishes (owned=%s)",
  async (group) => {
    const assets = createMemoryImageAssetStore();
    await assets.put({
      id: "new-route-texture",
      width: 8,
      height: 4,
      mimeType: "image/png",
      blob: new Blob([actualPng], { type: "image/png" }),
    });
    const initial = savedConnectorFixture(group, "bentConnector3"),
      wrapper = fixture(
        async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(initial) }),
        assets,
      );
    await flushPromises();
    const state = setupState(wrapper),
      sheet = getActiveSheet(state.session.workbook),
      layer = wrapper.getComponent(SheetDrawingLayer),
      next = normalizeSheetDrawings(sheet.drawings!);
    const root = next.find((d) => d.id === (group ? "group" : "connector"))!;
    const source = isShapeGroupDrawing(root)
      ? root.members.find((d) => d.id === "connector")!
      : root;
    if (source.kind !== "shape") throw Error("Expected connector");
    // HappyDOM has no pixel decoder. Supply only the already prepared native image
    // metadata; initialization, final planner, command and history stay genuine.
    vi.spyOn(state.shapePaintAssets, "getAssetImage").mockImplementation((id) =>
      id === "new-route-texture"
        ? ({ naturalWidth: 8, naturalHeight: 4 } as HTMLImageElement)
        : undefined,
    );
    source.shapeStyle = {
      line: {
        kind: "value",
        value: {
          paint: {
            kind: "picture",
            assetId: "new-route-texture",
            opacity: 1,
            rotateWithShape: true,
            layout: {
              kind: "stretch",
              offsetXRatio: 0,
              offsetYRatio: 0,
              widthRatio: 1,
              heightRatio: 1,
            },
          },
          widthPt: 2,
          compound: "single",
          dash: "solid",
          cap: "butt",
          join: "round",
          miterLimit: 4,
        },
      },
    };
    const before = serializeWorkbook(state.session.workbook);
    expect(
      state.drawingActions.replaceCollection(next, sheet.drawings!, layer.props("metrics")!),
    ).toBe(true);
    const after = serializeWorkbook(state.session.workbook);
    expect(after).not.toEqual(before);
    await flushPromises();
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(after);
  },
);

function directTextWorkbook(owned: boolean) {
  const workbook = createWorkbook({ id: "direct-text", sheetId: "text-sheet" }),
    sheet = getActiveSheet(workbook),
    a = framedShape(),
    b = framedShape();
  a.id = "text-target";
  a.text = "Original";
  a.rotation = 37;
  a.shapeGeometry = { preset: "rect" };
  b.id = "untouched";
  b.text = "Sibling";
  b.shapeFrame.anchor = { mode: "fixed", x: 350, y: 60, size: { width: 100, height: 80 } };
  sheet.drawings = owned
    ? groupShapeRoots(
        [a, b],
        [a.id, b.id],
        { id: "text-group", name: "Text group" },
        createPictureSheetMetrics(sheet),
      )
    : [a, b];
  return workbook;
}
function installNativeTextMeasurement() {
  // Supply only native glyph metrics absent from HappyDOM. Initialization,
  // real layout/AutoFit, exact collection commands and history remain genuine.
  vi.spyOn(shapeMeasure, "getBrowserShapeTextMeasurement").mockReturnValue({
    measurer: {
      measure: (text) => Array.from(text).length * 10,
      measureMetrics: (text) => ({
        width: Array.from(text).length * 10,
        ascent: 15,
        descent: 5,
        inkLeft: 0,
        inkRight: Array.from(text).length * 10,
      }),
    },
    resolveNormalLineMetrics: () => ({
      metrics: { ascent: 15, descent: 5, lineAdvance: 20 },
      policy: "provided-native",
    }),
  });
}
function directSource(state: ReturnType<typeof setupState>) {
  const roots = getActiveSheet(state.session.workbook).drawings!,
    root = roots.find((node) => node.id === "text-group" || node.id === "text-target")!;
  const target = isShapeGroupDrawing(root)
    ? root.members.find((node) => node.id === "text-target")!
    : root;
  if (target.kind !== "shape") throw Error("Expected text shape");
  return target;
}
test.each([false, true])(
  "real Workspace F2 edits canonical inline text, IME, Escape and history (owned=%s)",
  async (owned) => {
    installNativeTextMeasurement();
    const wrapper = fixture(
      async () => ({
        revision: 1,
        savedAt: 1,
        snapshot: serializeWorkbook(directTextWorkbook(owned)),
      }),
      createMemoryImageAssetStore(),
      true,
    );
    await flushPromises();
    const state = setupState(wrapper),
      layer = wrapper.getComponent(SheetDrawingLayer),
      before = serializeWorkbook(state.session.workbook);
    await layer.get('[data-sheet-drawing-id="text-target"]').trigger("keydown", { key: "F2" });
    await flushPromises();
    expect(state.shapeTextEdit.snapshot.value?.sourceId).toBe("text-target");
    const editor = wrapper.getComponent(ShapeCanvasTextEditor),
      input = editor.get("textarea"),
      element = input.element as HTMLTextAreaElement;
    expect(element.selectionStart).toBe(0);
    expect(element.selectionEnd).toBe(8);
    expect(editor.props("frameStyle")?.transform).toBe("rotate(37deg)");
    await input.trigger("compositionstart");
    await input.setValue("新しい\ntext");
    await input.trigger("keydown", { key: "Escape", isComposing: true });
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    expect(wrapper.getComponent(SheetGrid).vm.flushPendingEdit()).toBe(false);
    await input.trigger("compositionend");
    await input.trigger("keydown", { key: "Enter" });
    expect(state.shapeTextEdit.snapshot.value).toBeDefined();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    await input.trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(state.shapeTextEdit.snapshot.value).toBeUndefined();
    expect(directSource(state).text).toBe("新しい\ntext");
    expect(document.activeElement?.getAttribute("data-sheet-drawing-id")).toBe("text-target");
    const after = serializeWorkbook(state.session.workbook);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(after);
  },
);
test("real Workspace typing appends, explicit Cancel keeps history clean, and ancestor shortcuts stay shielded", async () => {
  installNativeTextMeasurement();
  const wrapper = fixture(
    async () => ({
      revision: 1,
      savedAt: 1,
      snapshot: serializeWorkbook(directTextWorkbook(false)),
    }),
    createMemoryImageAssetStore(),
    true,
  );
  await flushPromises();
  const state = setupState(wrapper),
    layer = wrapper.getComponent(SheetDrawingLayer),
    before = serializeWorkbook(state.session.workbook);
  await layer.get('[data-sheet-drawing-id="text-target"]').trigger("keydown", { key: "x" });
  await flushPromises();
  expect(state.shapeTextEdit.snapshot.value?.draftText).toBe("Originalx");
  const input = wrapper.getComponent(ShapeCanvasTextEditor).get("textarea");
  for (const key of ["z", "k", "t", "1", "f", "h", "g"])
    await input.trigger("keydown", { key, ctrlKey: true });
  expect(state.findDialogVisible).toBe(false);
  expect(state.cellFormatSelection).toBeUndefined();
  expect(state.cellEditSession.state.active).toBe(false);
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
  document.querySelector<HTMLElement>('[data-shape-text-action="cancel"]')!.click();
  await flushPromises();
  expect(state.shapeTextEdit.snapshot.value).toBeUndefined();
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
  state.undo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
});
test("real Workspace tab navigation blocks composing text and commits the complete draft before switching", async () => {
  installNativeTextMeasurement();
  const initial = directTextWorkbook(false),
    second = createSheet("Second", "second");
  insertSheet(initial, second);
  const wrapper = fixture(
    async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(initial) }),
    createMemoryImageAssetStore(),
    true,
  );
  await flushPromises();
  const state = setupState(wrapper),
    layer = wrapper.getComponent(SheetDrawingLayer);
  await layer.get('[data-sheet-drawing-id="text-target"]').trigger("keydown", { key: "F2" });
  await flushPromises();
  const input = wrapper.getComponent(ShapeCanvasTextEditor).get("textarea");
  await input.trigger("compositionstart");
  await input.setValue("Final composed text");
  state.onSelectSheet("second");
  await flushPromises();
  expect(getActiveSheet(state.session.workbook).id).toBe("text-sheet");
  expect(state.shapeTextEdit.snapshot.value?.draftText).toBe("Final composed text");
  await input.trigger("compositionend");
  state.onSelectSheet("second");
  await flushPromises();
  expect(getActiveSheet(state.session.workbook).id).toBe("second");
  expect(state.shapeTextEdit.snapshot.value).toBeUndefined();
  const first = state.session.workbook.sheets.get("text-sheet")!;
  const savedTarget = () => {
    const node = first.drawings!.find((value) => value.id === "text-target");
    if (node?.kind !== "shape") throw Error("Expected text target");
    return node.text;
  };
  expect(savedTarget()).toBe("Final composed text");
  state.undo();
  await flushPromises();
  expect(savedTarget()).toBe("Original");
});

test("real Workspace failed native preparation retains the draft and blocks outside ribbon actions until recovery", async () => {
  installNativeTextMeasurement();
  const wrapper = fixture(
    async () => ({
      revision: 1,
      savedAt: 1,
      snapshot: serializeWorkbook(directTextWorkbook(false)),
    }),
    createMemoryImageAssetStore(),
    true,
  );
  await flushPromises();
  const state = setupState(wrapper),
    layer = wrapper.getComponent(SheetDrawingLayer),
    before = serializeWorkbook(state.session.workbook);
  await layer.get('[data-sheet-drawing-id="text-target"]').trigger("keydown", { key: "F2" });
  await flushPromises();
  const input = wrapper.getComponent(ShapeCanvasTextEditor).get("textarea");
  await input.setValue("Retained draft");
  const failure = vi
    .spyOn(shapeMeasure, "getBrowserShapeTextMeasurement")
    .mockImplementation(() => {
      throw Error("Synthetic native metrics unavailable");
    });
  expect(wrapper.getComponent(SheetGrid).vm.hasPendingEdit()).toBe(true);
  expect(wrapper.getComponent(SheetGrid).vm.flushPendingEdit()).toBe(false);
  expect(state.shapeTextEdit.snapshot.value?.draftText).toBe("Retained draft");
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
  const action = document.createElement("button"),
    activate = vi.fn();
  wrapper.get("section.spreadsheet-workspace").element.append(action);
  action.addEventListener("click", activate);
  action.click();
  await flushPromises();
  expect(activate).not.toHaveBeenCalled();
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
  failure.mockRestore();
  installNativeTextMeasurement();
  await input.trigger("keydown", { key: "Escape" });
  await flushPromises();
  expect(directSource(state).text).toBe("Retained draft");
  expect(state.shapeTextEdit.snapshot.value).toBeUndefined();
  state.undo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
});

test("real Workspace outside-cell blur commits without stealing focus; object context menu enters all-text editing", async () => {
  installNativeTextMeasurement();
  const wrapper = fixture(
    async () => ({
      revision: 1,
      savedAt: 1,
      snapshot: serializeWorkbook(directTextWorkbook(false)),
    }),
    createMemoryImageAssetStore(),
    true,
  );
  await flushPromises();
  const state = setupState(wrapper),
    layer = wrapper.getComponent(SheetDrawingLayer);
  await layer
    .get('[data-sheet-drawing-id="text-target"]')
    .trigger("keydown", { key: "ContextMenu" });
  await flushPromises();
  const menu = document.querySelector('[aria-label="Shape actions"]')!;
  const editText = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (element) => element.textContent?.trim() === "Edit Text",
  )!;
  editText.click();
  await flushPromises();
  const input = wrapper.getComponent(ShapeCanvasTextEditor).get("textarea");
  expect((input.element as HTMLTextAreaElement).selectionStart).toBe(0);
  await input.setValue("Outside saved text");
  const outside = document.createElement("input");
  document.body.append(outside);
  outside.focus();
  await input.trigger("focusout", { relatedTarget: outside });
  await flushPromises();
  expect(state.shapeTextEdit.snapshot.value).toBeUndefined();
  expect(directSource(state).text).toBe("Outside saved text");
  expect(document.activeElement).toBe(outside);
});

test("retired canvas toolbar DOM cannot apply or cancel a newer real Workspace text session", async () => {
  installNativeTextMeasurement();
  const wrapper = fixture(
    async () => ({
      revision: 1,
      savedAt: 1,
      snapshot: serializeWorkbook(directTextWorkbook(false)),
    }),
    createMemoryImageAssetStore(),
    true,
  );
  await flushPromises();
  const state = setupState(wrapper),
    layer = wrapper.getComponent(SheetDrawingLayer);
  await layer.get('[data-sheet-drawing-id="text-target"]').trigger("keydown", { key: "F2" });
  await flushPromises();
  const oldCancel = document.querySelector<HTMLElement>('[data-shape-text-action="cancel"]')!,
    oldApply = document.querySelector<HTMLElement>('[data-shape-text-action="apply"]')!;
  oldCancel.click();
  await flushPromises();
  await layer.get('[data-sheet-drawing-id="untouched"]').trigger("keydown", { key: "F2" });
  await flushPromises();
  const current = state.shapeTextEdit.snapshot.value!;
  expect(current.sourceId).toBe("untouched");
  oldApply.click();
  oldCancel.click();
  await flushPromises();
  expect(state.shapeTextEdit.snapshot.value?.sessionId).toBe(current.sessionId);
  expect(state.shapeTextEdit.snapshot.value?.sourceId).toBe("untouched");
  expect(state.shapeTextEdit.snapshot.value?.draftText).toBe("Sibling");
});

test("real Workspace direct text and AutoFit geometry are one reversible transaction", async () => {
  installNativeTextMeasurement();
  const initial = directTextWorkbook(false),
    a = getActiveSheet(initial).drawings![0]!;
  if (!isFramedShapeDrawing(a)) throw Error("Expected framed text target");
  a.shapeText!.layout.autoFit = "resize-shape";
  a.shapeFrame.anchor = { mode: "fixed", x: 80, y: 24, size: { width: 240, height: 30 } };
  const wrapper = fixture(
    async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(initial) }),
    createMemoryImageAssetStore(),
    true,
  );
  await flushPromises();
  const state = setupState(wrapper),
    layer = wrapper.getComponent(SheetDrawingLayer),
    before = serializeWorkbook(state.session.workbook);
  await layer.get('[data-sheet-drawing-id="text-target"]').trigger("keydown", { key: "F2" });
  await flushPromises();
  const input = wrapper.getComponent(ShapeCanvasTextEditor).get("textarea");
  await input.setValue("one\ntwo\nthree\nfour");
  await input.trigger("keydown", { key: "Escape" });
  await flushPromises();
  expect(directSource(state).text).toBe("one\ntwo\nthree\nfour");
  const source = directSource(state);
  expect(source).toHaveProperty("shapeFrame");
  if (!("shapeFrame" in source) || source.shapeFrame.anchor.mode !== "fixed")
    throw Error("Expected fixed frame");
  expect(source.shapeFrame.anchor.size.height).toBeGreaterThan(30);
  const after = serializeWorkbook(state.session.workbook);
  state.undo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
  state.redo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(after);
});

test.each([false, true])(
  "real Workspace Change Shape context restores the genuine gallery and exact root/owned history (owned=%s)",
  async (owned) => {
    installNativeTextMeasurement();
    const wrapper = fixture(
      async () => ({
        revision: 1,
        savedAt: 1,
        snapshot: serializeWorkbook(directTextWorkbook(owned)),
      }),
      createMemoryImageAssetStore(),
      true,
    );
    await flushPromises();
    const state = setupState(wrapper),
      layer = wrapper.getComponent(SheetDrawingLayer),
      before = serializeWorkbook(state.session.workbook),
      original = directSource(state);
    state.sheetGridRef.selectDrawing(owned ? "text-group" : "text-target");
    await flushPromises();
    await layer
      .get('[data-sheet-drawing-id="text-target"]')
      .trigger("keydown", { key: "ContextMenu" });
    await flushPromises();
    const menu = document.querySelector('[aria-label="Shape actions"]')!;
    const action = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.trim() === "Change Shape…",
    );
    expect(action).toBeDefined();
    action!.click();
    await flushPromises();
    expect(state.shapeTextEdit.snapshot.value).toBeUndefined();
    const dialog = wrapper.getComponent(DrawingEditorDialog),
      gallery = dialog.getComponent(ShapeGallery);
    const choice = SHAPE_GALLERY.flatMap((group) => group.items).find(
      (item) => item.kind === "preset" && item.preset === "ellipse",
    )!;
    await gallery.get(`[data-shape-choice="${choice.id}"]`).trigger("click");
    dialog.getComponent(TDialog).vm.$emit("confirm");
    await flushPromises();
    expect(wrapper.findComponent(DrawingEditorDialog).exists()).toBe(false);
    const changed = directSource(state);
    expect(changed.shapeGeometry?.preset).toBe("ellipse");
    expect(changed.text).toBe(original.text);
    expect(changed.rotation).toBe(original.rotation);
    if ("shapeFrame" in changed && "shapeFrame" in original)
      expect(changed.shapeFrame).toEqual(original.shapeFrame);
    else if ("groupFrame" in changed && "groupFrame" in original)
      expect(changed.groupFrame).toEqual(original.groupFrame);
    else throw Error("Expected preserved root frame or owned layout");
    expect(changed.fill).toBe(original.fill);
    const after = serializeWorkbook(state.session.workbook);
    expect(after).not.toEqual(before);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(after);
    // Restoring object properties must not reclaim F2 from inline text editing.
    await layer.get('[data-sheet-drawing-id="text-target"]').trigger("keydown", { key: "F2" });
    await flushPromises();
    expect(state.shapeTextEdit.snapshot.value?.sourceId).toBe("text-target");
    expect(wrapper.findComponent(DrawingEditorDialog).exists()).toBe(false);
  },
);
test("real Workspace Change Shape is disabled for bound connectors and skips group containers", async () => {
  const wrapper = fixture(
    async () => ({
      revision: 1,
      savedAt: 1,
      snapshot: serializeWorkbook(savedConnectorFixture(true)),
    }),
    createMemoryImageAssetStore(),
    true,
  );
  await flushPromises();
  const layer = wrapper.getComponent(SheetDrawingLayer);
  setupState(wrapper).sheetGridRef.selectDrawing("group");
  await flushPromises();
  await layer.get('[data-sheet-drawing-id="connector"]').trigger("keydown", { key: "ContextMenu" });
  await flushPromises();
  const menu = document.querySelector('[aria-label="Shape actions"]')!;
  const action = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (item) => item.textContent?.trim() === "Change Shape…",
  )!;
  expect(action.getAttribute("aria-disabled")).toBe("true");
  action.click();
  await flushPromises();
  expect(wrapper.findComponent(DrawingEditorDialog).exists()).toBe(false);
  await layer.get('[data-shape-group-id="group"]').trigger("keydown", { key: "ContextMenu" });
  await flushPromises();
  expect(wrapper.findComponent(DrawingEditorDialog).exists()).toBe(false);
});
test("real Workspace Change Shape retired menu action cannot edit a newly selected owner", async () => {
  installNativeTextMeasurement();
  const wrapper = fixture(
    async () => ({
      revision: 1,
      savedAt: 1,
      snapshot: serializeWorkbook(directTextWorkbook(false)),
    }),
    createMemoryImageAssetStore(),
    true,
  );
  await flushPromises();
  const state = setupState(wrapper),
    layer = wrapper.getComponent(SheetDrawingLayer),
    before = serializeWorkbook(state.session.workbook);
  await layer
    .get('[data-sheet-drawing-id="text-target"]')
    .trigger("keydown", { key: "ContextMenu" });
  await flushPromises();
  const menu = document.querySelector('[aria-label="Shape actions"]')!;
  const action = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (item) => item.textContent?.trim() === "Change Shape…",
  )!;
  state.sheetGridRef.selectDrawing("untouched");
  await flushPromises();
  action.click();
  await flushPromises();
  expect(wrapper.findComponent(DrawingEditorDialog).exists()).toBe(false);
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
});

test("real Workspace Change Shape cannot bypass composing text or reuse an owner replaced by text commit", async () => {
  installNativeTextMeasurement();
  const wrapper = fixture(
    async () => ({
      revision: 1,
      savedAt: 1,
      snapshot: serializeWorkbook(directTextWorkbook(false)),
    }),
    createMemoryImageAssetStore(),
    true,
  );
  await flushPromises();
  const state = setupState(wrapper),
    layer = wrapper.getComponent(SheetDrawingLayer),
    before = serializeWorkbook(state.session.workbook);
  state.sheetGridRef.selectDrawing("text-target");
  await flushPromises();
  async function contextAction() {
    await layer
      .get('[data-sheet-drawing-id="text-target"]')
      .trigger("keydown", { key: "ContextMenu" });
    await flushPromises();
    const menu = document.querySelector('[aria-label="Shape actions"]')!;
    return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.trim() === "Change Shape…",
    )!;
  }
  const first = await contextAction();
  expect(
    layer.props("startTextEdit")?.({
      root: getActiveSheet(state.session.workbook).drawings![0]!,
      selection: "all",
    }),
  ).toBe(true);
  await flushPromises();
  const input = wrapper.getComponent(ShapeCanvasTextEditor).get("textarea");
  await input.trigger("compositionstart");
  await input.setValue("Composing retained");
  first.click();
  await flushPromises();
  expect(wrapper.findComponent(DrawingEditorDialog).exists()).toBe(false);
  expect(state.shapeTextEdit.snapshot.value?.draftText).toBe("Composing retained");
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
  await input.trigger("compositionend");
  // A menu retired when entering the editor remains inert even after IME ends.
  first.click();
  await flushPromises();
  expect(wrapper.findComponent(DrawingEditorDialog).exists()).toBe(false);
  expect(state.shapeTextEdit.snapshot.value?.draftText).toBe("Composing retained");
  await input.trigger("keydown", { key: "Escape" });
  await flushPromises();
  first.click();
  await flushPromises();
  expect(state.shapeTextEdit.snapshot.value).toBeUndefined();
  expect(directSource(state).text).toBe("Composing retained");
  // The successful text command replaced the exact source captured by the old
  // menu; its object dialog must not open against either the old or new owner.
  expect(wrapper.findComponent(DrawingEditorDialog).exists()).toBe(false);
  (await contextAction()).click();
  await flushPromises();
  expect(wrapper.findComponent(DrawingEditorDialog).exists()).toBe(true);
});

test.each([false, true])(
  "real Workspace daily shape controls keep pointer selection, flip/rotate and exact history (owned=%s)",
  async (owned) => {
    installNativeTextMeasurement();
    const wrapper = fixture(
      async () => ({
        revision: 1,
        savedAt: 1,
        snapshot: serializeWorkbook(directTextWorkbook(owned)),
      }),
      createMemoryImageAssetStore(),
      true,
    );
    await flushPromises();
    const state = setupState(wrapper),
      path = owned ? ["text-group", "text-target"] : ["text-target"];
    expect(state.sheetGridRef.selectShapeObjects([path])).toBe(true);
    await flushPromises();
    const before = serializeWorkbook(state.session.workbook);
    const rotation = wrapper.getComponent(ShapeToolsToolbar).get('[data-shape-control="rotation"]');
    await rotation.trigger("pointerdown", { button: 0 });
    await flushPromises();
    await rotation.trigger("click");
    await flushPromises();
    const horizontal = document.querySelector<HTMLElement>(
      '[data-shape-control-action="flip-horizontal"]',
    );
    expect(horizontal).not.toBeNull();
    horizontal!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    horizontal!.click();
    await flushPromises();
    expect(directSource(state).shapeFlipX).toBe(true);
    expect(directSource(state).rotation).toBe(37);
    const after = serializeWorkbook(state.session.workbook);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(after);
    await wrapper
      .getComponent(ShapeToolsToolbar)
      .get('[data-shape-control="rotation"]')
      .trigger("click");
    await flushPromises();
    document.querySelector<HTMLElement>('[data-shape-control-action="rotate-right"]')!.click();
    await flushPromises();
    expect(directSource(state).rotation).toBe(127);
    // F2 remains the canonical inline text editor after ribbon operations.
    await wrapper
      .getComponent(SheetDrawingLayer)
      .get('[data-sheet-drawing-id="text-target"]')
      .trigger("keydown", { key: "F2" });
    await flushPromises();
    expect(state.shapeTextEdit.snapshot.value?.sourceId).toBe("text-target");
    const editorClip = wrapper.get(".sheet-drawing-layer__text-editor-clip").element as HTMLElement;
    expect(Number(editorClip.style.zIndex)).toBeGreaterThan(
      getActiveSheet(state.session.workbook).drawings!.length * 3,
    );
  },
);

test.each([false, true])(
  "real Workspace selection pane selects, renames and orders the exact root/owned object (owned=%s)",
  async (owned) => {
    installNativeTextMeasurement();
    const wrapper = fixture(
      async () => ({
        revision: 1,
        savedAt: 1,
        snapshot: serializeWorkbook(directTextWorkbook(owned)),
      }),
      createMemoryImageAssetStore(),
      true,
    );
    await flushPromises();
    const state = setupState(wrapper),
      path = owned ? ["text-group", "text-target"] : ["text-target"];
    expect(state.sheetGridRef.selectShapeObjects([path])).toBe(true);
    await flushPromises();
    const button = wrapper
      .getComponent(ShapeToolsToolbar)
      .get('[data-shape-control="selection-pane"]');
    await button.trigger("pointerdown", { button: 0 });
    await flushPromises();
    await button.trigger("click");
    await flushPromises();
    const pane = wrapper.getComponent(ShapeSelectionPane);
    const row = pane
      .findAll("[data-shape-pane-path]")
      .find((entry) => entry.attributes("data-shape-pane-path") === JSON.stringify(path))!;
    expect(row).toBeDefined();
    const input = row.get("input");
    await input.trigger("pointerdown", { button: 0 });
    await flushPromises();
    await input.setValue("Complete renamed shape");
    expect(directSource(state).name).not.toBe("Complete renamed shape");
    const before = serializeWorkbook(state.session.workbook);
    await input.trigger("keydown", { key: "Enter", code: "Enter" });
    await flushPromises();
    expect(directSource(state).name).toBe("Complete renamed shape");
    const after = serializeWorkbook(state.session.workbook);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(after);
    const order = wrapper
      .getComponent(ShapeSelectionPane)
      .get('[data-shape-pane-order="bring-front"]');
    await order.trigger("pointerdown", { button: 0 });
    await flushPromises();
    await order.trigger("click");
    await flushPromises();
    const root = getActiveSheet(state.session.workbook).drawings![0]!;
    const siblings = isShapeGroupDrawing(root)
      ? root.members
      : getActiveSheet(state.session.workbook).drawings!;
    expect(siblings.at(-1)?.id).toBe("text-target");
    await wrapper.getComponent(ShapeSelectionPane).get("[data-shape-pane-close]").trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(ShapeSelectionPane).exists()).toBe(false);
  },
);

test("real Workspace clears unavailable selection on sheet switch and can reselect the same object on return", async () => {
  installNativeTextMeasurement();
  const initial = directTextWorkbook(false),
    other = createSheet("Other", "other-controls-sheet");
  insertSheet(initial, other);
  const wrapper = fixture(
    async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(initial) }),
    createMemoryImageAssetStore(),
    true,
  );
  await flushPromises();
  const state = setupState(wrapper);
  state.sheetGridRef.selectDrawing("text-target");
  await flushPromises();
  expect(wrapper.getComponent(ShapeToolsToolbar).props("canFlip")).toBe(true);
  state.onSelectSheet(other.id);
  await flushPromises();
  expect(wrapper.findComponent(ShapeToolsToolbar).exists()).toBe(false);
  state.onSelectSheet("text-sheet");
  await flushPromises();
  expect(wrapper.findComponent(ShapeToolsToolbar).exists()).toBe(false);
  state.sheetGridRef.selectDrawing("text-target");
  await flushPromises();
  expect(wrapper.getComponent(ShapeToolsToolbar).props("canFlip")).toBe(true);
  await wrapper
    .getComponent(ShapeToolsToolbar)
    .get('[data-shape-control="rotation"]')
    .trigger("click");
  await flushPromises();
  document.querySelector<HTMLElement>('[data-shape-control-action="flip-vertical"]')!.click();
  await flushPromises();
  expect(directSource(state).shapeFlipY).toBe(true);
});

test("a real drawing layer publishes an initialized selected object without another selection event", async () => {
  installNativeTextMeasurement();
  const wrapper = fixture(
    async () => ({
      revision: 1,
      savedAt: 1,
      snapshot: serializeWorkbook(directTextWorkbook(false)),
    }),
    createMemoryImageAssetStore(),
    true,
  );
  await flushPromises();
  const layer = mount(SheetDrawingLayer, {
    props: { ...wrapper.getComponent(SheetDrawingLayer).props(), selectedDrawingId: "text-target" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(layer);
  await flushPromises();
  expect(layer.emitted("objectSelectionChange")).toEqual([[[["text-target"]]]]);
});

test.each([false, true])(
  "real Workspace eye hides root/owned pixels without deleting data, survives snapshot reopen and shows with Undo (%s)",
  async (owned) => {
    installNativeTextMeasurement();
    const wrapper = fixture(
      async () => ({
        revision: 1,
        savedAt: 1,
        snapshot: serializeWorkbook(directTextWorkbook(owned)),
      }),
      createMemoryImageAssetStore(),
      true,
    );
    await flushPromises();
    const state = setupState(wrapper),
      path = owned ? ["text-group", "text-target"] : ["text-target"];
    expect(state.sheetGridRef.selectShapeObjects([path])).toBe(true);
    await flushPromises();
    await wrapper
      .getComponent(ShapeToolsToolbar)
      .get('[data-shape-control="selection-pane"]')
      .trigger("click");
    await flushPromises();
    const before = serializeWorkbook(state.session.workbook),
      original = structuredClone(toRaw(directSource(state)));
    const row = () =>
      wrapper
        .getComponent(ShapeSelectionPane)
        .findAll("[data-shape-pane-path]")
        .find((entry) => entry.attributes("data-shape-pane-path") === JSON.stringify(path))!;
    await row().get("[data-shape-pane-visibility]").trigger("pointerdown", { button: 0 });
    await row().get("[data-shape-pane-visibility]").trigger("click");
    await flushPromises();
    expect(directSource(state)).toEqual({ ...original, hidden: true });
    expect(
      wrapper
        .getComponent(SheetDrawingLayer)
        .find('[data-sheet-drawing-id="text-target"]')
        .exists(),
    ).toBe(false);
    expect(wrapper.findComponent(ShapeCanvasTextEditor).exists()).toBe(false);
    expect(row().get("[data-shape-pane-visibility]").attributes("aria-label")).toContain(
      "Show object",
    );
    const after = serializeWorkbook(state.session.workbook);
    expect(after.version).toBe(64);
    const reopened = fixture(async () => ({ revision: 1, savedAt: 1, snapshot: after }));
    await flushPromises();
    expect(directSource(setupState(reopened))).toEqual({ ...original, hidden: true });
    expect(
      reopened
        .getComponent(SheetDrawingLayer)
        .find('[data-sheet-drawing-id="text-target"]')
        .exists(),
    ).toBe(false);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    expect(
      wrapper
        .getComponent(SheetDrawingLayer)
        .find('[data-sheet-drawing-id="text-target"]')
        .exists(),
    ).toBe(true);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(after);
    await row().get("[data-shape-pane-visibility]").trigger("click");
    await flushPromises();
    expect(directSource(state)).toEqual(original);
    expect(
      wrapper
        .getComponent(SheetDrawingLayer)
        .find('[data-sheet-drawing-id="text-target"]')
        .exists(),
    ).toBe(true);
  },
);

test("real Workspace can Hide All and Show All when a group text texture is unavailable, without re-layout or dropping its asset", async () => {
  installNativeTextMeasurement();
  const initial = directTextWorkbook(true),
    source = getActiveSheet(initial).drawings![0]!;
  if (!isShapeGroupDrawing(source)) throw Error("Expected group");
  const target = source.members.find((node) => node.id === "text-target")!;
  if (target.kind !== "shape") throw Error("Expected text leaf");
  target.shapeText = materializeDrawingShapeText({
    ...target,
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 240,
    height: 120,
  });
  target.shapeText.style = {
    fill: {
      kind: "value",
      value: {
        kind: "picture",
        assetId: "unavailable-text-glyph-texture",
        opacity: 1,
        rotateWithShape: true,
        layout: {
          kind: "stretch",
          offsetXRatio: 0,
          offsetYRatio: 0,
          widthRatio: 1,
          heightRatio: 1,
        },
      },
    },
  };
  const wrapper = fixture(
    async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(initial) }),
    createMemoryImageAssetStore(),
    true,
  );
  await flushPromises();
  const state = setupState(wrapper),
    before = serializeWorkbook(state.session.workbook);
  expect(state.sheetGridRef.selectShapeObjects([["text-group"]])).toBe(true);
  await flushPromises();
  await wrapper
    .getComponent(ShapeToolsToolbar)
    .get('[data-shape-control="selection-pane"]')
    .trigger("click");
  await flushPromises();
  await wrapper.getComponent(ShapeSelectionPane).get("[data-shape-pane-hide-all]").trigger("click");
  await flushPromises();
  const hidden = getActiveSheet(state.session.workbook).drawings![0]!;
  expect(hidden).toEqual({ ...source, hidden: true });
  expect(
    wrapper.getComponent(SheetDrawingLayer).find('[data-sheet-drawing-id="text-target"]').exists(),
  ).toBe(false);
  await wrapper.getComponent(ShapeSelectionPane).get("[data-shape-pane-show-all]").trigger("click");
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
  expect(directSource(state).shapeText?.style?.fill).toEqual(target.shapeText.style.fill);
});

test.each([false, true])(
  "saved free path starts real Workspace; selected segment command preserves root/owned identity and exact Undo (owned=%s)",
  async (owned) => {
    const initial = createWorkbook({ id: "segment-book", sheetId: "segment-sheet" });
    const initialSheet = getActiveSheet(initial);
    const source = framedShape();
    source.id = "segment-target";
    source.text = "";
    source.rotation = 0;
    delete source.shapeGeometry;
    source.shapeFrame.anchor = { mode: "fixed", x: 80, y: 24, size: { width: 180, height: 90 } };
    source.shapePath = {
      tool: "curve",
      viewBox: { width: 180, height: 90 },
      commands: [
        ["M", 0, 30],
        ["L", 30, 0],
        ["C", 60, 90, 90, 80, 120, 45],
        ["C", 140, 0, 150, 90, 180, 30],
      ],
    };
    const sibling = framedShape();
    sibling.id = "segment-sibling";
    sibling.text = "";
    sibling.rotation = 0;
    sibling.shapeFrame.anchor = { mode: "fixed", x: 350, y: 50, size: { width: 100, height: 70 } };
    initialSheet.drawings = owned
      ? groupShapeRoots(
          [source, sibling],
          [source.id, sibling.id],
          { id: "segment-group", name: "Group" },
          createPictureSheetMetrics(initialSheet),
        )
      : [source, sibling];
    const wrapper = fixture(
      async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(initial) }),
      createMemoryImageAssetStore(),
      true,
    );
    await flushPromises();
    const state = setupState(wrapper),
      layer = wrapper.getComponent(SheetDrawingLayer);
    expect(
      state.sheetGridRef.selectShapeObjects([owned ? ["segment-group", source.id] : [source.id]]),
    ).toBe(true);
    await flushPromises();
    layer
      .get('[data-sheet-drawing-id="segment-target"]')
      .element.dispatchEvent(connectorInput(layer, "dblclick", { x: 95, y: 39 }));
    await flushPromises();
    expect(layer.findComponent(FreeShapePointSelection).exists()).toBe(true);
    const before = serializeWorkbook(state.session.workbook);
    await layer
      .get('[data-free-shape-segment="2"]')
      .trigger("contextmenu", { clientX: 200, clientY: 200 });
    await flushPromises();
    document
      .querySelector<HTMLElement>('[data-free-shape-point-action="straight-segment"]')!
      .click();
    await flushPromises();
    const after = serializeWorkbook(state.session.workbook);
    expect(after).not.toEqual(before);
    const owner = getActiveSheet(state.session.workbook).drawings![0]!;
    const target = isShapeGroupDrawing(owner)
      ? owner.members.find((member) => member.id === source.id)!
      : owner;
    expect(target).toHaveProperty("shapePath.commands.2.0", "L");
    if (owned) {
      expect(owner.id).toBe("segment-group");
      expect(isShapeGroupDrawing(owner)).toBe(true);
    }
    expect(state.shapeTextEdit.snapshot.value).toBeUndefined();
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(after);
  },
);
