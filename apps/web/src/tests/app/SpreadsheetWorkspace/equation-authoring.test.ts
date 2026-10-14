import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { nextTick, toRaw } from "vue";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  serializeEquationDocument,
  type EquationDocument,
} from "@sheetcraft/core/equation-document";
import {
  isFramedEquationDrawing,
  type SheetDrawing,
  type SheetFramedEquationDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  findShapeGroupNode,
  normalizeShapeGroup,
  isSheetGroupedEquationDrawing,
  type ShapeGroupDrawing,
  type SheetGroupedEquationDrawing,
} from "@sheetcraft/core/shape-group";
import type { WorkbookSession } from "@sheetcraft/core/history";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import EquationCanvasEditor from "../../../modules/sheet-drawings/equation/EquationCanvasEditor.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import EquationTools from "../../../modules/sheet-drawings/equation/EquationTools.vue";
import { useEquationEditSession } from "../../../modules/sheet-drawings/equation/useEquationEditSession";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function state(wrapper: VueWrapper) {
  return (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    session: WorkbookSession;
    equationEdit: ReturnType<typeof useEquationEditSession>;
    equationPlaceholdersHidden: boolean;
    drawingActions: { dialog: { value: unknown } };
    findDialogVisible: boolean;
    cellFormatSelection: unknown;
    undo(): void;
    redo(): void;
  };
}
function equationSource(canonical: boolean, structured = true, value = "x") {
  const document: EquationDocument = {
    kind: "equation-document-v1",
    body: { id: "body", kind: "sequence", children: [{ id: "value", kind: "text", value }] },
  };
  const source = {
    ...createGraphicDrawing("existing-equation", "equation", "Equation", { row: 0, column: 0 }),
    text: structured ? serializeEquationDocument(document) : "  x + 1  ",
    ...(structured ? { equationDocument: document } : {}),
  };
  if (!canonical) return source;
  const { anchor: _anchor, offsetX: _x, offsetY: _y, width, height, ...appearance } = source;
  return {
    ...appearance,
    kind: "equation" as const,
    shapeFrame: {
      kind: "shape-frame-v1" as const,
      anchor: { mode: "fixed" as const, x: 24, y: 24, size: { width, height } },
    },
    shapeProperties: { locked: false as const, printObject: false as const, altTitle: "Math" },
  };
}
async function fixture(drawings: SheetDrawing[] = []) {
  const workbook = createWorkbook({ id: "math-workbook", sheetId: "math-sheet" });
  if (drawings.length) getActiveSheet(workbook).drawings = drawings;
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
        save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        replace: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, current: state(wrapper) };
}
async function insertBlank(wrapper: VueWrapper) {
  await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
  await wrapper.get('[data-insert-tool="equation"]').trigger("click");
  document.body.querySelector<HTMLElement>("[data-equation-new]")!.click();
  await flushPromises();
}
test("real Workspace initializes, inserts inline math from actual menu, keeps private history, finishes/Undo and reopens", async () => {
  const { wrapper, current } = await fixture();
  await insertBlank(wrapper);
  expect(wrapper.findComponent(EquationTools).exists()).toBe(true);
  const editor = wrapper.getComponent(EquationCanvasEditor);
  const input = editor.get("input[data-equation-slot]");
  await input.setValue("x+y");
  await flushPromises();
  const sheet = getActiveSheet(current.session.workbook);
  expect(sheet.drawings![0]).toMatchObject({ kind: "equation", text: "" });
  const source = toRaw(sheet.drawings![0]!);
  const history = current.session.history.undoStack.length;
  await editor.get("input[data-equation-slot]").trigger("keydown", { key: "z", ctrlKey: true });
  await flushPromises();
  expect(current.equationEdit.snapshot.value!.sourceText).toBe("");
  await editor.get("input[data-equation-slot]").trigger("keydown", { key: "y", ctrlKey: true });
  await flushPromises();
  expect(current.equationEdit.snapshot.value!.sourceText).toBe("x+y");
  await wrapper.get("[data-equation-finish]").trigger("click");
  await flushPromises();
  expect(current.equationEdit.snapshot.value).toBeUndefined();
  expect(sheet.drawings![0]).toMatchObject({ text: "x+y" });
  expect(current.session.history.undoStack).toHaveLength(history + 1);
  expect(serializeWorkbook(current.session.workbook).version).toBe(75);
  current.undo();
  await flushPromises();
  expect(sheet.drawings![0]).toEqual(source);
  current.redo();
  await flushPromises();
  expect(sheet.drawings![0]).toMatchObject({ text: "x+y" });
  const object = wrapper.get(`[data-sheet-drawing-id="${sheet.drawings![0]!.id}"]`);
  await object.trigger("keydown", { key: "F2" });
  await flushPromises();
  expect(wrapper.findComponent(EquationCanvasEditor).exists()).toBe(true);
});
test("real Workspace capture preserves equation tool clicks and IME, blocks unrelated sheet shortcuts", async () => {
  const { wrapper, current } = await fixture();
  await insertBlank(wrapper);
  const input = wrapper.getComponent(EquationCanvasEditor).get("input[data-equation-slot]");
  await input.trigger("compositionstart");
  await input.setValue("partial");
  await nextTick();
  await wrapper.get("[data-equation-finish]").trigger("click");
  await flushPromises();
  expect(current.equationEdit.snapshot.value!.composing).toBe(true);
  expect(getActiveSheet(current.session.workbook).drawings![0]).toMatchObject({ text: "" });
  await input.trigger("compositionend", { data: "汉" });
  await flushPromises();
  expect(current.equationEdit.snapshot.value!.sourceText).toContain("汉");
  const before = current.cellFormatSelection;
  const liveInput = wrapper.getComponent(EquationCanvasEditor).get("input[data-equation-slot]");
  await liveInput.trigger("keydown", { key: "1", ctrlKey: true });
  await liveInput.trigger("keydown", { key: "k", ctrlKey: true });
  await liveInput.trigger("keydown", { key: "t", ctrlKey: true });
  await flushPromises();
  expect(current.cellFormatSelection).toBe(before);
  expect(wrapper.find("[data-equation-tools]").exists()).toBe(true);
});
test("actual portal fraction insertion keeps current owner draft; numerator typing and math options stay inline", async () => {
  const { wrapper, current } = await fixture();
  await insertBlank(wrapper);
  await wrapper.get('[data-equation-structure="fraction"]').trigger("click");
  const tile = document.body.querySelector<HTMLElement>("[data-equation-template]");
  expect(tile).not.toBeNull();
  tile!.click();
  await flushPromises();
  expect(current.equationEdit.snapshot.value!.draft!.document.body.children[0]!.kind).toBe(
    "fraction",
  );
  const input = wrapper.getComponent(EquationCanvasEditor).get('input[aria-label="Numerator"]');
  await input.setValue("a");
  await flushPromises();
  expect(current.equationEdit.snapshot.value!.sourceText).toContain("a");
  expect(wrapper.findComponent(EquationCanvasEditor).exists()).toBe(true);
});
test("actual source warning can be canceled or restored, and visible Cancel discards the owner draft without history", async () => {
  const { wrapper, current } = await fixture();
  await insertBlank(wrapper);
  const sheet = getActiveSheet(current.session.workbook);
  const history = current.session.history.undoStack.length;
  await wrapper
    .getComponent(EquationCanvasEditor)
    .get("input[data-equation-slot]")
    .setValue("draft");
  await flushPromises();
  await wrapper.get("[data-equation-edit-source]").trigger("click");
  await flushPromises();
  expect(wrapper.find("[data-equation-source-warning]").exists()).toBe(true);
  await wrapper.get("[data-equation-source-warning]").findAll("button")[1]!.trigger("click");
  await flushPromises();
  expect(current.equationEdit.snapshot.value!.mode).toBe("structured");
  await wrapper.get("[data-equation-edit-source]").trigger("click");
  await flushPromises();
  await wrapper.get("[data-equation-source-warning]").findAll("button")[0]!.trigger("click");
  await flushPromises();
  expect(current.equationEdit.snapshot.value!.mode).toBe("latex");
  expect(wrapper.get("[data-equation-reload]").attributes("disabled")).toBeUndefined();
  await wrapper.get("[data-equation-reload]").trigger("click");
  await flushPromises();
  expect(current.equationEdit.snapshot.value!.sourceText).toBe("draft");
  await wrapper.get("[data-equation-cancel]").trigger("click");
  await flushPromises();
  expect(current.equationEdit.snapshot.value).toBeUndefined();
  expect(sheet.drawings![0]).toMatchObject({ text: "" });
  expect(current.session.history.undoStack).toHaveLength(history);
});

