import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { triggerCanvasCell } from "../canvas-interaction";
import { createWorkbook, createSheet, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { createWorkbookSession } from "@sheetcraft/core/history";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import ShapeFormatPane from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import ShapeFormatChoiceField from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatChoiceField.vue";
import PictureReflectionEditor from "../../../modules/sheet-images/components/format-pane/PictureReflectionEditor.vue";
import PictureShadowEditor from "../../../modules/sheet-images/components/format-pane/PictureShadowEditor.vue";
import ShapeLineEndsControls from "../../../modules/sheet-drawings/components/ShapeLineEndsControls.vue";
import ShapeFormatMixedEffect from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatMixedEffect.vue";
import { resolveShapeDrawing } from "../../../modules/sheet-drawings/resolved-shape-drawing";
import { materializeDrawingShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { isShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import PicturePaintEditor from "../../../modules/sheet-images/components/format-pane/PicturePaintEditor.vue";
import * as imagePreparation from "../../../modules/image-assets/prepareImageAsset";
import * as textureSource from "../../../modules/sheet-images/picture-texture";
import { actualPng } from "../../modules/image-assets/image-header-fixtures";
import PictureGradientEditor from "../../../modules/sheet-images/components/format-pane/PictureGradientEditor.vue";
import { createPictureGradientPaint } from "../../../modules/sheet-images/picture-paint-edit";
import PictureLineEditor from "../../../modules/sheet-images/components/format-pane/PictureLineEditor.vue";
import ShapeRibbonLayoutMenu from "../../../modules/sheet-drawings/components/ShapeRibbonLayoutMenu.vue";
import ShapeRibbonStyleMenu from "../../../modules/sheet-drawings/components/ShapeRibbonStyleMenu.vue";
import {
  createPictureLine,
  createPictureShadow,
} from "../../../modules/sheet-images/picture-effect-edit";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import * as measurement from "../../../modules/sheet-drawings/shape-text-measure";
import * as textPaint from "../../../modules/sheet-drawings/shape-text-paint";
import * as groupPaint from "../../../modules/sheet-drawings/shape-group-paint";
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
async function fixture(
  options: { gradient?: boolean; mixedShadow?: boolean; lineEnds?: boolean } = {},
) {
  nativeBoundary();
  const book = createWorkbook({ id: "native-dropdown", sheetId: "shapes" });
  const box = textBox("box", 80),
    sibling = textBox("sibling", 350);
  box.shapeStyle = { line: { kind: "value", value: createPictureLine() } };
  if (options.gradient)
    box.shapeStyle.fill = { kind: "value", value: createPictureGradientPaint() };
  if (options.lineEnds) {
    box.kind = "shape";
    box.shapeGeometry = { preset: "line" };
    box.text = "";
  }
  const sheet = getActiveSheet(book);
  if (options.mixedShadow) {
    const metrics = createPictureSheetMetrics(sheet);
    const boxView = resolveShapeDrawing(box, metrics).view;
    const siblingView = resolveShapeDrawing(sibling, metrics).view;
    if (boxView.kind !== "textBox" || siblingView.kind !== "textBox")
      throw new TypeError("Expected text box projections for mixed shadows.");
    box.shapeText = materializeDrawingShapeText(boxView);
    box.shapeText.style = { ...box.shapeText.style, shadow: { kind: "none" } };
    sibling.shapeText = materializeDrawingShapeText(siblingView);
    sibling.shapeText.style = {
      ...sibling.shapeText.style,
      shadow: { kind: "value", value: createPictureShadow() },
    };
    sheet.drawings = groupShapeRoots(
      [box, sibling],
      ["box", "sibling"],
      { id: "group", name: "Mixed shadows" },
      createPictureSheetMetrics(sheet),
    );
  } else sheet.drawings = [box, sibling];
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
    undo(): void;
    redo(): void;
    selectSheet(id: string): void;
  };
  expect(current.sheetGridRef.selectShapeObjects([[options.mixedShadow ? "group" : "box"]])).toBe(
    true,
  );
  await flushPromises();
  await wrapper.get('[data-shape-control="format"]').trigger("click");
  await flushPromises();
  const pane = wrapper.getComponent(ShapeFormatPane);
  const target = () =>
    getActiveSheet(current.session.workbook).drawings![0] as SheetFramedGraphicDrawing;
  return { wrapper, current, pane, before, target };
}
async function open(select: SelectWrapper, text: string) {
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
    (item) => item.textContent?.trim() === text,
  );
  expect(option, `native option ${text}`).toBeDefined();
  expect(host.parentElement).toBe(document.body);
  return option!;
}
function pointer(option: HTMLElement) {
  option.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
  );
}
async function line(pane: Pick<VueWrapper, "get" | "getComponent">) {
  await pane.get('[role="tab"][id$="fill-line-tab"]').trigger("click");
  return pane.getComponent(PictureLineEditor);
}

