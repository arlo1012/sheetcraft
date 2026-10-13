import { DOMWrapper, mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select } from "tdesign-vue-next/es/select";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellValue,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { isShapeGroupDrawing, type SheetGroupedGraphicDrawing } from "@sheetcraft/core/shape-group";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import type { WorkbookSession } from "@sheetcraft/core/history";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import ShapeGroupDetailedContent from "../../../modules/sheet-drawings/components/ShapeGroupDetailedContent.vue";
import ShapeToolsToolbar from "../../../modules/sheet-drawings/components/ShapeToolsToolbar.vue";
import ShapeFormatPane from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import ShapeCanvasTextEditor from "../../../modules/sheet-drawings/components/ShapeCanvasTextEditor.vue";
import TextBoxReferenceDialog from "../../../modules/sheet-drawings/components/TextBoxReferenceDialog.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import RangeReferencePicker from "../../../shared/range-reference/RangeReferencePicker.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { triggerCanvasCell } from "../canvas-interaction";
import * as measurement from "../../../modules/sheet-drawings/shape-text-measure";
import * as textPaint from "../../../modules/sheet-drawings/shape-text-paint";
import * as groupPaint from "../../../modules/sheet-drawings/shape-group-paint";
import type { useShapeTextEditSession } from "../../../modules/sheet-drawings/useShapeTextEditSession";

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  textPaint.clearShapeTextPaintCache();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function workspaceState(wrapper: VueWrapper) {
  return (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    session: WorkbookSession;
    shapeTextEdit: ReturnType<typeof useShapeTextEditSession>;
    sheetGridRef: {
      selectShapeObjects(paths: readonly (readonly string[])[]): boolean;
      getSelectedShapeObjects(): readonly (readonly string[])[];
    };
    executeCommand(command: WorkbookCommand): boolean;
    undo(): void;
    redo(): void;
    selectSheet(id: string): void;
    saveError: string | undefined;
    textBoxReferencePickerCallbacks: { confirm(): void; cancel(): void };
  };
}
function nativeBoundary() {
  // Only native font metrics and the final native Canvas alpha acceptance port
  // are supplied, as in textbox-formatting.test.ts. Workspace init, watches,
  // rendering projections, owner leases, dialogs, commands and history are real.
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
  vi.spyOn(textPaint, "preflightShapeTextGlyphBudgets").mockImplementation((options) => {
    const plan = textPaint.planShapeTextPaint(options);
    if (plan.kind !== "ready")
      return {
        kind: "unavailable",
        reason: plan.reason,
        missingAssetIds: [...plan.missingAssetIds],
      };
    return {
      kind: "ready",
      proof: "numeric-source",
      actualDensity: plan.actualDensity,
      estimatedPeakBytes: plan.estimatedPeakBytes,
      contourCount: 0,
      edgeCount: 0,
      pointCount: 0,
      glyphCommandCount: 0,
    };
  });
  vi.spyOn(groupPaint, "preflightShapeGroupPaint").mockImplementation((options) =>
    groupPaint.planShapeGroupPaint(options),
  );
}
function textBox(id: string, x: number): SheetFramedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _width,
    height: _height,
    ...appearance
  } = createGraphicDrawing(id, "textBox", id, { row: 0, column: 0 });
  const shapeText = createDefaultShapeText();
  shapeText.layout.autoFit = "resize-shape";
  shapeText.characterRuns = [{ start: 0, end: 5, fontSize: 28 }];
  return normalizeSheetDrawing({
    ...appearance,
    kind: "textBox",
    text: "alpha beta",
    rotation: 17,
    bold: true,
    color: "#123456",
    shapeText,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x, y: 24, size: { width: 240, height: 120 } },
    },
  }) as SheetFramedGraphicDrawing;
}
function workbook(owned = false) {
  const book = createWorkbook({ id: "textbox-reference", sheetId: "owner", sheetName: "Summary" }),
    sheet = getActiveSheet(book),
    source = createSheet("Source data", "source"),
    target = textBox("box", 80),
    sibling = textBox("sibling", 350);
  setCellValue(sheet, { row: 0, column: 0 }, 0.125);
  setCellStyle(
    sheet,
    { row: 0, column: 0 },
    {
      numberFormat: { kind: "percent", fractionDigits: 1 },
      textColor: "#FF0000",
      fontSize: 42,
    },
  );
  setCellValue(sheet, { row: 1, column: 1 }, "picked B2");
  setCellValue(source, { row: 0, column: 0 }, "cross-sheet source");
  insertSheet(book, source);
  book.activeSheetId = sheet.id;
  sheet.drawings = owned
    ? groupShapeRoots(
        [target, sibling],
        [target.id, sibling.id],
        { id: "group", name: "Owned TextBoxes" },
        createPictureSheetMetrics(sheet),
      )
    : [target, sibling];
  return book;
}
async function fixture(book = workbook()) {
  nativeBoundary();
  const before = serializeWorkbook(book),
    wrapper = mount(SpreadsheetWorkspace, {
      attachTo: document.body,
      props: {
        workbookStore: {
          load: async () => ({ revision: 1, savedAt: 1, snapshot: before }),
          save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
          replace: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        },
        imageAssetStore: createMemoryImageAssetStore(),
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
  mounted.push(wrapper);
  await flushPromises();
  const current = workspaceState(wrapper);
  expect(current.saveError).toBeUndefined();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
  return { wrapper, current, before };
}
function target(current: ReturnType<typeof workspaceState>, id = "box") {
  const roots = current.session.workbook.sheets.get("owner")!.drawings!,
    root = roots[0]!;
  const source = isShapeGroupDrawing(root)
    ? root.members.find((node) => node.id === id)
    : roots.find((node) => node.id === id);
  if (!source || source.kind !== "textBox") throw Error("Expected a real stored TextBox owner");
  return source as SheetFramedGraphicDrawing | SheetGroupedGraphicDrawing;
}
function geometry(source: ReturnType<typeof target>) {
  return {
    frame: "shapeFrame" in source ? source.shapeFrame : source.groupFrame,
    rotation: source.rotation,
    shape: source.shape,
    shapeGeometry: source.shapeGeometry,
    shapePath: source.shapePath,
  };
}
function object(wrapper: VueWrapper, id = "box") {
  return wrapper.getComponent(SheetDrawingLayer).get(`[data-sheet-drawing-id="${id}"]`);
}
async function openReference(wrapper: VueWrapper, id = "box") {
  // The real object keyboard context-menu entrance avoids pretending HappyDOM
  // has glyph-hit pixels. The menu itself is native, visible and actually clicked.
  const owner = object(wrapper, id);
  expect(owner.isVisible()).toBe(true);
  const current = workspaceState(wrapper);
  const root = current.session.workbook.sheets.get("owner")!.drawings![0]!;
  const path = isShapeGroupDrawing(root) ? [root.id, id] : [id];
  expect(current.sheetGridRef.selectShapeObjects([path])).toBe(true);
  await flushPromises();
  expect(current.sheetGridRef.getSelectedShapeObjects()).toEqual([path]);
  await object(wrapper, id).trigger("keydown", { key: "ContextMenu" });
  await flushPromises();
  const item = [
    ...document.querySelectorAll<HTMLElement>(
      '[role="menu"][aria-label="Shape actions"] [role="menuitem"]',
    ),
  ].find((element) => element.textContent?.trim() === "Insert referenced cell…");
  expect(item).toBeDefined();
  expect(new DOMWrapper(item!).isVisible()).toBe(true);
  expect(item!.getAttribute("aria-disabled")).toBe("false");
  await new DOMWrapper(item!).trigger("click");
  await flushPromises();
  const dialog = wrapper.getComponent(TextBoxReferenceDialog);
  expect(dialog.getComponent(Dialog).props("visible")).toBe(true);
  expect(dialog.props("request").name).toBe(id);
  expect(dialog.props("request").isCurrent()).toBe(true);
  expect(new DOMWrapper(referencePanel()).isVisible()).toBe(true);
  expect(wrapper.get(".spreadsheet-workspace__grid").attributes("inert")).toBeDefined();
  return dialog;
}
function referencePanel(): HTMLElement {
  const panel = document.querySelector<HTMLElement>("[data-textbox-reference-dialog]");
  if (!panel) throw Error("Missing visible TextBox reference dialog");
  return panel;
}
async function dialogButton(label: string) {
  const panel = referencePanel().closest(".t-dialog")!;
  const button = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() === label,
  );
  expect(button, `Missing real dialog button: ${label}`).toBeDefined();
  expect(button!.disabled).toBe(false);
  await new DOMWrapper(button!).trigger("click");
  await flushPromises();
}
async function sourceInput(dialog: Pick<VueWrapper, "getComponent">, value: string) {
  await dialog.getComponent(RangeReferenceInput).get("input").setValue(value);
  await flushPromises();
}
function paintedText(wrapper: VueWrapper, owned: boolean, id = "box") {
  const groupContent = wrapper.findComponent(ShapeGroupDetailedContent);
  if (owned && groupContent.exists()) {
    const pass = groupContent.props("renderPass");
    expect(pass).toBeDefined();
    const leaf = pass!.getLeaf(id)!;
    expect(leaf.textReference).toMatchObject({ status: "ready" });
    return leaf.paintView!.text;
  }
  const content = wrapper
    .findAllComponents(DrawingContent)
    .find((component) => component.props("drawing").id === id)!;
  expect(content).toBeDefined();
  expect(content.props("drawing")).toMatchObject({
    kind: "textBox",
    text: "",
    textReference: expect.any(Object),
  });
  expect(content.props("textReferenceUnavailable")).toBe(false);
  expect(content.props("paintDrawing")).toBeDefined();
  return content.props("paintDrawing")!.text;
}
async function changeSource(current: ReturnType<typeof workspaceState>, value: string) {
  expect(
    current.executeCommand({
      type: "setCellContents",
      changes: [
        { sheetId: "owner", address: { row: 0, column: 0 }, content: { kind: "literal", value } },
      ],
    }),
  ).toBe(true);
  await flushPromises();
}

test.each([false, true])(
  "visible reference menu validates, cancels replacement, then binds exactly one TextBox with full Undo/Redo (owned=%s)",
  async (owned) => {
    const { wrapper, current, before } = await fixture(workbook(owned));
    const original = clone(target(current)),
      sibling = clone(target(current, "sibling"));
    const originalGeometry = clone(geometry(original));
    let dialog = await openReference(wrapper);
    expect(referencePanel().textContent).toContain(
      "Linking replaces the current text and local character formatting",
    );
    expect(dialog.props("request").replacesContent).toBe(true);
    await sourceInput(dialog, "A1:B2");
    await dialogButton("Replace text and link");
    expect(referencePanel().querySelector('[role="alert"]')?.textContent).toContain(
      "Enter a single valid cell",
    );
    expect(serializeWorkbook(current.session.workbook)).toEqual(before);
    await sourceInput(dialog, "A1:A1");
    await dialogButton("Replace text and link");
    expect(referencePanel().querySelector('[role="alert"]')?.textContent).toContain(
      "Enter a single valid cell",
    );
    expect(serializeWorkbook(current.session.workbook)).toEqual(before);
    await sourceInput(dialog, "=SUM(A1:B2)");
    await dialogButton("Replace text and link");
    expect(serializeWorkbook(current.session.workbook)).toEqual(before);
    await sourceInput(dialog, "A1");
    expect(
      referencePanel().querySelector(".textbox-reference-dialog__preview")?.textContent,
    ).toContain("12.5%");
    await dialogButton("Cancel");
    expect(wrapper.findComponent(TextBoxReferenceDialog).exists()).toBe(false);
    expect(serializeWorkbook(current.session.workbook)).toEqual(before);
    expect(current.session.history.undoStack).toHaveLength(0);
    dialog = await openReference(wrapper);
    await sourceInput(dialog, "Summary!$A$1");
    await dialogButton("Replace text and link");
    expect(wrapper.findComponent(TextBoxReferenceDialog).exists()).toBe(false);
    const linked = target(current);
    expect(linked.text).toBe("");
    expect(linked.textReference).toEqual({ sheetId: "owner", cell: { row: 0, column: 0 } });
    expect(linked.shapeText?.characterRuns).toBeUndefined();
    expect(linked.bold).toBe(original.bold);
    expect(linked.color).toBe(original.color);
    expect(linked.shapeText?.layout).toEqual(original.shapeText?.layout);
    expect(geometry(linked)).toEqual(originalGeometry);
    expect(target(current, "sibling")).toEqual(sibling);
    expect(paintedText(wrapper, owned)).toBe("12.5%");
    expect(current.session.history.undoStack).toHaveLength(1);
    const linkedSnapshot = serializeWorkbook(current.session.workbook);
    current.undo();
    await flushPromises();
    expect(serializeWorkbook(current.session.workbook)).toEqual(before);
    current.redo();
    await flushPromises();
    expect(serializeWorkbook(current.session.workbook)).toEqual(linkedSnapshot);
    expect(paintedText(wrapper, owned)).toBe("12.5%");
  },
);

test.each([false, true])(
  "source commands refresh only paint, keep AutoFit frame/history stable, and F2 unlink retains current display (owned=%s)",
  async (owned) => {
    const { wrapper, current } = await fixture(workbook(owned));
    const dialog = await openReference(wrapper);
    await sourceInput(dialog, "A1");
    await dialogButton("Replace text and link");
    const storedLinked = clone(target(current)),
      linkedHistory = clone(current.session.history.undoStack);
    const sourceValue = "current value " + "long enough to require many wrapped lines ".repeat(12);
    await changeSource(current, sourceValue);
    expect(target(current)).toEqual(storedLinked);
    expect(paintedText(wrapper, owned)).toBe(sourceValue);
    expect(current.session.history.undoStack).toHaveLength(2);
    expect(current.session.history.undoStack[0]).toEqual(linkedHistory[0]);
    const updated = serializeWorkbook(current.session.workbook);
    await object(wrapper).trigger("keydown", { key: "F2" });
    await flushPromises();
    expect(wrapper.findComponent(ShapeCanvasTextEditor).exists()).toBe(false);
    expect(current.shapeTextEdit.snapshot.value).toBeUndefined();
    const sourceDialog = wrapper.getComponent(TextBoxReferenceDialog);
    expect(sourceDialog.props("request").linked).toBe(true);
    expect(referencePanel().textContent).toContain(
      "This text box displays a cell. Change the source cell or unlink it to edit the text.",
    );
    expect(
      sourceDialog.getComponent(RangeReferenceInput).get<HTMLInputElement>("input").element.value,
    ).toBe("A1");
    expect(
      referencePanel().querySelector(".textbox-reference-dialog__preview")?.textContent,
    ).toContain(sourceValue);
    expect(current.session.history.undoStack).toHaveLength(2);
    await dialogButton("Unlink and keep displayed text");
    expect(target(current).textReference).toBeUndefined();
    expect(target(current).text).toBe(sourceValue);
    expect(geometry(target(current))).toEqual(geometry(storedLinked));
    expect(current.session.history.undoStack).toHaveLength(3);
    const unlinked = serializeWorkbook(current.session.workbook);
    current.undo();
    await flushPromises();
    expect(serializeWorkbook(current.session.workbook)).toEqual(updated);
    expect(paintedText(wrapper, owned)).toBe(sourceValue);
    current.redo();
    await flushPromises();
    expect(serializeWorkbook(current.session.workbook)).toEqual(unlinked);
    current.undo();
    current.undo();
    await flushPromises();
    expect(target(current)).toEqual(storedLinked);
    expect(paintedText(wrapper, owned)).toBe("12.5%");
    expect(current.session.history.undoStack).toHaveLength(1);
  },
);

test("source-sheet selector links a bare A1 cross-sheet while keeping the target sheet and object selected", async () => {
  const { wrapper, current } = await fixture();
  const dialog = await openReference(wrapper);
  const select = dialog.getComponent(Select);
  for (const element of select.findAll(".t-input__wrap, .t-input"))
    vi.spyOn(element.element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 260, 32),
    );
  await select.get("input").trigger("click");
  await flushPromises();
  await vi.waitFor(() => {
    expect(
      [...document.querySelectorAll<HTMLElement>(".t-select-option")].some(
        (option) => option.textContent?.trim() === "Source data",
      ),
    ).toBe(true);
  });
  const choice = [...document.querySelectorAll<HTMLElement>(".t-select-option")].find(
    (option) => option.textContent?.trim() === "Source data",
  )!;
  await new DOMWrapper(choice).trigger("click");
  await sourceInput(dialog, "A1");
  expect(
    referencePanel().querySelector(".textbox-reference-dialog__preview")?.textContent,
  ).toContain("cross-sheet source");
  await dialogButton("Replace text and link");
  expect(current.session.workbook.activeSheetId).toBe("owner");
  expect(target(current).textReference).toEqual({ sheetId: "source", cell: { row: 0, column: 0 } });
  expect(paintedText(wrapper, false)).toBe("cross-sheet source");
  expect(current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
  expect(current.session.history.undoStack).toHaveLength(1);
});

test("retained old dialog confirm and cancel cannot replace or close a newly opened owner", async () => {
  const { wrapper, current, before } = await fixture(workbook(true));
  const old = (await openReference(wrapper)).props("request");
  await dialogButton("Cancel");
  const newest = await openReference(wrapper, "sibling");
  const fresh = newest.props("request");
  expect(fresh.sessionId).not.toBe(old.sessionId);
  expect(await old.confirm("A1", "owner")).toBe(false);
  old.close();
  await flushPromises();
  expect(wrapper.getComponent(TextBoxReferenceDialog).props("request")).toBe(fresh);
  expect(fresh.isCurrent()).toBe(true);
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  await sourceInput(newest, "B2");
  await dialogButton("Replace text and link");
  expect(target(current).textReference).toBeUndefined();
  expect(target(current, "sibling").textReference).toEqual({
    sheetId: "owner",
    cell: { row: 1, column: 1 },
  });
  expect(paintedText(wrapper, true, "sibling")).toBe("picked B2");
  expect(current.session.history.undoStack).toHaveLength(1);
});

test("visible source picker clamps a drag to one cell, cancellation preserves the draft, and choosing adds no history", async () => {
  const { wrapper, current, before } = await fixture(workbook(true));
  const dialog = await openReference(wrapper);
  await sourceInput(dialog, "A1");
  await dialog
    .getComponent(RangeReferenceInput)
    .get("[data-select-formula-reference]")
    .trigger("click");
  await flushPromises();
  expect(dialog.getComponent(Dialog).props("visible")).toBe(false);
  expect(wrapper.get(".spreadsheet-workspace__grid").attributes("inert")).toBeUndefined();
  await triggerCanvasCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 2, column: 3 }, "mousemove", { buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 2, column: 3 }, "mouseup", { button: 0 });
  expect(wrapper.getComponent(RangeReferencePicker).props("reference")).toBe("=Summary!$B$2");
  const pickerRoot = document.querySelector<HTMLElement>(".range-reference-picker")!;
  const cancel = [
    ...pickerRoot.closest(".t-dialog")!.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent?.trim() === "Cancel")!;
  await new DOMWrapper(cancel).trigger("click");
  await flushPromises();
  expect(
    dialog.getComponent(RangeReferenceInput).get<HTMLInputElement>("input").element.value,
  ).toBe("A1");
  expect(wrapper.get(".spreadsheet-workspace__grid").attributes("inert")).toBeDefined();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  await dialog
    .getComponent(RangeReferenceInput)
    .get("[data-select-formula-reference]")
    .trigger("click");
  await flushPromises();
  await triggerCanvasCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 1, column: 1 }, "mouseup", { button: 0 });
  await new DOMWrapper(document.querySelector<HTMLElement>(".range-reference-picker")!).trigger(
    "keydown",
    { key: "Enter" },
  );
  await flushPromises();
  expect(
    dialog.getComponent(RangeReferenceInput).get<HTMLInputElement>("input").element.value,
  ).toBe("=Summary!$B$2");
  expect(current.session.history.undoStack).toHaveLength(0);
  await dialogButton("Replace text and link");
  expect(target(current).textReference).toEqual({ sheetId: "owner", cell: { row: 1, column: 1 } });
  expect(paintedText(wrapper, true)).toBe("picked B2");
  expect(current.session.history.undoStack).toHaveLength(1);
});