test.each([false, true])(
  "real Workspace Equation root nudge preserves source and document UndoRedo (canonical=%s)",
  async (canonical) => {
    const { wrapper, current } = await fixture(
      canonical ? [equationSource(true, true, "a+b")] : [],
    );
    if (!canonical) {
      await insertBlank(wrapper);
      await wrapper
        .getComponent(EquationCanvasEditor)
        .get("input[data-equation-slot]")
        .setValue("a+b");
      await flushPromises();
      await wrapper.get("[data-equation-finish]").trigger("click");
      await flushPromises();
    }
    const sheet = getActiveSheet(current.session.workbook);
    const before = toRaw(sheet.drawings![0]!);
    if (before.kind !== "equation") throw new Error("Expected Equation source.");
    const history = current.session.history.undoStack.length;
    await wrapper
      .get(`[data-sheet-drawing-id="${before.id}"]`)
      .trigger("keydown", { key: "ArrowRight" });
    await flushPromises();
    const after = sheet.drawings![0]!;
    expect(after).toMatchObject({
      kind: "equation",
      text: before.text,
      equationDocument: before.equationDocument,
    });
    if (isFramedEquationDrawing(before)) {
      expect(after).toMatchObject({
        shapeFrame: { ...before.shapeFrame, anchor: { ...before.shapeFrame.anchor, x: 25 } },
        shapeProperties: before.shapeProperties,
      });
      expect(after).not.toHaveProperty("anchor");
    } else expect(after).toMatchObject({ offsetX: before.offsetX + 1 });
    expect(current.session.history.undoStack).toHaveLength(history + 1);
    current.undo();
    await flushPromises();
    expect(sheet.drawings![0]).toEqual(before);
    current.redo();
    await flushPromises();
    expect(sheet.drawings![0]).toMatchObject({
      text: before.text,
      equationDocument: before.equationDocument,
    });
  },
);

