import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { createWorkbookSession } from "@sheetcraft/core/history";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import ShapeFormatPane from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import PicturePaintEditor from "../../../modules/sheet-images/components/format-pane/PicturePaintEditor.vue";
import PictureLineEditor from "../../../modules/sheet-images/components/format-pane/PictureLineEditor.vue";
import PictureTextureGallery from "../../../modules/sheet-images/components/format-pane/PictureTextureGallery.vue";
import PanelSelect from "../../../shared/panel-select/PanelSelect.vue";
import {
  changePictureGradientKind,
  createPictureGradientPaint,
} from "../../../modules/sheet-images/picture-paint-edit";
import { createPictureLine } from "../../../modules/sheet-images/picture-effect-edit";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import * as measurement from "../../../modules/sheet-drawings/shape-text-measure";
import * as textPaint from "../../../modules/sheet-drawings/shape-text-paint";
import * as groupPaint from "../../../modules/sheet-drawings/shape-group-paint";
import * as imagePreparation from "../../../modules/image-assets/prepareImageAsset";
import * as textureSource from "../../../modules/sheet-images/picture-texture";
import { actualPng } from "../../modules/image-assets/image-header-fixtures";

const mounted: VueWrapper[] = [];
type SelectWrapper = Pick<
  VueWrapper<InstanceType<typeof TSelect>>,
  "get" | "findAll" | "props"
>;
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  textPaint.clearShapeTextPaintCache();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function nativeBoundary() {
  // Only the native font metrics and final Canvas alpha acceptance port are
  // supplied. Numeric paint plans, preparation, owner leases, Workspace watches,
  // character history and Core document commands remain real. Pixel rendering
  // and alpha budgets are covered by the dedicated pure paint tests.
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
  return normalizeSheetDrawing({
    ...appearance,
    kind: "textBox",
    text: "alpha beta",
    rotation: 17,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x, y: 24, size: { width: 240, height: 120 } },
    },
  }) as SheetFramedGraphicDrawing;
}
async function fixture() {
  nativeBoundary();
  const bytes = new Blob([new Uint8Array(actualPng)], { type: "image/png" });
  vi.spyOn(textureSource, "createPictureTextureBlob").mockResolvedValue(bytes);
  vi.spyOn(imagePreparation, "prepareImageAsset").mockResolvedValue({
    id: `image-${"a".repeat(64)}`,
    mimeType: "image/png",
    width: 1,
    height: 1,
    blob: bytes,
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:closed-gallery-source");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue();
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(1);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(1);
  const book = createWorkbook({ id: "closed-gallery", sheetId: "shapes" });
  const box = textBox("box", 80),
    sibling = textBox("sibling", 350);
  box.shapeStyle = {
    fill: {
      kind: "value",
      value: changePictureGradientKind(createPictureGradientPaint(), "radial"),
    },
    line: { kind: "value", value: createPictureLine() },
  };
  getActiveSheet(book).drawings = [box, sibling];
  const before = serializeWorkbook(book);
  const wrapper = mount(SpreadsheetWorkspace, {
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
  const current = (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    session: ReturnType<typeof createWorkbookSession>;
    sheetGridRef: {
      selectShapeObjects(paths: readonly (readonly string[])[]): boolean;
      getSelectedShapeObjects(): readonly (readonly string[])[];
    };
  };
  expect(current.sheetGridRef.selectShapeObjects([["box"]])).toBe(true);
  await flushPromises();
  await wrapper.get('[data-shape-control="format"]').trigger("click");
  await flushPromises();
  const pane = wrapper.getComponent(ShapeFormatPane);
  await pane.get('[role="tab"][id$="fill-line-tab"]').trigger("click");
  const editor = pane
    .findAllComponents(PicturePaintEditor)
    .find((item) => item.props("ownerKey").endsWith(":shape:fill"))!;
  await choose(editor.getComponent(TSelect), "Picture or texture fill");
  const picture = serializeWorkbook(current.session.workbook);
  expect(current.session.history.undoStack).toHaveLength(1);
  expect(getActiveSheet(current.session.workbook).drawings![0]).toMatchObject({
    shapeStyle: { fill: { kind: "value", value: { kind: "picture" } } },
  });
  return { wrapper, current, pane, editor, before, picture };
}
async function settle() {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
}
async function choose(select: SelectWrapper, label: string) {
  for (const trigger of select.findAll(".t-input__wrap, .t-input"))
    vi.spyOn(trigger.element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 128, 28),
    );
  await select.get(".t-input").trigger("click");
  await vi.waitFor(() => expect(select.props("popupVisible")).toBe(true));
  const attach = select.props("popupProps")?.attach;
  if (typeof attach !== "function") throw new TypeError("Expected a popup attachment callback.");
  const host = attach();
  if (!(host instanceof HTMLElement)) throw new TypeError("Expected an HTML popup host.");
  await vi.waitFor(() => expect(host.querySelector("li.t-select-option")).not.toBeNull());
  const option = [...host.querySelectorAll<HTMLElement>("li.t-select-option")].find(
    (item) => item.textContent?.trim() === label,
  )!;
  expect(option).toBeDefined();
  option.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
  );
  option.click();
  await settle();
}
async function openGallery(editor: Pick<VueWrapper, "getComponent">) {
  const gallery = editor.getComponent(PictureTextureGallery).getComponent(PanelSelect);
  for (const trigger of gallery.findAll(".t-input__wrap, .t-input"))
    vi.spyOn(trigger.element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 128, 28),
    );
  const input = gallery.get<HTMLInputElement>('input[role="combobox"]');
  input.element.focus();
  await input.trigger("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });
  await settle();
  expect(gallery.get("input").attributes("aria-expanded")).toBe("true");
  return gallery;
}
async function closeGallery(gallery: Pick<VueWrapper, "get">) {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
  await settle();
  const input = gallery.get<HTMLInputElement>('input[role="combobox"]');
  expect(input.attributes("aria-expanded")).toBe("false");
  expect(input.element.readOnly).toBe(true);
  expect(document.activeElement).toBe(input.element);
  return input.element;
}
function history(target: Element, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

test("texture gallery Escape returns a real readonly trigger that undoes picture mode to radial", async () => {
  const f = await fixture();
  const gallery = await openGallery(f.editor);
  const input = await closeGallery(gallery);
  const modeId = f.editor.getComponent(TSelect).get("input").element.id;
  expect(history(document.activeElement!).defaultPrevented).toBe(true);
  await settle();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.before);
  expect(f.current.session.history.undoStack).toHaveLength(0);
  expect(f.current.session.history.redoStack).toHaveLength(1);
  expect(input.isConnected).toBe(false); // The picture-only gallery legitimately disappears.
  expect(document.activeElement?.id).toBe(modeId);
  expect((document.activeElement as HTMLInputElement).readOnly).toBe(true);
  expect(history(document.activeElement!, { key: "y" }).defaultPrevented).toBe(true);
  await settle();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.picture);
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
}, 15000);

test("a surviving texture gallery routes Undo and Redo after Escape and preserves native exclusions", async () => {
  const f = await fixture();
  await choose(f.pane.getComponent(PictureLineEditor).findAllComponents(TSelect)[0]!, "No line");
  const changed = serializeWorkbook(f.current.session.workbook);
  const modeId = f.editor.getComponent(TSelect).get("input").element.id;
  const gallery = await openGallery(f.editor);
  const openState = serializeWorkbook(f.current.session.workbook);
  expect(history(document.activeElement!).defaultPrevented).toBe(false);
  expect(history(gallery.get("input").element).defaultPrevented).toBe(false);
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(openState);
  const input = await closeGallery(gallery);
  await gallery.get("input").trigger("compositionstart");
  expect(history(input).defaultPrevented).toBe(false);
  await gallery.get("input").trigger("compositionend");
  expect(history(input, { isComposing: true }).defaultPrevented).toBe(false);
  expect(history(input, { keyCode: 229 } as KeyboardEventInit).defaultPrevented).toBe(false);
  const editable = f.pane
    .findAll<HTMLInputElement>("input")
    .find((item) => !item.element.readOnly && !item.element.disabled)!;
  editable.element.focus();
  expect(history(document.activeElement!).defaultPrevented).toBe(false);
  input.focus();
  expect(history(document.activeElement!).defaultPrevented).toBe(true);
  await settle();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.picture);
  expect(document.activeElement?.id).toBe(modeId);
  expect((document.activeElement as HTMLInputElement).readOnly).toBe(true);
  expect(history(document.activeElement!, { key: "y" }).defaultPrevented).toBe(true);
  await settle();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(changed);
  expect(f.current.session.history.undoStack).toHaveLength(2);
}, 15000);