test("stale picker callbacks cannot confirm or cancel a replacement dialog's picker", async () => {
  const { wrapper, current, before } = await fixture();
  const oldDialog = await openReference(wrapper);
  await sourceInput(oldDialog, "A1");
  await oldDialog
    .getComponent(RangeReferenceInput)
    .get("[data-select-formula-reference]")
    .trigger("click");
  await flushPromises();
  const oldPickerCallbacks = current.textBoxReferencePickerCallbacks;
  // Close the old picker and dialog through actual UI before opening another
  // owner. The callbacks retained from that old request must remain harmless.
  await new DOMWrapper(document.querySelector<HTMLElement>(".range-reference-picker")!).trigger(
    "keydown",
    { key: "Escape" },
  );
  await flushPromises();
  await dialogButton("Cancel");
  const newDialog = await openReference(wrapper, "sibling");
  expect(wrapper.findComponent(RangeReferencePicker).exists()).toBe(false);
  await sourceInput(newDialog, "B2");
  await newDialog
    .getComponent(RangeReferenceInput)
    .get("[data-select-formula-reference]")
    .trigger("click");
  await flushPromises();
  const newPicker = wrapper.getComponent(RangeReferencePicker);
  oldPickerCallbacks.cancel();
  oldPickerCallbacks.confirm();
  await flushPromises();
  expect(wrapper.getComponent(RangeReferencePicker).props("reference")).toBe(
    newPicker.props("reference"),
  );
  expect(newDialog.getComponent(Dialog).props("visible")).toBe(false);
  expect(
    newDialog.getComponent(RangeReferenceInput).get<HTMLInputElement>("input").element.value,
  ).toBe("B2");
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  await new DOMWrapper(document.querySelector<HTMLElement>(".range-reference-picker")!).trigger(
    "keydown",
    { key: "Escape" },
  );
  await flushPromises();
  expect(newDialog.getComponent(Dialog).props("visible")).toBe(true);
  expect(
    newDialog.getComponent(RangeReferenceInput).get<HTMLInputElement>("input").element.value,
  ).toBe("B2");
});

