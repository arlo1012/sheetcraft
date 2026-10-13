import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, createSheet, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import WordArtStyleGallery from "../../../modules/sheet-drawings/components/WordArtStyleGallery.vue";
import ShapeCanvasTextEditor from "../../../modules/sheet-drawings/components/ShapeCanvasTextEditor.vue";
import ShapeFormatPane from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import CellTextInput from "../../../shared/cell-editing/CellTextInput.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { WORDART_STYLE_PRESETS } from "../../../modules/sheet-drawings/wordart-style-presets";
import {
  writeTextDomSelection,
  readTextDomSelection,
} from "../../../shared/cell-editing/text-dom-selection";
import * as measurement from "../../../modules/sheet-drawings/shape-text-measure";
import type { useWordArtActions } from "../../../modules/sheet-drawings/useWordArtActions";
import type { useShapeTextEditSession } from "../../../modules/sheet-drawings/useShapeTextEditSession";
import type { useShapeTextCharacterFormatPane } from "../../../modules/sheet-drawings/useShapeTextCharacterFormatPane";
import type { useShapeClipboard } from "../../../modules/sheet-drawings/useShapeClipboard";
const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function state(wrapper: VueWrapper) {
  return (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    session: { workbook: ReturnType<typeof createWorkbook> };
    wordArtActions: ReturnType<typeof useWordArtActions>;
    shapeTextEdit: ReturnType<typeof useShapeTextEditSession>;
    shapeTextCharacterPane: ReturnType<typeof useShapeTextCharacterFormatPane>;
    shapeClipboard: ReturnType<typeof useShapeClipboard>;
    sheetGridRef: {
      selectShapeObjects(paths: readonly (readonly string[])[]): boolean;
      getSelectedShapeObjects(): readonly (readonly string[])[];
    };
    undo(): void;
    redo(): void;
    selectSheet(id: string): void;
  };
}
async function setup() {
  // Only the absent native metrics are injected. Workspace watches, menu,
  // editing, preparation, owner guards and command history remain real.
  vi.spyOn(measurement, "getBrowserShapeTextMeasurement").mockReturnValue({
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
  const stored = createWorkbook({ id: "wordart-workspace", sheetId: "wordart-sheet" });
  const old = createGraphicDrawing("legacy-art", "wordArt", "Legacy", { row: 2, column: 2 });
  getActiveSheet(stored).drawings = [old];
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(stored) }),
        save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        replace: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, current: state(wrapper), old };
}
function modern(current: ReturnType<typeof state>) {
  const source = getActiveSheet(current.session.workbook).drawings!.find(
    (drawing) => drawing.kind === "shape" && drawing.wordArt,
  );
  if (!source || source.kind !== "shape") throw Error("Expected modern WordArt");
  return source;
}
test("real Workspace inserts from the 25-style gallery, edits selected glyph paint and preserves atomic history", async () => {
  const { wrapper, current, old } = await setup();
  const before = serializeWorkbook(current.session.workbook);
  await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
  await wrapper.get('[data-insert-tool="wordArt"]').trigger("click");
  const gallery = wrapper.getComponent(WordArtStyleGallery);
  expect(gallery.findAll("[data-wordart-style-choice]")).toHaveLength(25);
  await gallery
    .get(`[data-wordart-style-choice="${WORDART_STYLE_PRESETS[0]!.id}"]`)
    .trigger("click");
  await flushPromises();
  const inserted = serializeWorkbook(current.session.workbook);
  expect(inserted.version).toBe(70);
  expect(modern(current).text).toBe("Your text here");
  expect(getActiveSheet(current.session.workbook).drawings![0]).toEqual(old);
  const editor = wrapper.getComponent(ShapeCanvasTextEditor);
  const input = editor.get("[data-shape-rich-text-input]");
  expect(readTextDomSelection(input.element as HTMLElement)).toMatchObject({ start: 0, end: 14 });
  await input.trigger("beforeinput", { inputType: "insertText", data: "alpha beta" });
  expect(current.shapeTextEdit.snapshot.value?.draftText).toBe("alpha beta");
  expect(current.shapeTextEdit.snapshot.value?.error).toBeUndefined();
  writeTextDomSelection(input.element as HTMLElement, { start: 0, end: 6, direction: "forward" });
  await input.trigger("keyup", { key: "Shift" });
  await flushPromises();
  const pane = wrapper.getComponent(ShapeFormatPane);
  expect(pane.props("initialTab")).toBe("text-fill-line");
  expect(pane.props("capabilities")?.styles?.text?.fill?.enabled).toBe(true);
  const red = {
    kind: "value" as const,
    value: { kind: "solid" as const, color: { kind: "rgb" as const, rgb: "#FF0000" }, opacity: 1 },
  };
  const blue = {
    kind: "value" as const,
    value: {
      paint: {
        kind: "solid" as const,
        color: { kind: "rgb" as const, rgb: "#0000FF" },
        opacity: 1,
      },
      widthPt: 0.75,
      compound: "single" as const,
      dash: "solid" as const,
      cap: "butt" as const,
      join: "round" as const,
      miterLimit: 4,
    },
  };
  for (const [category] of [
    ["fill", red],
    ["line", blue],
  ] as const) {
    const snapshot = pane.props("snapshot")!;
    const selected = category === "fill" ? { category, value: red } : { category, value: blue };
    expect(
      pane.props("onIntent")!({
        type: "set-style",
        target: "text",
        ...selected,
        owner: snapshot.owner,
        baseRevision: snapshot.revision,
        intentId: category,
      }),
    ).toBe(true);
    await flushPromises();
  }
  expect(serializeWorkbook(current.session.workbook)).toEqual(inserted);
  expect(current.shapeTextEdit.snapshot.value!.draftView.shapeText!.characterRuns).toEqual([
    { start: 0, end: 6, fill: red, line: blue },
  ]);
  await input.trigger("keydown", { key: "Enter", ctrlKey: true });
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value).toBeUndefined();
  expect(modern(current).text).toBe("alpha beta");
  const edited = serializeWorkbook(current.session.workbook);
  current.undo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(inserted);
  current.undo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  current.redo();
  current.redo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(edited);
});
test("real Workspace object keyboard copy/paste is separate from source-text editing and keeps WordArt runs", async () => {
  const { wrapper, current } = await setup();
  expect(await current.wordArtActions.insert(WORDART_STYLE_PRESETS[0]!)).toBe(true);
  await flushPromises();
  const input = wrapper.getComponent(ShapeCanvasTextEditor).get("[data-shape-rich-text-input]");
  await input.trigger("beforeinput", { inputType: "insertText", data: "Owned art" });
  await input.trigger("keydown", { key: "Enter", ctrlKey: true });
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value?.error).toBeUndefined();
  expect(current.shapeTextEdit.snapshot.value).toBeUndefined();
  const original = modern(current),
    before = serializeWorkbook(current.session.workbook);
  expect(current.sheetGridRef.selectShapeObjects([[original.id]])).toBe(true);
  await flushPromises();
  const layer = wrapper.getComponent(SheetDrawingLayer);
  await layer
    .get(`[data-sheet-drawing-id="${original.id}"]`)
    .trigger("keydown", { key: "c", ctrlKey: true });
  expect(current.shapeClipboard.hasPending()).toBe(true);
  await layer
    .get(`[data-sheet-drawing-id="${original.id}"]`)
    .trigger("keydown", { key: "v", ctrlKey: true });
  await flushPromises();
  const arts = getActiveSheet(current.session.workbook).drawings!.filter(
    (drawing) => drawing.kind === "shape" && drawing.wordArt,
  );
  expect(arts).toHaveLength(2);
  expect(arts[1]!.id).not.toBe(original.id);
  expect(arts[1]).toHaveProperty("text", "Owned art");
  expect(arts[1]).toHaveProperty("shapeText", original.shapeText);
  expect(current.sheetGridRef.getSelectedShapeObjects()).toEqual([[arts[1]!.id]]);
  current.undo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
});