test.each([false, true])(
  "actual Equation root Copy/Paste retains independent source and document Undo (canonical=%s)",
  async (canonical) => {
    const { wrapper, current } = await fixture(
      canonical ? [equationSource(true, true, "x+y")] : [],
    );
    if (!canonical) {
      await insertBlank(wrapper);
      await wrapper
        .getComponent(EquationCanvasEditor)
        .get("input[data-equation-slot]")
        .setValue("x+y");
      await flushPromises();
      await wrapper.get("[data-equation-finish]").trigger("click");
      await flushPromises();
    }
    const sheet = getActiveSheet(current.session.workbook);
    const source = toRaw(sheet.drawings![0]!);
    if (source.kind !== "equation") throw new Error("Expected Equation source.");
    const history = current.session.history.undoStack.length;
    const object = wrapper.get(`[data-sheet-drawing-id="${source.id}"]`);
    await object.trigger("pointerdown", { button: 0, clientX: 32, clientY: 32, pointerId: 17 });
    const release = new MouseEvent("pointerup", { bubbles: true, clientX: 32, clientY: 32 });
    Object.defineProperty(release, "pointerId", { value: 17 });
    window.dispatchEvent(release);
    await flushPromises();
    expect(wrapper.getComponent(SheetDrawingLayer).vm.getObjectSelectionPaths()).toEqual([
      [source.id],
    ]);
    await object.trigger("keydown", { key: "c", ctrlKey: true });
    await flushPromises();
    expect(current.session.history.undoStack).toHaveLength(history);
    await object.trigger("keydown", { key: "v", ctrlKey: true });
    await flushPromises();
    expect(sheet.drawings).toHaveLength(2);
    const clone = toRaw(sheet.drawings![1]!);
    if (clone.kind !== "equation") throw new Error("Expected Equation clone.");
    expect(clone.id).not.toBe(source.id);
    expect(clone.equationDocument).toEqual(source.equationDocument);
    expect(clone.equationDocument).not.toBe(source.equationDocument);
    expect(clone.text).toBe(source.text);
    if (isFramedEquationDrawing(source)) {
      expect(isFramedEquationDrawing(clone)).toBe(true);
      expect(clone).toMatchObject({ shapeProperties: source.shapeProperties });
      expect(clone).not.toHaveProperty("anchor");
    }
    expect(current.session.history.undoStack).toHaveLength(history + 1);
    current.undo();
    await flushPromises();
    expect(sheet.drawings).toEqual([source]);
    current.redo();
    await flushPromises();
    expect(sheet.drawings![1]).toEqual(clone);
  },
);

