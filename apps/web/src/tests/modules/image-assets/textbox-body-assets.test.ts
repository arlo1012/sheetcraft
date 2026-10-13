import { createApp, nextTick, ref } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, createSheet, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook, type WorkbookSnapshot } from "@sheetcraft/core/serialization";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createSetSheetDrawingsCommand,
  createReplaceSheetDrawingCollectionsCommand,
} from "@sheetcraft/core/commands";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import {
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  collectWorkbookImageAssetIds,
  useImageAssetUrls,
} from "../../../modules/image-assets/useImageAssetUrls";
import {
  createMemoryImageAssetStore,
  type ImageAssetStore,
} from "../../../modules/image-assets/imageAssetStore";
import {
  captureShapeClipboardSelection,
  planShapeClipboardPaste,
  planCrossSheetShapeClipboardCut,
} from "../../../modules/sheet-drawings/shape-clipboard-planning";
import {
  createStore,
  mountPersistence,
} from "../workbook-persistence/useWorkbookPersistence/fixture";
import { actualPng } from "./image-header-fixtures";

const mounted: (() => void)[] = [];
afterEach(() => {
  mounted.splice(0).forEach((close) => close());
  vi.unstubAllGlobals();
});
function box(id: string, fillId: string, lineId: string, x = 20): SheetFramedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _w,
    height: _h,
    ...base
  } = createGraphicDrawing(id, "textBox", id, { row: 0, column: 0 });
  const paint = (assetId: string) => ({
    kind: "picture" as const,
    assetId,
    opacity: 1,
    rotateWithShape: true,
    layout: {
      kind: "stretch" as const,
      offsetXRatio: 0,
      offsetYRatio: 0,
      widthRatio: 1,
      heightRatio: 1,
    },
  });
  return normalizeSheetDrawing({
    ...base,
    kind: "textBox",
    text: "alpha",
    shapeStyle: {
      fill: { kind: "value", value: paint(fillId) },
      line: {
        kind: "value",
        value: {
          paint: paint(lineId),
          widthPt: 1,
          compound: "single",
          dash: "solid",
          cap: "butt",
          join: "miter",
          miterLimit: 4,
        },
      },
    },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x, y: 20, size: { width: 240, height: 120 } },
    },
  });
}
function mountUrls(getWorkbook: Parameters<typeof useImageAssetUrls>[0], store: ImageAssetStore) {
  let value!: ReturnType<typeof useImageAssetUrls>;
  const app = createApp({
    setup() {
      value = useImageAssetUrls(getWorkbook, store);
      return () => null;
    },
  });
  app.mount(document.createElement("div"));
  const unmount = () => app.unmount();
  mounted.push(unmount);
  return { value, unmount };
}

test("independent and hidden owned TextBox body fill/outline assets are collected without altering source", () => {
  const book = createWorkbook({ id: "textbox-assets", sheetId: "s" }),
    source = getActiveSheet(book);
  const root = box("independent", "body-fill", "body-line");
  source.drawings = [root];
  const independentBefore = serializeWorkbook(book);
  expect(collectWorkbookImageAssetIds(book)).toEqual(new Set(["body-fill", "body-line"]));
  expect(serializeWorkbook(book)).toEqual(independentBefore);
  const leaves = [
    box("owned", "owned-fill", "owned-line", 300),
    box("witness", "body-fill", "body-line", 600),
  ];
  const grouped = groupShapeRoots(
    leaves,
    leaves.map((leaf) => leaf.id),
    { id: "g", name: "Group" },
    createPictureSheetMetrics(source),
  );
  const group = grouped[0]!;
  if (group.kind !== "shapeGroup") throw Error("Expected group");
  group.hidden = true;
  source.drawings = [root, ...grouped];
  const before = serializeWorkbook(book);
  expect(collectWorkbookImageAssetIds(book)).toEqual(
    new Set(["body-fill", "body-line", "owned-fill", "owned-line"]),
  );
  expect(serializeWorkbook(book)).toEqual(before);
});

