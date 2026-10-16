import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
} from "@sheetcraft/core/workbook";
import { normalizeSheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import ShapeTextRibbonTools from "../../../modules/sheet-drawings/components/ShapeTextRibbonTools.vue";
import ShapeRibbonFontSizeField from "../../../modules/sheet-drawings/components/ShapeRibbonFontSizeField.vue";
import FontFormatField from "../../../shared/cell-text/FontFormatField.vue";
import { resolveShapeDrawing } from "../../../modules/sheet-drawings/resolved-shape-drawing";
import ShapeCanvasTextEditor from "../../../modules/sheet-drawings/components/ShapeCanvasTextEditor.vue";
import SheetSurface from "../../../modules/sheet-grid/components/SheetSurface.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import type { useShapeTextEditSession } from "../../../modules/sheet-drawings/useShapeTextEditSession";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import {
  readTextDomSelection,
  writeTextDomSelection,
} from "../../../shared/cell-editing/text-dom-selection";
import * as measurement from "../../../modules/sheet-drawings/shape-text-measure";

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
const backwards = { start: 1, end: 5, direction: "backward" as const };
function textBox(id: string, x: number) {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _width,
    height: _height,
    ...appearance
  } = createGraphicDrawing(id, "textBox", "alpha beta", { row: 0, column: 0 });
  return normalizeSheetDrawing({
    ...appearance,
    kind: "textBox",
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x, y: 80, size: { width: 200, height: 100 } },
    },
  });
}
function state(wrapper: VueWrapper) {
  return (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    session: { workbook: ReturnType<typeof createWorkbook>; history: { undoStack: unknown[] } };
    shapeTextEdit: ReturnType<typeof useShapeTextEditSession>;
    selectedShapeObjectPaths: readonly (readonly string[])[];
  };
}
async function fixture() {
  vi.spyOn(measurement, "getBrowserShapeTextMeasurement").mockReturnValue({
    measurer: {
      measure: (text) => text.length * 8,
      measureMetrics: (text) => ({
        width: text.length * 8,
        ascent: 12,
        descent: 4,
        inkLeft: 0,
        inkRight: text.length * 8,
      }),
    },
    resolveNormalLineMetrics: () => ({
      metrics: { ascent: 12, descent: 4, lineAdvance: 16 },
      policy: "provided-native",
    }),
  });
  const workbook = createWorkbook({
    id: "native-text-transitions",
    sheetId: "owner",
    sheetName: "Owner",
  });
  getActiveSheet(workbook).drawings = [textBox("first", 40), textBox("second", 320)];
  const other = createSheet("Other", "other");
  other.drawings = [textBox("other-box", 40)];
  insertSheet(workbook, other);
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
  const current = state(wrapper),
    workspace = wrapper.get<HTMLElement>(".spreadsheet-workspace").element;
  const first = wrapper.get<HTMLElement>('[data-sheet-drawing-id="first"]').element;
  first.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }));
  await flushPromises();
  const editor = wrapper
    .getComponent(ShapeCanvasTextEditor)
    .get<HTMLElement>("[data-shape-rich-text-input]").element;
  writeTextDomSelection(editor, backwards);
  editor.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }));
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value!.selection).toEqual(backwards);
  const id = current.shapeTextEdit.snapshot.value!.sessionId,
    callbacks = current.shapeTextEdit.callbacks(id);
  return { wrapper, current, workspace, editor, id, callbacks };
}
function pointer(
  target: HTMLElement,
  type = "pointerdown",
  coordinates = { clientX: 0, clientY: 0 },
) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 73,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: type === "pointerdown" ? 1 : 0,
    ...coordinates,
  });
  target.dispatchEvent(event);
  return event;
}
async function activate(target: HTMLElement) {
  const event = pointer(target);
  if (!event.defaultPrevented) target.focus();
  pointer(target, "pointerup");
  target.click();
  await flushPromises();
  return event;
}
function objectPointer(f: Awaited<ReturnType<typeof fixture>>, id: string, x: number) {
  const layer = f.wrapper.getComponent(SheetDrawingLayer),
    props = layer.props();
  const translation = getPicturePaneTranslation("body", props.layout),
    box = layer.element.getBoundingClientRect();
  const coordinates = {
    clientX: box.left + (x + translation.x) * props.scale,
    clientY: box.top + (100 + translation.y) * props.scale,
  };
  const target = layer.get<HTMLElement>(`[data-sheet-drawing-id="${id}"]`).element;
  expect(f.workspace.contains(target)).toBe(true);
  const down = pointer(target, "pointerdown", coordinates);
  window.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId: 73,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      ...coordinates,
    }),
  );
  return { target, down };
}
function cellPointer(f: Awaited<ReturnType<typeof fixture>>, address = { row: 14, column: 7 }) {
  const surface = f.wrapper.getComponent(SheetSurface),
    frame = surface.props("frame");
  const rect = frame.layout.getCellViewportRect(address);
  if (!rect) throw new Error("The real test cell must be visible in the current frame");
  const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]").element;
  const bounds = canvas.getBoundingClientRect();
  const coordinates = {
    clientX: bounds.left + (frame.body.x + rect.x + rect.width / 2) * frame.scale,
    clientY: bounds.top + (frame.body.y + rect.y + rect.height / 2) * frame.scale,
  };
  const down = pointer(canvas, "pointerdown", coordinates);
  window.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId: 73,
      pointerType: "mouse",
      button: 0,
      ...coordinates,
    }),
  );
  return down;
}
async function field(f: Awaited<ReturnType<typeof fixture>>, kind: "size" | "margin") {
  if (kind === "margin") {
    await activate(f.wrapper.get<HTMLElement>('[data-ribbon-category="shape"]').element);
    await activate(f.wrapper.get<HTMLElement>('[data-shape-control="format"]').element);
    await activate(f.wrapper.get<HTMLElement>('[data-ribbon-category="shape-text"]').element);
    expect(f.current.shapeTextEdit.snapshot.value).toMatchObject({
      sessionId: f.id,
      selection: backwards,
    });
    expect(f.current.session.history.undoStack).toHaveLength(0);
  }
  return f.wrapper.get<HTMLInputElement>(
    kind === "size"
      ? '[data-ribbon-group="shape-font"] input[data-shape-format-field="fontSizePt"]'
      : '[data-shape-format-pane] input[data-shape-format-field="textMarginLeftPt"]',
  );
}
function firstStored(f: Awaited<ReturnType<typeof fixture>>) {
  return f.current.session.workbook.sheets
    .get("owner")!
    .drawings!.find((drawing) => drawing.id === "first")!;
}