test("real native pane line mode applies None once, preserves selection, restores readonly focus, Undo/Redo and grid dismissal", async () => {
  const f = await fixture();
  const editor = await line(f.pane),
    select = editor.findAllComponents(TSelect)[0]!;
  const option = await open(select, "No line");
  const input = select.get<HTMLInputElement>("input").element;
  input.focus();
  input.blur();
  pointer(option);
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
  option.click();
  await flushPromises();
  expect(f.target().shapeStyle?.line).toEqual({ kind: "none" });
  expect(f.current.session.history.undoStack).toHaveLength(1);
  expect(document.activeElement?.id).toBe(input.id);
  expect((document.activeElement as HTMLInputElement).readOnly).toBe(true);
  const undo = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement!.dispatchEvent(undo);
  await flushPromises();
  expect(undo.defaultPrevented).toBe(true);
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.before);
  expect(document.activeElement?.getAttribute("data-format-pane-history-control")).toBe(
    "readonly-combobox",
  );
  const redo = new KeyboardEvent("keydown", {
    key: "y",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement!.dispatchEvent(redo);
  await flushPromises();
  expect(redo.defaultPrevented).toBe(true);
  expect(f.target().shapeStyle?.line).toEqual({ kind: "none" });
  expect(f.current.session.history.undoStack).toHaveLength(1);
  const afterRedo = serializeWorkbook(f.current.session.workbook);
  const editable = f.pane
    .findAll<HTMLInputElement>("input")
    .find((field) => !field.element.readOnly && !field.element.disabled)!;
  expect(editable).toBeDefined();
  editable.element.focus();
  const nativeUndo = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement!.dispatchEvent(nativeUndo);
  await flushPromises();
  expect(nativeUndo.defaultPrevented).toBe(false);
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(afterRedo);
  expect(f.current.session.history.undoStack).toHaveLength(1);
  await triggerCanvasCell(f.wrapper, { row: 12, column: 6 }, "pointerdown", { button: 0 });
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([]);
  expect(f.wrapper.findComponent(ShapeFormatPane).exists()).toBe(false);
}, 15000);

test.each([
  [1, "Double", "compound", "double"],
  [2, "Dash", "dash", "dash"],
  [3, "Round", "cap", "round"],
  [4, "Bevel", "join", "bevel"],
] as const)(
  "real native line control %s retains current pane ownership",
  async (index, label, field, value) => {
    const f = await fixture();
    const editor = await line(f.pane),
      select = editor.findAllComponents(TSelect)[index]!;
    const option = await open(select, label);
    pointer(option);
    await flushPromises();
    expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
    option.click();
    await flushPromises();
    expect(f.target().shapeStyle?.line).toMatchObject({ kind: "value", value: { [field]: value } });
    expect(f.current.session.history.undoStack).toHaveLength(1);
    f.current.undo();
    await flushPromises();
    expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.before);
  },
  15000,
);

