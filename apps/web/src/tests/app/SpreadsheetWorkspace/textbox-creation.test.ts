import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import ShapeCanvasTextEditor from "../../../modules/sheet-drawings/components/ShapeCanvasTextEditor.vue";
import DrawingEditorDialog from "../../../modules/sheet-drawings/components/DrawingEditorDialog.vue";
import { SHAPE_GALLERY } from "../../../modules/sheet-drawings/shape-gallery";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import * as measurement from "../../../modules/sheet-drawings/shape-text-measure";
import type { useShapeCreation } from "../../../modules/sheet-drawings/useShapeCreation";
import type { useShapeTextEditSession } from "../../../modules/sheet-drawings/useShapeTextEditSession";

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function state(wrapper: VueWrapper) {
  return (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    session: { workbook: ReturnType<typeof createWorkbook> };
    shapeCreation: ReturnType<typeof useShapeCreation>;
    shapeTextEdit: ReturnType<typeof useShapeTextEditSession>;
    shapeInteractionBlocked: boolean;
    undo(): void;
    redo(): void;
  };
}
async function fixture(workbook = createWorkbook({ id: "textbox", sheetId: "textbox-sheet" })) {
  // Supply only native measurements absent from the DOM test environment.
  // Workspace setup, watches, owner guards, editing and Core history stay real.
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
function choice(direction: "horizontal" | "vertical") {
  return SHAPE_GALLERY.flatMap((group) => group.items).find(
    (item) => item.kind === "textBox" && item.direction === direction,
  )!;
}
function storedTextBox(current: ReturnType<typeof state>) {
  const drawing = getActiveSheet(current.session.workbook).drawings?.[0];
  if (!drawing || drawing.kind !== "textBox") throw new Error("Expected stored TextBox");
  return drawing;
}
test.each(["horizontal", "vertical"] as const)(
  "%s one-shot TextBox creation immediately opens the real editor on the stored root",
  async (direction) => {
    const { wrapper, current } = await fixture();
    await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
    await wrapper.get('[data-insert-tool="text-box"]').trigger("click");
    document.body.querySelector<HTMLElement>(`[data-text-box-direction="${direction}"]`)!.click();
    await flushPromises();
    expect(current.shapeCreation.request.value?.choice).toEqual(choice(direction));
    expect(wrapper.findComponent(DrawingEditorDialog).exists()).toBe(false);
    const request = current.shapeCreation.request.value!;
    expect(current.shapeCreation.commit(request, request.base)).toBe(true);
    await flushPromises();
    const stored = storedTextBox(current);
    expect(stored.kind).toBe("textBox");
    expect(stored.text).toBe("");
    expect(stored).toMatchObject({
      fill: "#ffffff",
      stroke: "#bcbcbc",
      strokeWidth: 1,
      fontSize: (11 * 96) / 72,
      color: "#000000",
      bold: false,
      italic: false,
      shapeFrame: { anchor: { mode: "move-and-size" } },
      shapeText: {
        fontFamily: current.session.workbook.theme.bodyFont,
        layout: {
          direction: direction === "vertical" ? "vertical-rl" : "horizontal",
          blockAlignment: "start",
          wrap: true,
          overflow: false,
          autoFit: "none",
          marginsPt: { leftPt: 7.2, rightPt: 7.2, topPt: 3.6, bottomPt: 3.6 },
        },
        paragraph: { alignment: "left" },
      },
    });
    expect(current.shapeTextEdit.snapshot.value?.root).toBe(stored);
    const input = wrapper.getComponent(ShapeCanvasTextEditor).get("[data-shape-rich-text-input]");
    expect(document.activeElement).toBe(input.element);
    await input.trigger("beforeinput", { inputType: "insertText", data: "alpha" });
    expect(stored.text).toBe("");
    expect(current.shapeTextEdit.snapshot.value?.draftText).toBe("alpha");
    await input.trigger("keydown", { key: "Enter", ctrlKey: true });
    await flushPromises();
    expect(storedTextBox(current).text).toBe("alpha");
    expect(serializeWorkbook(current.session.workbook).version).toBe(60);
    current.undo();
    expect(storedTextBox(current).text).toBe("");
    current.undo();
    expect(getActiveSheet(current.session.workbook).drawings ?? []).toEqual([]);
    current.redo();
    current.redo();
    expect(storedTextBox(current).text).toBe("alpha");
  },
);

test("continuous TextBox creation retains drawing mode instead of opening the source editor", async () => {
  const { wrapper, current } = await fixture();
  expect(current.shapeCreation.start(choice("vertical"), true)).toBe(true);
  const request = current.shapeCreation.request.value!;
  expect(current.shapeCreation.commit(request, request.base)).toBe(true);
  await flushPromises();
  expect(current.shapeCreation.request.value?.continuous).toBe(true);
  expect(current.shapeTextEdit.snapshot.value).toBeUndefined();
  expect(wrapper.findComponent(ShapeCanvasTextEditor).exists()).toBe(false);
  current.shapeCreation.cancel();
});
test.each(["newer start then cancel", "modal", "protection", "undo", "unmount"] as const)(
  "pending TextBox autoedit is inert after %s",
  async (change) => {
    const { wrapper, current } = await fixture();
    expect(current.shapeCreation.start(choice("horizontal"), false)).toBe(true);
    const request = current.shapeCreation.request.value!;
    expect(current.shapeCreation.commit(request, request.base)).toBe(true);
    if (change === "newer start then cancel") {
      expect(current.shapeCreation.start(choice("vertical"), false)).toBe(true);
      current.shapeCreation.cancel();
    }
    if (change === "modal") current.shapeInteractionBlocked = true;
    if (change === "protection")
      getActiveSheet(current.session.workbook).properties.protected = true;
    if (change === "undo") current.undo();
    if (change === "unmount") wrapper.unmount();
    await flushPromises();
    expect(current.shapeTextEdit.snapshot.value).toBeUndefined();
    expect(getActiveSheet(current.session.workbook).drawings ?? []).toHaveLength(
      change === "undo" ? 0 : 1,
    );
  },
);
test("rejected and cancelled creation never open an editor or dirty history", async () => {
  const { wrapper, current } = await fixture();
  const before = serializeWorkbook(current.session.workbook);
  expect(current.shapeCreation.start(choice("horizontal"), false)).toBe(true);
  const request = current.shapeCreation.request.value!;
  expect(current.shapeCreation.commit(request, { ...request.base, kind: "shape" })).toBe(false);
  current.shapeCreation.cancel();
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value).toBeUndefined();
  expect(wrapper.findComponent(ShapeCanvasTextEditor).exists()).toBe(false);
  current.undo();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
});
test("explicit source Cancel preserves only the creation transaction", async () => {
  const { wrapper, current } = await fixture();
  current.shapeCreation.start(choice("horizontal"), false);
  const request = current.shapeCreation.request.value!;
  current.shapeCreation.commit(request, request.base);
  await flushPromises();
  const editor = wrapper.getComponent(ShapeCanvasTextEditor);
  await editor
    .get("[data-shape-rich-text-input]")
    .trigger("beforeinput", { inputType: "insertText", data: "not applied" });
  editor.props("cancel")();
  await flushPromises();
  expect(storedTextBox(current).text).toBe("");
  current.undo();
  expect(getActiveSheet(current.session.workbook).drawings ?? []).toEqual([]);
});

test("saved legacy TextBox appearance and placement are unchanged by the new insertion defaults", async () => {
  const workbook = createWorkbook({ id: "legacy-textbox", sheetId: "legacy-sheet" });
  const legacy = createGraphicDrawing("legacy-box", "textBox", "old", { row: 2, column: 3 });
  delete legacy.shapeText;
  Object.assign(legacy, {
    fill: "transparent",
    stroke: "#2563eb",
    strokeWidth: 0,
    color: "#1e3a8a",
    fontSize: 20,
    text: "saved text",
    textDirection: "vertical",
  });
  getActiveSheet(workbook).drawings = [legacy];
  const before = serializeWorkbook(workbook);
  const { current } = await fixture(workbook);
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  expect(current.shapeTextEdit.snapshot.value).toBeUndefined();
  current.undo();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
});