test("real Workspace latest source-text and cell copies invalidate the object clipboard, and a cut selects its new root", async () => {
  const { wrapper, current } = await setup();
  expect(await current.wordArtActions.insert(WORDART_STYLE_PRESETS[0]!)).toBe(true);
  await flushPromises();
  let input = wrapper.getComponent(ShapeCanvasTextEditor).get("[data-shape-rich-text-input]");
  await input.trigger("beforeinput", { inputType: "insertText", data: "Copy this text" });
  await input.trigger("keydown", { key: "Enter", ctrlKey: true });
  await flushPromises();
  const original = modern(current);
  expect(current.sheetGridRef.selectShapeObjects([[original.id]])).toBe(true);
  expect(current.shapeClipboard.copy()).toBe(true);
  await wrapper
    .getComponent(SheetDrawingLayer)
    .get(`[data-sheet-drawing-id="${original.id}"]`)
    .trigger("keydown", { key: "F2" });
  await flushPromises();
  input = wrapper.getComponent(ShapeCanvasTextEditor).get("[data-shape-rich-text-input]");
  const setData = vi.fn();
  await input.trigger("copy", { clipboardData: { setData } });
  expect(setData).toHaveBeenCalledWith("text/plain", "Copy this text");
  expect(current.shapeClipboard.hasPending()).toBe(false);
  await input.trigger("keydown", { key: "Escape" });
  await flushPromises();
  expect(current.shapeClipboard.copy([[original.id]])).toBe(true);
  const grid = wrapper.getComponent(SheetGrid);
  // A successfully prepared cell-context copy is the same signal used by
  // native cell transfer and menu copy; rejected copies never emit it.
  const gridState = (grid.vm.$ as unknown as { setupState: { copySelection(): Promise<void> } })
    .setupState;
  await gridState.copySelection();
  await flushPromises();
  expect(current.shapeClipboard.hasPending()).toBe(false);
  const before = serializeWorkbook(current.session.workbook);
  expect(current.shapeClipboard.cut([[original.id]])).toBe(true);
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  expect(current.shapeClipboard.paste()).toBe(true);
  await flushPromises();
  const pasted = modern(current);
  expect(pasted.id).not.toBe(original.id);
  expect(current.sheetGridRef.getSelectedShapeObjects()).toEqual([[pasted.id]]);
  expect(current.shapeClipboard.hasPending()).toBe(false);
  current.undo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  expect(current.shapeClipboard.cut([[original.id]])).toBe(true);
  expect(current.shapeClipboard.paste()).toBe(true);
  expect(current.sheetGridRef.selectShapeObjects([])).toBe(true);
  await flushPromises();
  expect(current.sheetGridRef.getSelectedShapeObjects()).toEqual([]);
});