test("real native text direction choice is inside the current pane, while stale callbacks cannot cross owner or worksheet", async () => {
  const f = await fixture();
  await f.pane.get(".shape-format-pane__modes label:nth-child(2)").trigger("click");
  const field = f.pane
    .findAllComponents(ShapeFormatChoiceField)
    .find((item) => item.props("field") === "textDirection" && item.isVisible())!;
  const select = field.getComponent(TSelect),
    option = await open(select, "Rotate all text 90°");
  const change = select.vm.$.vnode.props!.onChange as (value: unknown) => void;
  pointer(option);
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
  option.click();
  await flushPromises();
  expect(f.target().shapeText?.layout.direction).toBe("rotate-90");
  expect(f.current.session.history.undoStack).toHaveLength(1);
  f.current.undo();
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.before);
  expect(f.current.sheetGridRef.selectShapeObjects([["sibling"]])).toBe(true);
  await flushPromises();
  await f.wrapper.get('[data-shape-control="format"]').trigger("click");
  await flushPromises();
  const replacement = serializeWorkbook(f.current.session.workbook);
  pointer(option);
  option.click();
  change("vertical-rl");
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(replacement);
  const other = createSheet("Other", "other");
  f.current.session.workbook.sheets.set(other.id, other);
  f.current.selectSheet(other.id);
  await flushPromises();
  const switched = serializeWorkbook(f.current.session.workbook);
  change("stacked");
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(switched);
}, 15000);

test.each(["layout", "line"] as const)(
  "Ribbon %s native child popup stays inside parent through pointer and closes one level per Escape",
  async (kind) => {
    const f = await fixture();
    if (kind === "layout") {
      const tab = f.wrapper.get<HTMLElement>('[data-ribbon-category="shape-text"]');
      pointer(tab.element);
      await tab.trigger("click");
      await flushPromises();
    }
    const menu =
      kind === "layout"
        ? f.wrapper.getComponent(ShapeRibbonLayoutMenu)
        : f.wrapper
            .findAllComponents(ShapeRibbonStyleMenu)
            .find((item) => item.props("category") === "line" && item.props("target") === "shape")!;
    const parentTrigger = menu.get<HTMLElement>('[role="button"]');
    pointer(parentTrigger.element);
    parentTrigger.element.focus();
    await flushPromises();
    expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
    await parentTrigger.trigger("click");
    await flushPromises();
    const select = menu.findAllComponents(TSelect)[0]!;
    const option = await open(select, kind === "layout" ? "Rotate all text 90°" : "No line");
    pointer(option);
    await flushPromises();
    expect(select.exists()).toBe(true);
    expect(select.props("popupVisible")).toBe(true);
    expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
    const input = select.get<HTMLInputElement>("input");
    input.element.focus();
    await input.trigger("keydown", { key: "Escape", code: "Escape" });
    await flushPromises();
    expect(select.props("popupVisible")).toBe(false);
    expect(menu.findAllComponents(TSelect)).not.toHaveLength(0);
    await input.trigger("keydown", { key: "Escape", code: "Escape" });
    await flushPromises();
    expect(menu.findAllComponents(TSelect)).toHaveLength(0);
  },
  15000,
);

test("retired native line options and captured commands cannot modify a replacement object or worksheet", async () => {
  const f = await fixture(),
    editor = await line(f.pane),
    select = editor.findAllComponents(TSelect)[0]!;
  const option = await open(select, "No line");
  const change = select.vm.$.vnode.props!.onChange as (value: unknown) => void;
  expect(f.current.sheetGridRef.selectShapeObjects([["sibling"]])).toBe(true);
  await flushPromises();
  await f.wrapper.get('[data-shape-control="format"]').trigger("click");
  await flushPromises();
  const replacement = serializeWorkbook(f.current.session.workbook);
  pointer(option);
  option.click();
  change("none");
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(replacement);
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["sibling"]]);
  const other = createSheet("Other", "line-other");
  f.current.session.workbook.sheets.set(other.id, other);
  f.current.selectSheet(other.id);
  await flushPromises();
  const switched = serializeWorkbook(f.current.session.workbook);
  change("solid");
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(switched);
  expect(f.current.session.history.undoStack).toHaveLength(0);
}, 15000);