test("real Workspace opens the canonical Equation owner, commits its math draft and reopens with exact frame metadata", async () => {
  const { wrapper, current } = await fixture([equationSource(true)]);
  const sheet = getActiveSheet(current.session.workbook),
    source = toRaw(sheet.drawings![0]!) as SheetFramedEquationDrawing;
  expect(current.equationEdit.snapshot.value).toBeUndefined();
  const history = current.session.history.undoStack.length;
  await wrapper.get(`[data-sheet-drawing-id="${source.id}"]`).trigger("keydown", { key: "F2" });
  await flushPromises();
  expect(toRaw(current.equationEdit.snapshot.value!.source)).toBe(source);
  expect(current.equationEdit.snapshot.value!.view).not.toHaveProperty("shapeFrame");
  const cb = current.equationEdit.callbacks.value!;
  await wrapper.getComponent(EquationCanvasEditor).get("input[data-equation-slot]").setValue("x+y");
  await flushPromises();
  expect(toRaw(sheet.drawings![0]!)).toBe(source);
  expect(current.session.history.undoStack).toHaveLength(history);
  await wrapper.get("[data-equation-finish]").trigger("click");
  await flushPromises();
  expect(sheet.drawings![0]).toMatchObject({
    text: "x+y",
    shapeFrame: source.shapeFrame,
    shapeProperties: source.shapeProperties,
  });
  expect(sheet.drawings![0]).not.toHaveProperty("anchor");
  expect(serializeWorkbook(current.session.workbook).version).toBe(76);
  expect(current.session.history.undoStack).toHaveLength(history + 1);
  expect(cb.commit()).toBe(false);
  current.undo();
  await flushPromises();
  expect(sheet.drawings![0]).toEqual(source);
  current.redo();
  await flushPromises();
  const changed = toRaw(sheet.drawings![0]!);
  await wrapper.get(`[data-sheet-drawing-id="${source.id}"]`).trigger("keydown", { key: "F2" });
  await flushPromises();
  expect(toRaw(current.equationEdit.snapshot.value!.source)).toBe(changed);
  expect(current.equationEdit.snapshot.value!.sourceText).toBe("x+y");
});

test.each([false, true])(
  "real Workspace opaque Equation startup, finish, edit and reopen retain raw source (canonical=%s)",
  async (canonical) => {
    const { wrapper, current } = await fixture([equationSource(canonical, false)]);
    const sheet = getActiveSheet(current.session.workbook),
      source = toRaw(sheet.drawings![0]!);
    const before = serializeWorkbook(current.session.workbook),
      history = current.session.history.undoStack.length;
    await wrapper.get(`[data-sheet-drawing-id="${source.id}"]`).trigger("keydown", { key: "F2" });
    await flushPromises();
    expect(toRaw(current.equationEdit.snapshot.value!.source)).toBe(source);
    expect(current.equationEdit.snapshot.value!.mode).toBe("latex");
    expect(wrapper.get("[data-equation-source-editor]").element).toHaveProperty(
      "value",
      "  x + 1  ",
    );
    await wrapper.get("[data-equation-finish]").trigger("click");
    await flushPromises();
    expect(serializeWorkbook(current.session.workbook)).toEqual(before);
    expect(current.session.history.undoStack).toHaveLength(history);
    await wrapper.get(`[data-sheet-drawing-id="${source.id}"]`).trigger("keydown", { key: "F2" });
    await flushPromises();
    await wrapper.get("[data-equation-source-editor]").setValue("  z + 2  ");
    await wrapper.get("[data-equation-finish]").trigger("click");
    await flushPromises();
    expect(sheet.drawings![0]).toMatchObject({ text: "  z + 2  " });
    expect(sheet.drawings![0]).not.toHaveProperty("equationDocument");
    if (isFramedEquationDrawing(source))
      expect(sheet.drawings![0]).toMatchObject({
        shapeFrame: source.shapeFrame,
        shapeProperties: source.shapeProperties,
      });
    expect(current.session.history.undoStack).toHaveLength(history + 1);
    await wrapper.get(`[data-sheet-drawing-id="${source.id}"]`).trigger("keydown", { key: "F2" });
    await flushPromises();
    expect(current.equationEdit.snapshot.value!.mode).toBe("latex");
    expect(current.equationEdit.snapshot.value!.sourceText).toBe("  z + 2  ");
  },
);