describe("native text context and owner transitions in real Workspace", () => {
  test("non-editing selected textbox keeps its owner through Text/Drawing tabs, while grid clears it", async () => {
    const f = await fixture();
    expect(f.callbacks.commit()).toBe(true);
    await flushPromises();
    expect(f.current.shapeTextEdit.snapshot.value).toBeUndefined();
    objectPointer(f, "first", 60);
    await flushPromises();
    expect(f.current.selectedShapeObjectPaths).toEqual([["first"]]);
    const before = serializeWorkbook(f.current.session.workbook);
    for (const category of ["shape-text", "shape", "shape-text"]) {
      await activate(f.wrapper.get<HTMLElement>(`[data-ribbon-category="${category}"]`).element);
      expect(f.current.selectedShapeObjectPaths).toEqual([["first"]]);
      expect(f.current.shapeTextEdit.snapshot.value).toBeUndefined();
      expect(
        f.wrapper.get(`[data-ribbon-category="${category}"]`).attributes("aria-selected"),
      ).toBe("true");
    }
    expect(f.current.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.current.session.workbook)).toEqual(before);
    // The real cell handler normally prevents native default while accepting selection.
    expect(cellPointer(f).defaultPrevented).toBe(true);
    await flushPromises();
    expect(f.wrapper.getComponent(SheetSurface).props("activeCell")).toEqual({
      row: 14,
      column: 7,
    });
    expect(f.current.selectedShapeObjectPaths).toEqual([]);
    expect(f.wrapper.find("[data-shape-format-trigger]").exists()).toBe(false);
    expect(f.wrapper.find("[data-shape-resize]").exists()).toBe(false);
    expect(f.wrapper.find('[data-ribbon-category="shape-text"]').exists()).toBe(false);
  });

  test("invalid text field blocks the same real H15 cell pointer before cell selection or shape deselection", async () => {
    const f = await fixture(),
      control = await field(f, "size");
    const beforeCell = f.wrapper.getComponent(SheetSurface).props("activeCell");
    const before = serializeWorkbook(f.current.session.workbook);
    control.element.focus();
    await control.setValue("invalid draft");
    expect(cellPointer(f).defaultPrevented).toBe(true);
    await flushPromises();
    expect(f.wrapper.getComponent(SheetSurface).props("activeCell")).toEqual(beforeCell);
    expect(f.current.selectedShapeObjectPaths).toEqual([["first"]]);
    expect(f.current.shapeTextEdit.snapshot.value).toMatchObject({
      sessionId: f.id,
      sourceId: "first",
      selection: backwards,
    });
    expect(control.element.value).toBe("invalid draft");
    expect(document.activeElement).toBe(control.element);
    expect(f.current.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.current.session.workbook)).toEqual(before);
  });

  test("Drawing↔Text pointer/focus/click preserves the backwards range and creates no Core command", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.current.session.workbook);
    for (const category of ["shape", "shape-text", "shape", "shape-text"]) {
      const target = f.wrapper.get<HTMLElement>(`[data-ribbon-category="${category}"]`).element;
      expect(pointer(target).defaultPrevented).toBe(false);
      target.focus();
      pointer(target, "pointerup");
      target.click();
      await flushPromises();
      expect(
        f.wrapper.get(`[data-ribbon-category="${category}"]`).attributes("aria-selected"),
      ).toBe("true");
      expect(f.current.shapeTextEdit.snapshot.value).toMatchObject({
        sessionId: f.id,
        selection: backwards,
      });
      expect(f.current.session.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.current.session.workbook)).toEqual(before);
    }
    f.editor.focus();
    expect(readTextDomSelection(f.editor)).toEqual(backwards);
    await activate(f.wrapper.get<HTMLElement>('[data-shape-ribbon-action="bold"]').element);
    expect(f.current.shapeTextEdit.snapshot.value!.draftView.shapeText!.characterRuns).toEqual([
      { start: 1, end: 5, bold: true },
    ]);
    expect(f.current.shapeTextEdit.snapshot.value!.selection).toEqual(backwards);
    expect(f.current.session.history.undoStack).toHaveLength(0);
  });

  test.each(["size", "margin"] as const)(
    "dirty %s flushes before selecting another TextBox, and old callbacks cannot write its new lease",
    async (kind) => {
      const f = await fixture(),
        control = await field(f, kind);
      control.element.focus();
      await control.setValue(kind === "size" ? "24." : "15.");
      const observations: Array<{
        stage: string;
        active: boolean;
        history: number;
        drawing: ReturnType<typeof firstStored>;
      }> = [];
      const observe = (stage: string) =>
        observations.push({
          stage,
          active: !!f.current.shapeTextEdit.snapshot.value,
          history: f.current.session.history.undoStack.length,
          drawing: firstStored(f),
        });
      const capture = () => observe("capture");
      f.workspace.addEventListener("pointerdown", capture, { capture: true, once: true });
      const blur = vi.fn(() => observe("blur"));
      control.element.addEventListener("blur", blur);
      const selected = objectPointer(f, "second", 340);
      expect(blur).toHaveBeenCalledOnce();
      expect(observations.map(({ stage }) => stage)).toEqual(["capture", "blur"]);
      for (const observation of observations) {
        expect(observation).toMatchObject({ active: false, history: 1 });
        if (kind === "size")
          expect(observation.drawing).toMatchObject({
            shapeText: { characterRuns: [{ start: 1, end: 5, fontSize: 32 }] },
          });
        else
          expect(observation.drawing).toMatchObject({
            shapeText: { layout: { marginsPt: { leftPt: 15 } } },
          });
      }
      expect(f.current.shapeTextEdit.snapshot.value).toBeUndefined();
      expect(f.current.session.history.undoStack).toHaveLength(1);
      await flushPromises();
      expect(f.current.selectedShapeObjectPaths).toEqual([["second"]]);
      const first = firstStored(f);
      if (kind === "size")
        expect(first).toMatchObject({
          shapeText: { characterRuns: [{ start: 1, end: 5, fontSize: 32 }] },
        });
      else expect(first).toMatchObject({ shapeText: { layout: { marginsPt: { leftPt: 15 } } } });
      // Continue through a real object keyboard event after the pointer selection.
      const second = f.wrapper.get<HTMLElement>('[data-sheet-drawing-id="second"]').element;
      second.focus();
      second.dispatchEvent(
        new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }),
      );
      await flushPromises();
      const next = f.current.shapeTextEdit.snapshot.value!;
      expect(next.sourceId).toBe("second");
      expect(next.sessionId).not.toBe(f.id);
      const beforeOldEvents = serializeWorkbook(f.current.session.workbook),
        draft = next.draftView;
      expect(f.callbacks.update("late first input")).toBe(false);
      expect(f.callbacks.editField("fontSizePt", 80)).toBe(false);
      expect(f.callbacks.setMargins({ leftPt: 99, rightPt: 99, topPt: 99, bottomPt: 99 })).toBe(
        false,
      );
      expect(f.callbacks.historyStep("undo")).toBe(false);
      expect(f.callbacks.commit()).toBe(false);
      expect(f.current.shapeTextEdit.snapshot.value!.draftView).toBe(draft);
      expect(serializeWorkbook(f.current.session.workbook)).toEqual(beforeOldEvents);
      expect(f.current.session.history.undoStack).toHaveLength(1);
      expect(selected.target.dataset.sheetDrawingId).toBe("second");
    },
  );

  test.each(["size", "margin"] as const)(
    "dirty %s flushes on native sheet-tab pointerdown before switching sheets",
    async (kind) => {
      const f = await fixture(),
        control = await field(f, kind);
      control.element.focus();
      await control.setValue(kind === "size" ? "24." : "15.");
      const target = f.wrapper
        .findAll<HTMLElement>(".workbook-sheet-tabs__tab")
        .find((tab) => tab.text() === "Other")!.element;
      expect(f.workspace.contains(target)).toBe(true);
      const blur = vi.fn();
      control.element.addEventListener("blur", blur);
      expect(pointer(target).defaultPrevented).toBe(false);
      expect(blur).not.toHaveBeenCalled();
      expect(f.current.shapeTextEdit.snapshot.value).toBeUndefined();
      expect(f.current.session.history.undoStack).toHaveLength(1);
      target.focus();
      pointer(target, "pointerup");
      target.click();
      await flushPromises();
      expect(f.current.session.workbook.activeSheetId).toBe("other");
      if (kind === "size")
        expect(firstStored(f)).toMatchObject({
          shapeText: { characterRuns: [{ start: 1, end: 5, fontSize: 32 }] },
        });
      else
        expect(firstStored(f)).toMatchObject({
          shapeText: { layout: { marginsPt: { leftPt: 15 } } },
        });
      expect(f.callbacks.commit()).toBe(false);
      expect(f.current.session.history.undoStack).toHaveLength(1);
      const otherBox = getActiveSheet(f.current.session.workbook).drawings![0]!;
      if (otherBox.kind !== "textBox") throw Error("Expected the Other sheet TextBox");
      expect(otherBox.text).toBe("alpha beta");
    },
  );
  test.each([
    ["size", "object"],
    ["margin", "object"],
    ["size", "sheet"],
    ["margin", "sheet"],
  ] as const)(
    "invalid %s draft blocks native %s transition without changing lease, backwards selection or history",
    async (kind, destination) => {
      const f = await fixture(),
        control = await field(f, kind),
        before = serializeWorkbook(f.current.session.workbook);
      control.element.focus();
      await control.setValue("invalid draft");
      if (destination === "object") {
        expect(objectPointer(f, "second", 340).down.defaultPrevented).toBe(true);
      } else {
        const target = f.wrapper
          .findAll<HTMLElement>(".workbook-sheet-tabs__tab")
          .find((tab) => tab.text() === "Other")!.element;
        expect(pointer(target).defaultPrevented).toBe(true);
        target.click();
      }
      await flushPromises();
      expect(f.current.session.workbook.activeSheetId).toBe("owner");
      expect(f.current.shapeTextEdit.snapshot.value).toMatchObject({
        sessionId: f.id,
        sourceId: "first",
        selection: backwards,
      });
      expect(f.current.selectedShapeObjectPaths).toEqual([["first"]]);
      expect(document.activeElement).toBe(control.element);
      expect(control.element.value).toBe("invalid draft");
      expect(f.current.session.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.current.session.workbook)).toEqual(before);
    },
  );
});