test("native pane units popup retains selection and converts display units without a document command", async () => {
  const f = await fixture();
  await f.pane.get('[role="tab"][id$="size-properties-tab"]').trigger("click");
  const width = () => f.pane.get<HTMLInputElement>('[data-shape-format-field="sizeWidthPt"] input');
  const points = Number(width().element.value);
  const units = f.pane
    .findAllComponents(TSelect)
    .find((item) => item.attributes("data-shape-format-units") !== undefined)!;
  const option = await open(units, "in");
  pointer(option);
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
  option.click();
  await flushPromises();
  expect(units.props("modelValue")).toBe("in");
  expect(Number(width().element.value)).toBeCloseTo(points / 72, 2);
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.before);
  expect(f.current.session.history.undoStack).toHaveLength(0);
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
}, 15000);

test("native margin preset creates one real atomic change and retired callbacks cannot cross object or worksheet", async () => {
  const f = await fixture();
  await f.pane.get('[role="tab"][id$="size-properties-tab"]').trigger("click");
  const select = f.pane
    .findAllComponents(TSelect)
    .find((item) => item.attributes("aria-label") === "Text margins" && item.isVisible())!;
  const option = await open(select, "None");
  const change = select.vm.$.vnode.props!.onChange as (value: unknown) => void;
  pointer(option);
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
  option.click();
  await flushPromises();
  expect(f.target().shapeText?.layout.marginsPt).toEqual({
    leftPt: 0,
    rightPt: 0,
    topPt: 0,
    bottomPt: 0,
  });
  expect(f.current.session.history.undoStack).toHaveLength(1);
  f.current.undo();
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.before);
  expect(f.current.sheetGridRef.selectShapeObjects([["sibling"]])).toBe(true);
  await flushPromises();
  await f.wrapper.get('[data-shape-control="format"]').trigger("click");
  await flushPromises();
  const replacement = serializeWorkbook(f.current.session.workbook);
  pointer(option);
  option.click();
  change("none");
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(replacement);
  const other = createSheet("Other", "margin-other");
  f.current.session.workbook.sheets.set(other.id, other);
  f.current.selectSheet(other.id);
  await flushPromises();
  const switched = serializeWorkbook(f.current.session.workbook);
  change("standard");
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(switched);
  expect(f.current.session.history.undoStack).toHaveLength(0);
}, 15000);

test("native gradient kind keeps its pane owner and preserves stops through real kind change and Undo", async () => {
  const f = await fixture({ gradient: true });
  await f.pane.get('[role="tab"][id$="fill-line-tab"]').trigger("click");
  const select = f.pane.getComponent(PictureGradientEditor).getComponent(TSelect);
  const initial = f.target().shapeStyle!.fill!;
  expect(initial.kind).toBe("value");
  const option = await open(select, "Radial");
  pointer(option);
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
  option.click();
  await flushPromises();
  expect(f.target().shapeStyle?.fill).toMatchObject({
    kind: "value",
    value: {
      kind: "radial",
      stops: initial.kind === "value" && "stops" in initial.value ? initial.value.stops : undefined,
    },
  });
  expect(f.current.session.history.undoStack).toHaveLength(1);
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
  f.current.undo();
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.before);
}, 15000);