const ownedMathPath = ["math-owner", "math-inner", "existing-equation"] as const;
function ownedEquationSource(structured = true) {
  const framed = equationSource(true, structured) as SheetFramedEquationDrawing;
  const { shapeFrame: _frame, ...appearance } = framed;
  const groupFrame = {
    kind: "shape-group-local-v1" as const,
    rect: { xRatio: 0.1, yRatio: 0.1, widthRatio: 0.7, heightRatio: 0.6 },
  };
  const math: SheetGroupedEquationDrawing = {
    ...appearance,
    groupFrame,
    rotation: 5,
    equationFlipX: true,
    equationFlipY: true,
  };
  return normalizeShapeGroup({
    kind: "shapeGroup",
    id: "math-owner",
    name: "Math owner",
    rotation: 20,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: {
        mode: "fixed",
        x: 24,
        y: 24,
        size: { width: 400, height: 240 },
      },
    },
    shapeProperties: { locked: false, printObject: false, altTitle: "Math owner" },
    members: [
      {
        kind: "shapeGroup",
        id: "math-inner",
        name: "Math inner",
        rotation: 30,
        groupFrame,
        members: [math, { ...math, id: "equation-sibling", name: "Equation sibling" }],
      },
    ],
  });
}
function ownedMath(root: ShapeGroupDrawing, path: readonly string[] = ownedMathPath) {
  const source = findShapeGroupNode(root, path)!.node;
  if (!isSheetGroupedEquationDrawing(source)) throw new Error("Expected owned Equation.");
  return source;
}
async function openOwnedEquation(wrapper: VueWrapper, path: readonly string[] = ownedMathPath) {
  expect(wrapper.getComponent(SheetDrawingLayer).vm.selectObjectPaths([path])).toBe(true);
  await nextTick();
  await wrapper.get(`[data-sheet-drawing-id="${path.at(-1)}"]`).trigger("keydown", { key: "F2" });
  await flushPromises();
}