test("a closed gallery from the previous selected owner cannot undo after the exact object path changes", async () => {
  const f = await fixture();
  const input = await closeGallery(await openGallery(f.editor));
  expect(f.current.sheetGridRef.selectShapeObjects([["sibling"]])).toBe(true);
  const switched = serializeWorkbook(f.current.session.workbook);
  expect(history(input).defaultPrevented).toBe(false);
  await settle();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(switched);
  expect(f.current.session.history.undoStack).toHaveLength(1);
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["sibling"]]);
}, 15000);

test.each(["external focus", "owner"] as const)(
  "gallery history focus fallback respects a newer %s",
  async (boundary) => {
    const f = await fixture();
    await closeGallery(await openGallery(f.editor));
    const mode = f.editor.getComponent(TSelect).get<HTMLInputElement>("input").element;
    const focus = vi.spyOn(mode, "focus");
    expect(history(document.activeElement!).defaultPrevented).toBe(true);
    if (boundary === "owner")
      expect(f.current.sheetGridRef.selectShapeObjects([["sibling"]])).toBe(true);
    const elsewhere = document.createElement("input");
    document.body.append(elsewhere);
    elsewhere.focus();
    await settle();
    if (boundary === "owner")
      expect(document.activeElement?.getAttribute("data-sheet-drawing-id")).toBe("sibling");
    else expect(document.activeElement).toBe(elsewhere);
    expect(focus).not.toHaveBeenCalled();
  },
  15000,
);