test("source read restrictions are independent of the protected target's unlocked object permission", async () => {
  const book = workbook(true),
    sheet = getActiveSheet(book),
    source = book.sheets.get("source")!;
  sheet.properties.protected = true;
  sheet.protection = { editableRanges: [], selectLockedCells: false };
  const group = sheet.drawings![0]!;
  if (!isShapeGroupDrawing(group)) throw Error("Expected protected group fixture");
  group.shapeProperties = { locked: false };
  source.properties.protected = true;
  source.protection = { editableRanges: [], selectLockedCells: false, selectUnlockedCells: false };
  const { wrapper, current } = await fixture(book);
  const dialog = await openReference(wrapper);
  await sourceInput(dialog, "'Source data'!A1");
  expect(
    referencePanel().querySelector(".textbox-reference-dialog__preview")?.textContent,
  ).toContain("cross-sheet source");
  await dialogButton("Replace text and link");
  expect(target(current).textReference).toEqual({ sheetId: "source", cell: { row: 0, column: 0 } });
  expect(paintedText(wrapper, true)).toBe("cross-sheet source");
  expect(current.session.history.undoStack).toHaveLength(1);
});

test("a locked target under object protection cannot open the reference menu or mutate history", async () => {
  const book = workbook(true),
    sheet = getActiveSheet(book);
  sheet.properties.protected = true;
  sheet.protection = { editableRanges: [] };
  const group = sheet.drawings![0]!;
  if (!isShapeGroupDrawing(group)) throw Error("Expected protected group fixture");
  // Locked is the Core default; only an unlocked override is stored sparsely.
  delete group.shapeProperties;
  const { wrapper, current, before } = await fixture(book);
  await object(wrapper).trigger("keydown", { key: "ContextMenu" });
  await flushPromises();
  expect(document.querySelector('[role="menu"][aria-label="Shape actions"]')).toBeNull();
  expect(wrapper.findComponent(TextBoxReferenceDialog).exists()).toBe(false);
  await object(wrapper).trigger("keydown", { key: "F2" });
  await flushPromises();
  expect(wrapper.findComponent(ShapeCanvasTextEditor).exists()).toBe(false);
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
});