test.each([true, false])(
  "real Workspace owned Equation F2/finish/reopen retains exact mathematical owner and source mode (structured=%s)",
  async (structured) => {
    const { wrapper, current } = await fixture([ownedEquationSource(structured)]);
    const sheet = getActiveSheet(current.session.workbook),
      root = toRaw(sheet.drawings![0]!) as ShapeGroupDrawing;
    const source = ownedMath(root),
      before = serializeWorkbook(current.session.workbook);
    const history = current.session.history.undoStack.length;
    await openOwnedEquation(wrapper);
    expect(toRaw(current.equationEdit.snapshot.value!.root)).toBe(root);
    expect(toRaw(current.equationEdit.snapshot.value!.source)).toBe(source);
    expect(current.equationEdit.snapshot.value!.ownerId).toBe(source.id);
    expect(current.equationEdit.snapshot.value!.path).toEqual(ownedMathPath);
    expect(current.equationEdit.snapshot.value!.mode).toBe(structured ? "structured" : "latex");
    expect(current.drawingActions.dialog.value).toBeUndefined();
    expect(
      wrapper.getComponent(EquationCanvasEditor).get(".equation-canvas-editor").attributes("style"),
    ).toContain("rotate(235deg)");
    await wrapper.get("[data-equation-finish]").trigger("click");
    await flushPromises();
    expect(serializeWorkbook(current.session.workbook)).toEqual(before);
    expect(current.session.history.undoStack).toHaveLength(history);
    await openOwnedEquation(wrapper);
    const oldCallbacks = current.equationEdit.callbacks.value!;
    const editor = wrapper.getComponent(EquationCanvasEditor);
    await editor
      .get(structured ? "input[data-equation-slot]" : "[data-equation-source-editor]")
      .setValue(structured ? "x+y" : "  z + 2  ");
    await flushPromises();
    expect(toRaw(sheet.drawings![0]!)).toBe(root);
    expect(current.session.history.undoStack).toHaveLength(history);
    await wrapper.get("[data-equation-finish]").trigger("click");
    await flushPromises();
    const changed = toRaw(sheet.drawings![0]!) as ShapeGroupDrawing,
      changedSource = ownedMath(changed);
    expect(changedSource).toMatchObject({
      kind: "equation",
      text: structured ? "x+y" : "  z + 2  ",
      groupFrame: source.groupFrame,
      rotation: source.rotation,
      equationFlipX: true,
      equationFlipY: true,
      shapeProperties: source.shapeProperties,
    });
    expect(changed.shapeFrame).toEqual(root.shapeFrame);
    expect(changed.shapeProperties).toEqual(root.shapeProperties);
    expect(ownedMath(changed, ["math-owner", "math-inner", "equation-sibling"])).toEqual(
      ownedMath(root, ["math-owner", "math-inner", "equation-sibling"]),
    );
    if (structured)
      expect(changedSource.text).toBe(serializeEquationDocument(changedSource.equationDocument!));
    else expect(changedSource).not.toHaveProperty("equationDocument");
    expect(serializeWorkbook(current.session.workbook).version).toBe(77);
    expect(current.session.history.undoStack).toHaveLength(history + 1);
    expect(oldCallbacks.commit()).toBe(false);
    current.undo();
    await flushPromises();
    expect(sheet.drawings![0]).toEqual(root);
    current.redo();
    await flushPromises();
    await openOwnedEquation(wrapper);
    expect(toRaw(current.equationEdit.snapshot.value!.root)).toBe(toRaw(sheet.drawings![0]!));
    expect(current.equationEdit.snapshot.value!.mode).toBe(structured ? "structured" : "latex");
    expect(current.equationEdit.snapshot.value!.sourceText).toBe(structured ? "x+y" : "  z + 2  ");
  },
);

test("real Workspace owned private Undo stays inline and switching mathematical siblings finishes the old root once", async () => {
  const { wrapper, current } = await fixture([ownedEquationSource()]);
  const sheet = getActiveSheet(current.session.workbook),
    before = serializeWorkbook(current.session.workbook);
  const history = current.session.history.undoStack.length;
  await openOwnedEquation(wrapper);
  await wrapper.getComponent(EquationCanvasEditor).get("input[data-equation-slot]").setValue("x+y");
  await flushPromises();
  await wrapper
    .getComponent(EquationCanvasEditor)
    .get("input[data-equation-slot]")
    .trigger("keydown", { key: "z", ctrlKey: true });
  await flushPromises();
  expect(current.equationEdit.snapshot.value!.sourceText).toBe("x");
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  await wrapper
    .getComponent(EquationCanvasEditor)
    .get("input[data-equation-slot]")
    .trigger("keydown", { key: "y", ctrlKey: true });
  await flushPromises();
  expect(current.equationEdit.snapshot.value!.sourceText).toBe("x+y");
  const oldCallbacks = current.equationEdit.callbacks.value!;
  const siblingPath = ["math-owner", "math-inner", "equation-sibling"];
  await openOwnedEquation(wrapper, siblingPath);
  expect(current.equationEdit.snapshot.value!.ownerId).toBe("equation-sibling");
  expect(current.equationEdit.snapshot.value!.sourceText).toBe("x");
  expect(ownedMath(sheet.drawings![0] as ShapeGroupDrawing).text).toBe("x+y");
  expect(current.session.history.undoStack).toHaveLength(history + 1);
  expect(oldCallbacks.isActive()).toBe(false);
  oldCallbacks.cancel();
  expect(current.equationEdit.snapshot.value!.ownerId).toBe("equation-sibling");
});