test("TextBox body resources survive copy, atomic cross-sheet Cut, internal save/load and only lose URLs after their last live reference", async () => {
  const book = ref(createWorkbook({ id: "body-lifecycle", sheetId: "source" }));
  const source = getActiveSheet(book.value),
    target = createSheet("Target", "target");
  book.value.sheets.set(target.id, target);
  source.drawings = [box("box", "fill", "line")];
  const core = createWorkbookSession({
    workbook: book.value,
    idFactory: createSequentialIdFactory(),
  });
  const store = createMemoryImageAssetStore();
  for (const id of ["fill", "line"])
    await store.put({
      id,
      mimeType: "image/png",
      width: 8,
      height: 4,
      blob: new Blob([actualPng], { type: "image/png" }),
    });
  let created = 0;
  const get = vi.fn(store.get),
    create = vi.fn((blob: Blob) => `blob:${blob.size}:${++created}`),
    revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  const urls = mountUrls(() => book.value, { ...store, get });
  await urls.value.refresh();
  expect(urls.value.urls.value.size).toBe(2);
  expect(get).toHaveBeenCalledTimes(2);
  const originalUrls = new Map(urls.value.urls.value),
    sourceMetrics = createPictureSheetMetrics(source),
    targetMetrics = createPictureSheetMetrics(target);
  let id = 0;
  const createId = () => `new-${++id}`;
  const selected = captureShapeClipboardSelection(source.drawings, [["box"]], sourceMetrics);
  const copied = planShapeClipboardPaste({
    selection: selected,
    mode: "copy",
    targetForest: [],
    sourceMetrics,
    targetMetrics,
    address: { row: 3, column: 3 },
    createId,
  });
  expect(
    executeWorkbookCommand(core, createSetSheetDrawingsCommand(target.id, copied.nextForest)),
  ).toBe(true);
  await nextTick();
  await urls.value.refresh();
  expect(urls.value.urls.value).toEqual(originalUrls);
  expect(collectWorkbookImageAssetIds(book.value)).toEqual(new Set(["fill", "line"]));
  const cut = planCrossSheetShapeClipboardCut({
    selection: selected,
    targetForest: target.drawings!,
    sourceMetrics,
    targetMetrics,
    address: { row: 8, column: 5 },
    createId,
  });
  expect(
    executeWorkbookCommand(
      core,
      createReplaceSheetDrawingCollectionsCommand([
        { sheetId: source.id, expectedDrawings: source.drawings!, drawings: cut.sourceForest },
        { sheetId: target.id, expectedDrawings: target.drawings!, drawings: cut.targetForest },
      ]),
    ),
  ).toBe(true);
  await nextTick();
  await urls.value.refresh();
  expect(source.drawings).toEqual([]);
  expect(target.drawings).toHaveLength(2);
  expect(urls.value.urls.value).toEqual(originalUrls);
  expect(get).toHaveBeenCalledTimes(2);
  expect(revoke).not.toHaveBeenCalled();

  let saved: WorkbookSnapshot | undefined;
  const saving = mountPersistence({
    workbook: book.value,
    store: createStore({
      save: async (snapshot) => {
        saved = structuredClone(snapshot);
        return { revision: 1, savedAt: 1 };
      },
    }),
  });
  mounted.push(() => saving.wrapper.unmount());
  await saving.persistence.ready;
  expect(await saving.persistence.saveNow()).toBe(true);
  expect(saved).toBeDefined();
  const loading = mountPersistence({
    store: createStore({ load: async () => ({ snapshot: saved!, revision: 1, savedAt: 1 }) }),
  });
  mounted.push(() => loading.wrapper.unmount());
  await loading.persistence.ready;
  expect(collectWorkbookImageAssetIds(loading.getWorkbook())).toEqual(new Set(["fill", "line"]));
  const restored = mountUrls(loading.getWorkbook, { ...store, get });
  await restored.value.refresh();
  expect(restored.value.urls.value.size).toBe(2);
  expect(await store.get("fill")).toBeDefined();
  expect(await store.get("line")).toBeDefined();

  expect(undoWorkbookCommand(core)).toBe(true);
  await nextTick();
  await urls.value.refresh();
  expect(source.drawings).toHaveLength(1);
  expect(target.drawings).toHaveLength(1);
  expect(urls.value.urls.value).toEqual(originalUrls);
  expect(revoke).not.toHaveBeenCalled();
  executeWorkbookCommand(core, createSetSheetDrawingsCommand(source.id, []));
  await nextTick();
  await urls.value.refresh();
  expect(urls.value.urls.value.size).toBe(2);
  executeWorkbookCommand(core, createSetSheetDrawingsCommand(target.id, []));
  await nextTick();
  await urls.value.refresh();
  expect(collectWorkbookImageAssetIds(book.value).size).toBe(0);
  expect(urls.value.urls.value.size).toBe(0);
  expect(new Set(revoke.mock.calls.map(([url]) => url))).toEqual(new Set(originalUrls.values()));
  // The separate restored document still owns its own URLs. No global asset pinning is added.
  expect(restored.value.urls.value.size).toBe(2);
});