test("queued paste selection respects a worksheet owner switch before the grid refresh", async () => {
  const { current } = await setup();
  expect(await current.wordArtActions.insert(WORDART_STYLE_PRESETS[0]!)).toBe(true);
  await flushPromises();
  const opened = current.shapeTextEdit.snapshot.value!;
  expect(current.shapeTextEdit.commit(opened.sessionId)).toBe(true);
  await flushPromises();
  const original = modern(current);
  expect(current.shapeClipboard.copy([[original.id]])).toBe(true);
  const other = createSheet("Other", "other-sheet");
  current.session.workbook.sheets.set(other.id, other);
  expect(current.shapeClipboard.paste()).toBe(true);
  current.selectSheet(other.id);
  await flushPromises();
  expect(getActiveSheet(current.session.workbook).id).toBe(other.id);
  expect(current.sheetGridRef.getSelectedShapeObjects()).toEqual([]);
});

test("controlled rich cell copy replaces pending shape data and stale native-copy microtasks cannot clear a newer capture", async () => {
  const { wrapper, current } = await setup();
  expect(await current.wordArtActions.insert(WORDART_STYLE_PRESETS[0]!)).toBe(true);
  await flushPromises();
  expect(current.shapeTextEdit.commit(current.shapeTextEdit.snapshot.value!.sessionId)).toBe(true);
  await flushPromises();
  const source = modern(current);
  expect(current.shapeClipboard.copy([[source.id]])).toBe(true);
  const grid = wrapper.getComponent(SheetGrid),
    edit = grid.props("editSession")!,
    sheet = grid.props("sheet");
  edit.begin(
    {
      sheetId: sheet.id,
      address: { row: 0, column: 0 },
      input: "word",
      content: {
        kind: "literal",
        value: "word",
        fontRuns: [{ start: 0, end: 4, fontFamily: "Georgia" }],
      },
    },
    { surface: "grid", mode: "append" },
  );
  await flushPromises();
  const cellInput = wrapper.getComponent(CellTextInput).get("[data-cell-edit-surface]");
  writeTextDomSelection(cellInput.element as HTMLElement, {
    start: 0,
    end: 4,
    direction: "forward",
  });
  const setData = vi.fn();
  await cellInput.trigger("copy", { clipboardData: { setData } });
  expect(setData).toHaveBeenCalledWith("text/plain", "word");
  expect(current.shapeClipboard.hasPending()).toBe(false);
  edit.cancel();
  await flushPromises();
  expect(current.shapeClipboard.copy([[source.id]])).toBe(true);
  const native = document.createElement("textarea");
  native.value = "new text";
  wrapper.element.append(native);
  native.setSelectionRange(0, 3);
  native.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true }));
  const previous = current.shapeClipboard.getIdentity();
  expect(current.shapeClipboard.copy([[source.id]])).toBe(true);
  const latest = current.shapeClipboard.getIdentity();
  expect(latest).not.toEqual(previous);
  await flushPromises();
  expect(current.shapeClipboard.getIdentity()).toEqual(latest);
});

test("a delayed cell-menu copy cannot invalidate a subsequently captured shape clipboard", async () => {
  const { wrapper, current } = await setup();
  expect(await current.wordArtActions.insert(WORDART_STYLE_PRESETS[0]!)).toBe(true);
  await flushPromises();
  expect(current.shapeTextEdit.commit(current.shapeTextEdit.snapshot.value!.sessionId)).toBe(true);
  await flushPromises();
  const source = modern(current),
    grid = wrapper.getComponent(SheetGrid);
  expect(current.shapeClipboard.copy([[source.id]])).toBe(true);
  const gridState = (
    grid.vm.$ as unknown as {
      setupState: {
        copySelection(): Promise<void>;
        browserClipboard: { write: (transfer: unknown) => Promise<{ localTokenWritten: boolean }> };
      };
    }
  ).setupState;
  let resolve!: (result: { localTokenWritten: boolean }) => void;
  gridState.browserClipboard.write = vi.fn(
    () =>
      new Promise<{ localTokenWritten: boolean }>((done) => {
        resolve = done;
      }),
  );
  const copying = gridState.copySelection();
  expect(current.shapeClipboard.copy([[source.id]])).toBe(true);
  const latest = current.shapeClipboard.getIdentity();
  resolve({ localTokenWritten: true });
  await copying;
  await flushPromises();
  expect(current.shapeClipboard.getIdentity()).toEqual(latest);
});