test("native shadow mode and alignment retain pane ownership, apply real values, and reject an old owner callback", async () => {
  const f = await fixture();
  await f.pane.get('[role="tab"][id$="effects-tab"]').trigger("click");
  const editor = f.pane.findAllComponents(PictureShadowEditor).find((item) => item.isVisible())!;
  const select = editor.findAllComponents(TSelect)[0]!;
  const oldChange = select.vm.$.vnode.props!.onChange as (value: unknown) => void;
  const mode = await open(select, "Outer");
  pointer(mode);
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
  mode.click();
  await flushPromises();
  expect(f.target().shapeStyle?.shadow).toMatchObject({ kind: "value", value: { kind: "outer" } });
  const anchor = editor.findAllComponents(TSelect)[1]!;
  const option = await open(anchor, "Bottom right");
  pointer(option);
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
  option.click();
  await flushPromises();
  expect(f.target().shapeStyle?.shadow).toMatchObject({
    kind: "value",
    value: { kind: "outer", anchor: "bottom-right" },
  });
  expect(f.current.session.history.undoStack).toHaveLength(2);
  f.current.undo();
  await flushPromises();
  f.current.undo();
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.before);
  expect(f.current.sheetGridRef.selectShapeObjects([["sibling"]])).toBe(true);
  await flushPromises();
  const replacement = serializeWorkbook(f.current.session.workbook);
  oldChange("inner");
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(replacement);
}, 15000);

test("native mixed shadow choice keeps the real selected group and atomically removes the text effect from its actual members", async () => {
  const f = await fixture({ mixedShadow: true });
  await f.pane.get(".shape-format-pane__modes label:nth-child(2)").trigger("click");
  await f.pane.get('[role="tab"][id$="text-effects-tab"]').trigger("click");
  const mixed = f.pane
    .findAllComponents(ShapeFormatMixedEffect)
    .find((item) => item.props("category") === "shadow" && item.isVisible())!;
  expect(mixed).toBeDefined();
  const select = mixed.getComponent(TSelect),
    option = await open(select, "Remove this effect");
  pointer(option);
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["group"]]);
  option.click();
  await flushPromises();
  const root = getActiveSheet(f.current.session.workbook).drawings![0]!;
  expect(isShapeGroupDrawing(root)).toBe(true);
  if (!isShapeGroupDrawing(root)) throw Error("Expected real group");
  expect(
    root.members.map((member) =>
      member.kind === "shape" || member.kind === "textBox"
        ? member.shapeText?.style?.shadow
        : undefined,
    ),
  ).toEqual([{ kind: "none" }, { kind: "none" }]);
  expect(f.current.session.history.undoStack).toHaveLength(1);
  f.current.undo();
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.before);
}, 15000);

test("native reflection mode keeps the real Shape pane selected while applying Custom and direct Undo", async () => {
  const f = await fixture();
  await f.pane.get('[role="tab"][id$="effects-tab"]').trigger("click");
  const editor = f.pane
    .findAllComponents(PictureReflectionEditor)
    .find((item) => item.props("ownerKey").endsWith(":shape:reflection"))!;
  const section = editor.element.closest("section")!;
  (section.querySelector(".format-section__heading") as HTMLButtonElement).click();
  await flushPromises();
  expect(editor.isVisible()).toBe(true);
  const select = editor.getComponent(TSelect),
    option = await open(select, "Custom");
  pointer(option);
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
  expect(f.pane.isVisible()).toBe(true);
  option.click();
  await flushPromises();
  expect(f.target().shapeStyle?.reflection).toMatchObject({
    kind: "value",
    value: { size: 0.5, opacity: 0.3, blurPt: 0, distancePt: 0 },
  });
  expect(f.current.session.history.undoStack).toHaveLength(1);
  f.current.undo();
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.before);
}, 15000);