async function selectedOwnerFixture() {
  const f = await fixture();
  expect(f.callbacks.commit()).toBe(true);
  await flushPromises();
  objectPointer(f, "first", 60);
  await flushPromises();
  await activate(f.wrapper.get<HTMLElement>('[data-ribbon-category="shape-text"]').element);
  expect(f.current.shapeTextEdit.snapshot.value).toBeUndefined();
  expect(f.current.selectedShapeObjectPaths).toEqual([["first"]]);
  const snapshot = f.wrapper.getComponent(ShapeTextRibbonTools).props("snapshot")!;
  expect(snapshot.owner.sessionId).toMatch(/^shape-owner-/);
  return { ...f, selectedOwner: snapshot.owner.sessionId };
}

describe("selected-owner formatting field navigation", () => {
  test("valid selected-owner size commits once before real H15 selection and one native Undo restores it", async () => {
    const f = await selectedOwnerFixture(),
      control = await field(f, "size");
    const before = serializeWorkbook(f.current.session.workbook);
    control.element.focus();
    await control.setValue("19.5");
    expect(f.current.session.history.undoStack).toHaveLength(0);
    cellPointer(f);
    await flushPromises();
    expect(f.wrapper.getComponent(SheetSurface).props("activeCell")).toEqual({
      row: 14,
      column: 7,
    });
    expect(f.current.selectedShapeObjectPaths).toEqual([]);
    expect(f.current.session.history.undoStack).toHaveLength(1);
    const metrics = f.wrapper.getComponent(SheetDrawingLayer).props("metrics")!;
    expect(resolveShapeDrawing(firstStored(f), metrics).view).toMatchObject({ fontSize: 26 });
    f.wrapper
      .getComponent(SheetSurface)
      .get("[data-sheet-surface]")
      .element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }),
      );
    await flushPromises();
    expect(f.current.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.current.session.workbook)).toEqual(before);
  });

  test("invalid selected-owner size blocks real H15 and focuses its exact retained field", async () => {
    const f = await selectedOwnerFixture(),
      control = await field(f, "size");
    const before = serializeWorkbook(f.current.session.workbook),
      cell = f.wrapper.getComponent(SheetSurface).props("activeCell");
    control.element.focus();
    await control.setValue("bad");
    expect(cellPointer(f).defaultPrevented).toBe(true);
    await flushPromises();
    expect(f.wrapper.getComponent(SheetSurface).props("activeCell")).toEqual(cell);
    expect(f.current.selectedShapeObjectPaths).toEqual([["first"]]);
    expect(f.wrapper.getComponent(ShapeTextRibbonTools).props("snapshot")!.owner.sessionId).toBe(
      f.selectedOwner,
    );
    expect(control.element.value).toBe("bad");
    expect(document.activeElement).toBe(control.element);
    expect(f.current.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.current.session.workbook)).toEqual(before);
  });

  test("clean selected-owner IME composition blocks real H15 until composition ends", async () => {
    const f = await selectedOwnerFixture(),
      control = await field(f, "size");
    const before = serializeWorkbook(f.current.session.workbook),
      cell = f.wrapper.getComponent(SheetSurface).props("activeCell");
    control.element.focus();
    control.element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    expect(cellPointer(f).defaultPrevented).toBe(true);
    await flushPromises();
    expect(f.wrapper.getComponent(SheetSurface).props("activeCell")).toEqual(cell);
    expect(f.current.selectedShapeObjectPaths).toEqual([["first"]]);
    expect(document.activeElement).toBe(control.element);
    expect(serializeWorkbook(f.current.session.workbook)).toEqual(before);
    control.element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    cellPointer(f);
    await flushPromises();
    expect(f.wrapper.getComponent(SheetSurface).props("activeCell")).toEqual({
      row: 14,
      column: 7,
    });
    expect(f.current.selectedShapeObjectPaths).toEqual([]);
    expect(f.current.session.history.undoStack).toHaveLength(0);
  });

  test("current selected-owner field and body popup keep the draft, then context switching flushes without deselecting", async () => {
    const f = await selectedOwnerFixture(),
      control = await field(f, "size");
    const sizeField = f.wrapper
      .getComponent(ShapeRibbonFontSizeField)
      .getComponent(FontFormatField);
    control.element.focus();
    await control.setValue("19.");
    expect(pointer(control.element).defaultPrevented).toBe(false);
    expect(f.current.selectedShapeObjectPaths).toEqual([["first"]]);
    await flushPromises();
    expect(f.current.selectedShapeObjectPaths).toEqual([["first"]]);
    const arrow = sizeField.get<HTMLElement>(".font-format-field__arrow").element;
    // This control deliberately prevents mousedown focus transfer, matching a real click.
    expect(pointer(arrow).defaultPrevented).toBe(false);
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    arrow.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
    pointer(arrow, "pointerup");
    arrow.click();
    await flushPromises();
    expect(arrow.getAttribute("aria-expanded")).toBe("true");
    const id = sizeField.get(".font-format-field__arrow").attributes("aria-controls");

    await vi.waitFor(() => expect(document.getElementById(id!)).not.toBeNull(), { timeout: 2000 });
    const popup = document.getElementById(id!)!;
    expect(f.workspace.contains(popup)).toBe(false);
    expect(pointer(popup!).defaultPrevented).toBe(false);
    await flushPromises();
    expect(control.element.value).toBe("19.");
    expect(f.current.session.history.undoStack).toHaveLength(0);
    expect(f.current.selectedShapeObjectPaths).toEqual([["first"]]);
    await activate(f.wrapper.get<HTMLElement>('[data-ribbon-category="shape"]').element);
    expect(f.current.selectedShapeObjectPaths).toEqual([["first"]]);
    expect(f.current.shapeTextEdit.snapshot.value).toBeUndefined();
    expect(f.current.session.history.undoStack).toHaveLength(1);
    await activate(f.wrapper.get<HTMLElement>('[data-ribbon-category="shape-text"]').element);
    expect((await field(f, "size")).element.value).toBe("19");
    expect(f.current.session.history.undoStack).toHaveLength(1);
  });
});
