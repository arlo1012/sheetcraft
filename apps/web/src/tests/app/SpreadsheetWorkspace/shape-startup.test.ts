import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { isShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import { groupShapeRoots, ungroupShapeRoot } from "@sheetcraft/core/shape-group-planning";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { framedShape } from "../../modules/sheet-drawings/framed-shape-fixture";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import ShapeFormatPane from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import { isFramedShapeDrawing } from "@sheetcraft/core/sheet-drawings";
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
    shapeInteractionBlocked: boolean;
    shapeGroupFormatPane: ReturnType<
      typeof import("../../../modules/sheet-drawings/useOwnedShapeGroupFormatPane").useOwnedShapeGroupFormatPane
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
) {
  const wrapper = mount(SpreadsheetWorkspace, {
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