test.each(["history", "external focus", "owner"] as const)(
  "delayed native picture mode completion preserves its focus lease (%s)",
  async (boundary) => {
    const f = await fixture({ gradient: true });
    const bytes = new Blob([new Uint8Array(actualPng)], { type: "image/png" });
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    // Supply only the browser encoder/decode ports. Asset storage, CAS loader,
    // pane callbacks, Core commands, selection and shortcut routing remain real.
    vi.spyOn(textureSource, "createPictureTextureBlob").mockResolvedValue(bytes);
    const prepare = vi.spyOn(imagePreparation, "prepareImageAsset").mockImplementation(async () => {
      await pending;
      return {
        id: `image-${"a".repeat(64)}`,
        mimeType: "image/png",
        width: 1,
        height: 1,
        blob: bytes,
      };
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:async-mode-source");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue();
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(1);
    vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(1);
    const editor = f.pane
      .findAllComponents(PicturePaintEditor)
      .find((item) => item.props("ownerKey").endsWith(":shape:fill"))!;
    const select = editor.getComponent(TSelect);
    const option = await open(select, "Picture or texture fill");
    const oldInput = select.get<HTMLInputElement>("input").element;
    oldInput.focus();
    pointer(option);
    option.click();
    await flushPromises();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(f.current.session.history.undoStack).toHaveLength(0);
    oldInput.blur();
    const elsewhere = document.createElement("input");
    document.body.append(elsewhere);
    if (boundary === "external focus") elsewhere.focus();
    if (boundary === "owner") {
      expect(f.current.sheetGridRef.selectShapeObjects([["sibling"]])).toBe(true);
      await flushPromises();
      elsewhere.focus();
    }
    finish();
    await flushPromises();
    if (boundary === "owner") {
      expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.before);
      expect(document.activeElement).toBe(elsewhere);
      return;
    }
    expect(f.target().shapeStyle?.fill).toMatchObject({
      kind: "value",
      value: {
        kind: "picture",
        assetId: `image-texture-v1-paper-${"a".repeat(64)}`,
        layout: { kind: "tile" },
      },
    });
    expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
    expect(f.current.session.history.undoStack).toHaveLength(1);
    if (boundary === "external focus") {
      expect(document.activeElement).toBe(elsewhere);
      return;
    }
    const currentPane = f.wrapper.getComponent(ShapeFormatPane);
    expect(currentPane.props("snapshot")!.owner).toMatchObject({
      workbookId: f.current.session.workbook.id,
      sheetId: getActiveSheet(f.current.session.workbook).id,
      drawingId: "box",
    });
    expect(currentPane.props("snapshot")!.drawing.id).toBe("box");
    expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
    const currentEditor = currentPane
      .findAllComponents(PicturePaintEditor)
      .find((item) => item.props("ownerKey").endsWith(":shape:fill"))!;
    const input = currentEditor.getComponent(TSelect).get<HTMLInputElement>("input").element;
    // An accepted self-commit may reuse the input. The current owner, live
    // readonly control and real history shortcut are the behavioral contract.
    expect(input.isConnected).toBe(true);
    expect(input.closest("[data-shape-format-pane]")).toBe(currentPane.element);
    expect(input.readOnly).toBe(true);
    expect(input.disabled).toBe(false);
    expect(document.activeElement).toBe(input);
    const undo = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.activeElement!.dispatchEvent(undo);
    await flushPromises();
    expect(undo.defaultPrevented).toBe(true);
    expect(serializeWorkbook(f.current.session.workbook)).toEqual(f.before);
    expect(f.current.session.history.undoStack).toHaveLength(0);
    expect(f.current.session.history.redoStack).toHaveLength(1);
  },
  15000,
);

test("owned picture layout, tile alignment and mirror popups apply without losing the Shape pane and retire old owner actions", async () => {
  const f = await fixture({ gradient: true });
  const bytes = new Blob([new Uint8Array(actualPng)], { type: "image/png" });
  vi.spyOn(textureSource, "createPictureTextureBlob").mockResolvedValue(bytes);
  vi.spyOn(imagePreparation, "prepareImageAsset").mockResolvedValue({
    id: `image-${"b".repeat(64)}`,
    mimeType: "image/png",
    width: 1,
    height: 1,
    blob: bytes,
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:owned-paint-source");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue();
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(1);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(1);
  const editor = f.pane
    .findAllComponents(PicturePaintEditor)
    .find((item) => item.props("ownerKey").endsWith(":shape:fill"))!;
  const mode = await open(editor.getComponent(TSelect), "Picture or texture fill");
  pointer(mode);
  mode.click();
  await flushPromises();
  const picture = () => {
    const fill = f.target().shapeStyle?.fill;
    if (fill?.kind !== "value" || fill.value.kind !== "picture")
      throw Error("Expected real picture paint");
    return fill.value;
  };
  expect(picture().layout.kind).toBe("tile");
  for (const [index, value] of [
    [2, "bottom-right"],
    [3, "xy"],
    [1, "stretch"],
    [1, "tile"],
  ] as const) {
    const select = editor.findAllComponents(TSelect)[index]!;
    const label = (select.props("options") as { value: string; label: string }[]).find(
      (item) => item.value === value,
    )!.label;
    const beforeChoice = serializeWorkbook(f.current.session.workbook);
    const option = await open(select, label);
    pointer(option);
    await flushPromises();
    expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
    expect(f.pane.isVisible()).toBe(true);
    option.click();
    await flushPromises();
    if (index === 2) {
      expect(picture().layout).toMatchObject({ anchor: value });
      const input = editor
        .findAllComponents(TSelect)
        [index]!.get<HTMLInputElement>("input").element;
      expect(document.activeElement).toBe(input);
      expect(input.readOnly).toBe(true);
      const undo = new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.activeElement!.dispatchEvent(undo);
      await flushPromises();
      expect(undo.defaultPrevented).toBe(true);
      expect(serializeWorkbook(f.current.session.workbook)).toEqual(beforeChoice);
      const redo = new KeyboardEvent("keydown", {
        key: "y",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.activeElement!.dispatchEvent(redo);
      await flushPromises();
      expect(redo.defaultPrevented).toBe(true);
      expect(picture().layout).toMatchObject({ anchor: value });
    } else if (index === 3) expect(picture().layout).toMatchObject({ flip: value });
    else expect(picture().layout.kind).toBe(value);
  }
  const retired = editor
    .findAllComponents(TSelect)
    .slice(1)
    .map((select) => select.vm.$.vnode.props!.onChange as (value: unknown) => void);
  const mirror = editor.findAllComponents(TSelect)[3]!;
  await open(mirror, "None");
  expect(f.current.sheetGridRef.selectShapeObjects([["sibling"]])).toBe(true);
  await flushPromises();
  expect(mirror.element.isConnected && mirror.props("popupVisible")).toBe(false);
  const before = serializeWorkbook(f.current.session.workbook);
  retired[0]!("stretch");
  retired[1]!("top-left");
  retired[2]!("xy");
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(before);
}, 15000);

test("owned begin and end arrow type popups preserve selection, apply independent ends and reject a replacement owner", async () => {
  const f = await fixture({ lineEnds: true });
  const editor = f.pane.getComponent(ShapeLineEndsControls);
  expect(editor.props("ownerKey")).toContain(":shape:line-ends");
  for (const [index, value] of [
    [0, "triangle"],
    [1, "diamond"],
  ] as const) {
    const select = editor.findAllComponents(TSelect)[index]!;
    expect(select.props("disabled")).toBe(false);
    const label = (select.props("options") as { value: string; label: string }[]).find(
      (item) => item.value === value,
    )!.label;
    const option = await open(select, label);
    pointer(option);
    await flushPromises();
    expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([["box"]]);
    option.click();
    await flushPromises();
  }
  expect(f.target().shapeLineEnds).toEqual({
    begin: { kind: "triangle" },
    end: { kind: "diamond" },
  });
  const selects = editor.findAllComponents(TSelect);
  const old = selects.map(
    (select) => select.vm.$.vnode.props!.onChange as (value: unknown) => void,
  );
  await open(selects[0]!, "Open Arrow");
  expect(f.current.sheetGridRef.selectShapeObjects([["sibling"]])).toBe(true);
  await flushPromises();
  // A real owner switch can remove this entire old editor; retired Vue wrapper
  // props are not reactive after unmount. Neither a live old popup nor callback remains.
  expect(selects[0]!.element.isConnected && selects[0]!.props("popupVisible")).toBe(false);
  const before = serializeWorkbook(f.current.session.workbook);
  old[0]!("oval");
  old[1]!("none");
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(before);
}, 15000);

test("fresh Insert Lines drag uses its real connector pane owner for native end arrow apply", async () => {
  const f = await fixture();
  await f.wrapper.get('[data-ribbon-category="insert"]').trigger("click");
  await f.wrapper.get('[data-insert-tool="shape"]').trigger("click");
  const choice = document.body.querySelector<HTMLElement>('[data-shape-choice="line"]')!;
  expect(choice).not.toBeNull();
  choice.click();
  await flushPromises();
  const layer = f.wrapper.get("[data-shape-creation-layer]");
  vi.spyOn(layer.element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
  const drag = (type: string, x: number, y: number) =>
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      clientX: x,
      clientY: y,
    });
  layer.element.dispatchEvent(drag("pointerdown", 100, 430));
  window.dispatchEvent(drag("pointermove", 220, 460));
  window.dispatchEvent(drag("pointerup", 220, 460));
  await flushPromises();
  const source = getActiveSheet(f.current.session.workbook).drawings!.find(
    (drawing) => drawing.id !== "box" && drawing.id !== "sibling",
  )!;
  expect(source).toMatchObject({
    kind: "shape",
    shapeConnector: { kind: "shape-connector-v1" },
    shapeGeometry: { preset: "line" },
  });
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([[source.id]]);
  await f.wrapper.get('[data-shape-control="format"]').trigger("click");
  await flushPromises();
  const pane = f.wrapper.getComponent(ShapeFormatPane);
  const controls = pane.getComponent(ShapeLineEndsControls);
  const end = controls.findAllComponents(TSelect)[1]!;
  expect(end.props("disabled")).toBe(false);
  const beforeArrow = serializeWorkbook(f.current.session.workbook);
  const option = await open(end, "Arrow");
  pointer(option);
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([[source.id]]);
  expect(pane.isVisible()).toBe(true);
  option.click();
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([[source.id]]);
  expect(
    getActiveSheet(f.current.session.workbook).drawings!.find(
      (drawing) => drawing.id === source.id,
    ),
  ).toMatchObject({ shapeLineEnds: { end: { kind: "triangle" } } });
  const currentInput = controls
    .findAllComponents(TSelect)[1]!
    .get<HTMLInputElement>("input").element;
  expect(document.activeElement).toBe(currentInput);
  expect(currentInput.readOnly).toBe(true);
  const undo = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement!.dispatchEvent(undo);
  await flushPromises();
  expect(undo.defaultPrevented).toBe(true);
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(beforeArrow);
  const redo = new KeyboardEvent("keydown", {
    key: "y",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement!.dispatchEvent(redo);
  await flushPromises();
  expect(redo.defaultPrevented).toBe(true);
  const retired = controls.findAllComponents(TSelect)[1]!.vm.$.vnode.props!.onChange as (
    value: unknown,
  ) => void;
  const other = createSheet("Connector replacement", "connector-other");
  f.current.session.workbook.sheets.set(other.id, other);
  f.current.selectSheet(other.id);
  await flushPromises();
  const switched = serializeWorkbook(f.current.session.workbook);
  retired("oval");
  await flushPromises();
  expect(serializeWorkbook(f.current.session.workbook)).toEqual(switched);
  f.current.selectSheet("shapes");
  await flushPromises();
  expect(f.current.sheetGridRef.selectShapeObjects([[source.id]])).toBe(true);
  await flushPromises();
  await f.wrapper.get('[data-shape-control="format"]').trigger("click");
  await flushPromises();
  await triggerCanvasCell(f.wrapper, { row: 12, column: 6 }, "pointerdown", { button: 0 });
  await flushPromises();
  expect(f.current.sheetGridRef.getSelectedShapeObjects()).toEqual([]);
  expect(f.wrapper.findComponent(ShapeFormatPane).exists()).toBe(false);
}, 15000);