test.each([true, false])(
  "real Workspace owned IME preserves source, then rejects late composition from replaced ownership (structured=%s)",
  async (structured) => {
    const { wrapper, current } = await fixture([ownedEquationSource(structured)]);
    const sheet = getActiveSheet(current.session.workbook),
      before = serializeWorkbook(current.session.workbook);
    const history = current.session.history.undoStack.length;
    await openOwnedEquation(wrapper);
    const editor = wrapper.getComponent(EquationCanvasEditor);
    const input = editor.get(
      structured ? "input[data-equation-slot]" : "[data-equation-source-editor]",
    );
    await input.trigger("compositionstart");
    await input.setValue("partial");
    await wrapper.get("[data-equation-finish]").trigger("click");
    await flushPromises();
    expect(current.equationEdit.snapshot.value!.composing).toBe(true);
    expect(serializeWorkbook(current.session.workbook)).toEqual(before);
    expect(current.session.history.undoStack).toHaveLength(history);
    const callbacks = current.equationEdit.callbacks.value!;
    const root = toRaw(sheet.drawings![0]!) as ShapeGroupDrawing;
    sheet.drawings = [normalizeShapeGroup(root)];
    expect(callbacks.isActive()).toBe(false);
    await input.trigger("compositionend", { data: "汉" });
    await flushPromises();
    expect(serializeWorkbook(current.session.workbook)).toEqual(before);
    expect(callbacks.commit()).toBe(false);
    expect(current.session.history.undoStack).toHaveLength(history);
  },
);

test("real Workspace F2 reacquires untouched root Equation B after dirty owned A replaces the complete collection", async () => {
  const rootB = {
    ...equationSource(true, true, "b+2"),
    id: "root-equation-b",
    name: "Root Equation B",
  };
  const { wrapper, current } = await fixture([ownedEquationSource(), rootB]);
  const sheet = getActiveSheet(current.session.workbook);
  const before = serializeWorkbook(current.session.workbook);
  const precommitB = toRaw(sheet.drawings![1]!);
  const untouchedB = structuredClone(precommitB);
  const history = current.session.history.undoStack.length;
  await openOwnedEquation(wrapper);
  await wrapper.getComponent(EquationCanvasEditor).get("input[data-equation-slot]").setValue("a+1");
  await flushPromises();
  const oldCallbacks = current.equationEdit.callbacks.value!;
  expect(toRaw(sheet.drawings![1]!)).toBe(precommitB);
  expect(current.session.history.undoStack).toHaveLength(history);

  await wrapper.get('[data-sheet-drawing-id="root-equation-b"]').trigger("keydown", { key: "F2" });
  await flushPromises();
  const currentB = toRaw(sheet.drawings![1]!);
  expect(currentB).not.toBe(precommitB);
  expect(currentB).toEqual(untouchedB);
  expect(ownedMath(toRaw(sheet.drawings![0]!) as ShapeGroupDrawing).text).toBe("a+1");
  expect(current.session.history.undoStack).toHaveLength(history + 1);
  expect(current.equationEdit.snapshot.value!.ownerId).toBe("root-equation-b");
  expect(toRaw(current.equationEdit.snapshot.value!.source)).toBe(currentB);
  expect(current.equationEdit.snapshot.value!.sourceText).toBe("b+2");
  expect(current.equationEdit.snapshot.value!.path).toBeUndefined();
  expect(current.equationEdit.snapshot.value!.view.equationDocument).toEqual(
    currentB.kind === "equation" ? currentB.equationDocument : undefined,
  );
  expect(oldCallbacks.isActive()).toBe(false);
  expect(oldCallbacks.commit()).toBe(false);
  oldCallbacks.cancel();
  expect(current.equationEdit.snapshot.value!.ownerId).toBe("root-equation-b");
  await wrapper.get("[data-equation-finish]").trigger("click");
  await flushPromises();
  expect(current.session.history.undoStack).toHaveLength(history + 1);
  expect(sheet.drawings![1]).toEqual(untouchedB);
  current.undo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
});