test("explicit owned TextBox margin formatting fits the current display in one command, while later source refreshes keep that frame", async () => {
  const { wrapper, current } = await fixture(workbook(true));
  const dialog = await openReference(wrapper);
  await sourceInput(dialog, "A1");
  await dialogButton("Replace text and link");
  const initialFrame = clone(geometry(target(current)));
  const display = "current linked words ".repeat(8);
  await changeSource(current, display);
  expect(paintedText(wrapper, true)).toBe(display);
  expect(geometry(target(current))).toEqual(initialFrame);
  const beforeFormat = serializeWorkbook(current.session.workbook);
  expect(current.sheetGridRef.selectShapeObjects([["group", "box"]])).toBe(true);
  await flushPromises();
  const format = wrapper.getComponent(ShapeToolsToolbar).get('[data-shape-control="format"]');
  expect(format.isVisible()).toBe(true);
  await format.trigger("click");
  await flushPromises();
  const pane = wrapper.getComponent(ShapeFormatPane);
  expect(pane.isVisible()).toBe(true);
  expect(pane.props("snapshot")!.drawing.kind).toBe("textBox");
  expect(pane.props("snapshot")!.owner.drawingId).toBe("box");
  await pane.get(".shape-format-pane__modes button:nth-child(2)").trigger("click");
  await pane.get('[role="tab"][id$="text-box-tab"]').trigger("click");
  const margin = pane.get(
    '[role="tabpanel"][id$="text-box-panel"] [data-shape-format-field="textMarginTopPt"] input',
  );
  expect(margin.isVisible()).toBe(true);
  expect(margin.attributes("disabled")).toBeUndefined();
  await margin.setValue("36");
  await margin.trigger("keydown", { key: "Enter" });
  await flushPromises();
  expect(target(current).shapeText?.layout.marginsPt.topPt).toBe(36);
  expect(target(current).shapeText?.layout.autoFit).toBe("resize-shape");
  expect(target(current).text).toBe("");
  expect(target(current).textReference).toEqual({ sheetId: "owner", cell: { row: 0, column: 0 } });
  expect(geometry(target(current))).not.toEqual(initialFrame);
  expect(paintedText(wrapper, true)).toBe(display);
  expect(current.session.history.undoStack).toHaveLength(3);
  const formatted = serializeWorkbook(current.session.workbook);
  const fittedFrame = clone(geometry(target(current)));
  current.undo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(beforeFormat);
  current.redo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(formatted);
  await changeSource(current, "later source content ".repeat(20));
  expect(target(current).text).toBe("");
  expect(target(current).textReference).toEqual({ sheetId: "owner", cell: { row: 0, column: 0 } });
  expect(geometry(target(current))).toEqual(fittedFrame);
  expect(current.session.history.undoStack).toHaveLength(4);
  expect(paintedText(wrapper, true)).toBe("later source content ".repeat(20));
});