test("real Workspace delayed root Equation F2 refuses a sheet switch after committing its old owned draft", async () => {
  const rootB = { ...equationSource(true, true, "b+2"), id: "root-equation-b" };
  const { wrapper, current } = await fixture([ownedEquationSource(), rootB]);
  const sheet = getActiveSheet(current.session.workbook);
  const other = getActiveSheet(createWorkbook({ id: "other-math", sheetId: "other-math-sheet" }));
  other.drawings = [{ ...equationSource(true, true, "other+3"), id: "root-equation-b" }];
  current.session.workbook.sheets.set(other.id, other);
  const untouchedOther = structuredClone(other.drawings);
  const untouchedB = structuredClone(toRaw(sheet.drawings![1]!));
  const history = current.session.history.undoStack.length;
  await openOwnedEquation(wrapper);
  await wrapper.getComponent(EquationCanvasEditor).get("input[data-equation-slot]").setValue("a+1");
  await flushPromises();
  const oldCallbacks = current.equationEdit.callbacks.value!;

  wrapper
    .get('[data-sheet-drawing-id="root-equation-b"]')
    .element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }),
    );
  expect(ownedMath(toRaw(sheet.drawings![0]!) as ShapeGroupDrawing).text).toBe("a+1");
  expect(current.session.history.undoStack).toHaveLength(history + 1);
  const navigation = current as ReturnType<typeof state> & { selectSheet(id: string): void };
  navigation.selectSheet(other.id);
  await flushPromises();

  expect(getActiveSheet(current.session.workbook).id).toBe(other.id);
  expect(current.equationEdit.snapshot.value).toBeUndefined();
  expect(wrapper.findComponent(EquationCanvasEditor).exists()).toBe(false);
  expect(sheet.drawings![1]).toEqual(untouchedB);
  expect(other.drawings).toEqual(untouchedOther);
  expect(current.session.history.undoStack).toHaveLength(history + 1);
  expect(oldCallbacks.commit()).toBe(false);
  expect(oldCallbacks.source("late source")).toBe(false);
});

test.each(["replacement", "in-place-source"] as const)(
  "real Workspace delayed root Equation F2 refuses a %s owner change after its old owned draft commits",
  async (change) => {
    const rootB = { ...equationSource(true, true, "b+2"), id: "root-equation-b" };
    const { wrapper, current } = await fixture([ownedEquationSource(), rootB]);
    const sheet = getActiveSheet(current.session.workbook);
    const history = current.session.history.undoStack.length;
    await openOwnedEquation(wrapper);
    await wrapper
      .getComponent(EquationCanvasEditor)
      .get("input[data-equation-slot]")
      .setValue("a+1");
    await flushPromises();
    const oldCallbacks = current.equationEdit.callbacks.value!;

    wrapper
      .get('[data-sheet-drawing-id="root-equation-b"]')
      .element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }),
      );
    expect(ownedMath(toRaw(sheet.drawings![0]!) as ShapeGroupDrawing).text).toBe("a+1");
    expect(current.session.history.undoStack).toHaveLength(history + 1);
    if (change === "replacement") {
      sheet.drawings = [
        sheet.drawings![0]!,
        { ...equationSource(true, true, "changed+3"), id: "root-equation-b" },
      ];
    } else {
      const changed = sheet.drawings![1]!;
      if (changed.kind !== "equation") throw new Error("Expected current root Equation B.");
      const document = structuredClone(toRaw(changed.equationDocument!));
      document.body.children = [{ id: "value", kind: "text", value: "changed+3" }];
      changed.equationDocument = document;
      changed.text = serializeEquationDocument(document);
    }
    const afterExternalChange = serializeWorkbook(current.session.workbook);
    await flushPromises();

    expect(current.equationEdit.snapshot.value).toBeUndefined();
    expect(wrapper.findComponent(EquationCanvasEditor).exists()).toBe(false);
    expect(serializeWorkbook(current.session.workbook)).toEqual(afterExternalChange);
    expect(current.session.history.undoStack).toHaveLength(history + 1);
    expect(oldCallbacks.commit()).toBe(false);
    expect(oldCallbacks.source("late source")).toBe(false);
  },
);
