import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, createSheet, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { isShapeGroupDrawing, type SheetGroupedGraphicDrawing } from "@sheetcraft/core/shape-group";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import ShapeToolsToolbar from "../../../modules/sheet-drawings/components/ShapeToolsToolbar.vue";
import ShapeCanvasTextEditor from "../../../modules/sheet-drawings/components/ShapeCanvasTextEditor.vue";
import ShapeFormatPane from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import ShapeFormatFillLine from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatFillLine.vue";
import ShapeFormatEffects from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatEffects.vue";
import WordArtStyleGallery from "../../../modules/sheet-drawings/components/WordArtStyleGallery.vue";
import WordArtTransformGallery from "../../../modules/sheet-drawings/components/WordArtTransformGallery.vue";
import PicturePaintEditor from "../../../modules/sheet-images/components/format-pane/PicturePaintEditor.vue";
import PictureLineEditor from "../../../modules/sheet-images/components/format-pane/PictureLineEditor.vue";
import PictureShadowEditor from "../../../modules/sheet-images/components/format-pane/PictureShadowEditor.vue";
import PictureReflectionEditor from "../../../modules/sheet-images/components/format-pane/PictureReflectionEditor.vue";
import PictureGlowEditor from "../../../modules/sheet-images/components/format-pane/PictureGlowEditor.vue";
import PicturePresetGallery from "../../../modules/sheet-images/components/format-pane/PicturePresetGallery.vue";
import { getPictureEffectPreset } from "../../../modules/sheet-images/picture-effect-presets";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  WORDART_STYLE_PRESETS,
  materializeWordArtStylePreset,
} from "../../../modules/sheet-drawings/wordart-style-presets";
import { materializeWordArtCharacterStylePreset } from "../../../modules/sheet-drawings/wordart-style-application";
import { WORDART_TRANSFORM_PRESETS } from "../../../modules/sheet-drawings/wordart-transform-presets";
import { writeTextDomSelection } from "../../../shared/cell-editing/text-dom-selection";
import * as measurement from "../../../modules/sheet-drawings/shape-text-measure";
import * as textPaint from "../../../modules/sheet-drawings/shape-text-paint";
import * as groupPaint from "../../../modules/sheet-drawings/shape-group-paint";
import type { createWorkbookSession } from "@sheetcraft/core/history";
import type { useShapeTextEditSession } from "../../../modules/sheet-drawings/useShapeTextEditSession";
import type { useOwnedShapeGroupFormatPane } from "../../../modules/sheet-drawings/useOwnedShapeGroupFormatPane";

const mounted: VueWrapper[] = [];
type FormatWrapper = Pick<VueWrapper, "get" | "getComponent" | "findAllComponents">;
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
    session: ReturnType<typeof createWorkbookSession>;
    shapeTextEdit: ReturnType<typeof useShapeTextEditSession>;
    shapeGroupFormatPane: ReturnType<typeof useOwnedShapeGroupFormatPane>;
    sheetGridRef: {
      selectShapeObjects(paths: readonly (readonly string[])[]): boolean;
      getSelectedShapeObjects(): readonly (readonly string[])[];
    };
    saveError: string | undefined;
    undo(): void;
    redo(): void;
    selectSheet(id: string): void;
  };
}
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
function workbook(owned = false, body = false) {
  const book = createWorkbook({ id: "textbox-formatting", sheetId: "textbox-sheet" }),
    sheet = getActiveSheet(book),
    target = textBox("box", 80),
    sibling = textBox("sibling", 350);
  if (body)
    target.shapeStyle = {
      fill: {
        kind: "value",
        value: { kind: "solid", color: { kind: "rgb", rgb: "#FDE68A" }, opacity: 1 },
      },
    };
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
  return { wrapper, current, before };
}
function target(
  current: ReturnType<typeof workspaceState>,
  id = "box",
): SheetFramedGraphicDrawing | SheetGroupedGraphicDrawing {
  const roots = getActiveSheet(current.session.workbook).drawings!,
    root = roots[0]!;
  const source = isShapeGroupDrawing(root)
    ? root.members.find((node) => node.id === id)
    : roots.find((node) => node.id === id);
  if (!source || source.kind !== "textBox") throw Error("Expected genuine stored TextBox owner");
  expect(source.wordArt).toBeUndefined();
  return source as SheetFramedGraphicDrawing | SheetGroupedGraphicDrawing;
}
function geometry(source: SheetFramedGraphicDrawing | SheetGroupedGraphicDrawing) {
  return {
    frame: "shapeFrame" in source ? source.shapeFrame : source.groupFrame,
    rotation: source.rotation,
    shape: source.shape,
    shapeGeometry: source.shapeGeometry,
    shapePath: source.shapePath,
  };
}
async function openFormat(
  wrapper: VueWrapper,
  current: ReturnType<typeof workspaceState>,
  owned = false,
) {
  expect(current.sheetGridRef.selectShapeObjects([owned ? ["group", "box"] : ["box"]])).toBe(true);
  await flushPromises();
  const button = wrapper.getComponent(ShapeToolsToolbar).get('[data-shape-control="format"]');
  expect(button.isVisible()).toBe(true);
  expect(button.attributes("disabled")).toBeUndefined();
  await button.trigger("click");
  await flushPromises();
  const pane = wrapper.getComponent(ShapeFormatPane);
  expect(pane.isVisible()).toBe(true);
  expect(pane.props("snapshot")!.drawing.kind).toBe("textBox");
  expect(pane.props("snapshot")!.owner.drawingId).toBe("box");
  return pane;
}
async function textMode(pane: FormatWrapper, tab: "text-fill-line" | "text-effects") {
  await pane.get(".shape-format-pane__modes button:nth-child(2)").trigger("click");
  await pane.get(`[role="tab"][id$="${tab}-tab"]`).trigger("click");
}
function fillLine(pane: FormatWrapper, mode: "shape" | "text") {
  return pane
    .findAllComponents(ShapeFormatFillLine)
    .find((component) => component.props("target") === mode)!;
}
function effects(pane: FormatWrapper, mode: "shape" | "text") {
  return pane
    .findAllComponents(ShapeFormatEffects)
    .find((component) => component.props("target") === mode)!;
}
async function chooseEffect(editor: FormatWrapper, id: string) {
  const gallery = editor.getComponent(PicturePresetGallery),
    item = gallery
      .props("groups")
      .flatMap((group) => group.items)
      .find((choice) => choice.id === id)!;
  const label =
    gallery.props("t")(item.labelKey) + (item.ordinal === undefined ? "" : ` ${item.ordinal}`);
  const combobox = gallery.get('input[role="combobox"]');
  expect(combobox.isVisible()).toBe(true);
  // HappyDOM has no native layout. TDesign intentionally closes a Popup whose
  // real Input trigger measures 0 x 0; supply only that trigger's native rect.
  // Popup logic, open state, callbacks and all sheet geometry remain genuine.
  const triggerRect = new DOMRect(100, 100, 228, 32);
  for (const trigger of gallery.findAll(".t-input__wrap, .t-input"))
    vi.spyOn(trigger.element, "getBoundingClientRect").mockReturnValue(triggerRect);
  (combobox.element as HTMLInputElement).focus();
  await flushPromises();
  await combobox.trigger("keydown", { key: "ArrowDown" });
  // Wait for the real controlled open state and its native TDesign portal.
  await vi.waitFor(
    () => {
      expect(combobox.attributes("aria-expanded")).toBe("true");
      expect(document.querySelector(".picture-preset-gallery button")).not.toBeNull();
    },
    { timeout: 1000, interval: 20 },
  );
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>(".picture-preset-gallery button"),
  ].find((choice) => choice.getAttribute("aria-label") === label);
  expect(button).toBeDefined();
  expect(button!.disabled).toBe(false);
  button!.click();
  await flushPromises();
}
async function editAlpha(wrapper: VueWrapper) {
  await wrapper
    .getComponent(SheetDrawingLayer)
    .get('[data-sheet-drawing-id="box"]')
    .trigger("keydown", { key: "F2" });
  await flushPromises();
  const input = wrapper.getComponent(ShapeCanvasTextEditor).get("[data-shape-rich-text-input]");
  writeTextDomSelection(input.element as HTMLElement, { start: 0, end: 5, direction: "forward" });
  await input.trigger("keyup", { key: "Shift" });
  await flushPromises();
  return input;
}

const red = {
  kind: "value" as const,
  value: { kind: "solid" as const, color: { kind: "rgb" as const, rgb: "#EF4444" }, opacity: 1 },
};
const blueLine = {
  kind: "value" as const,
  value: {
    paint: { kind: "solid" as const, color: { kind: "rgb" as const, rgb: "#2563EB" }, opacity: 1 },
    widthPt: 1.5,
    compound: "single" as const,
    dash: "solid" as const,
    cap: "butt" as const,
    join: "round" as const,
    miterLimit: 4,
  },
};

test.each([false, true])(
  "visible TextBox format button edits body fill, line and shadow with exact Undo (owned=%s)",
  async (owned) => {
    const { wrapper, current, before } = await fixture(workbook(owned)),
      originalGeometry = clone(geometry(target(current))),
      originalText = clone(target(current).shapeText),
      sibling = clone(target(current, "sibling")),
      pane = await openFormat(wrapper, current, owned);
    if (owned) expect(current.shapeGroupFormatPane.path.value).toEqual(["group", "box"]);
    await pane.get('[role="tab"][id$="fill-line-tab"]').trigger("click");
    expect(fillLine(pane, "shape").getComponent(PicturePaintEditor).props("onCommit")(red)).toBe(
      true,
    );
    await flushPromises();
    const filled = serializeWorkbook(current.session.workbook);
    expect(target(current).shapeStyle?.fill).toEqual(red);
    expect(
      fillLine(pane, "shape").getComponent(PictureLineEditor).props("onCommit")(blueLine),
    ).toBe(true);
    await flushPromises();
    const outlined = serializeWorkbook(current.session.workbook);
    expect(target(current).shapeStyle?.line).toEqual(blueLine);
    await pane.get('[role="tab"][id$="effects-tab"]').trigger("click");
    await chooseEffect(effects(pane, "shape").getComponent(PictureShadowEditor), "outer-top-left");
    expect(target(current).shapeStyle?.shadow).toEqual(
      getPictureEffectPreset("shadow", "outer-top-left"),
    );
    expect(serializeWorkbook(current.session.workbook).version).toBe(73);
    expect(geometry(target(current))).toEqual(originalGeometry);
    expect(target(current).shapeText).toEqual(originalText);
    expect(target(current).text).toBe("alpha beta");
    expect(target(current, "sibling")).toEqual(sibling);
    expect(current.session.history.undoStack).toHaveLength(3);
    const changed = serializeWorkbook(current.session.workbook);
    for (const expected of [outlined, filled, before]) {
      current.undo();
      await flushPromises();
      expect(serializeWorkbook(current.session.workbook)).toEqual(expected);
    }
    current.redo();
    current.redo();
    current.redo();
    await flushPromises();
    expect(serializeWorkbook(current.session.workbook)).toEqual(changed);
  },
);

test("plain TextBox pane exposes 25 recipes and 41 transforms and applies the first real choices without changing its body", async () => {
  const { wrapper, current, before } = await fixture(workbook(false, true)),
    original = clone(target(current)),
    pane = await openFormat(wrapper, current);
  await textMode(pane, "text-fill-line");
  const gallery = pane.getComponent(WordArtStyleGallery);
  expect(gallery.findAll("[data-wordart-style-choice]")).toHaveLength(25);
  expect(gallery.props("disabled")).toBe(false);
  await gallery
    .get(`[data-wordart-style-choice="${WORDART_STYLE_PRESETS[0]!.id}"]`)
    .trigger("click");
  await flushPromises();
  expect(target(current).shapeText?.style).toEqual(
    materializeWordArtStylePreset(WORDART_STYLE_PRESETS[0]!.id),
  );
  expect(target(current).shapeStyle).toEqual(original.shapeStyle);
  expect(geometry(target(current))).toEqual(geometry(original));
  expect(target(current).text).toBe(original.text);
  const styled = serializeWorkbook(current.session.workbook);
  await textMode(pane, "text-effects");
  await pane.get("[data-text-transform-section] > button").trigger("click");
  const transform = pane.getComponent(WordArtTransformGallery);
  expect(transform.findAll("[data-wordart-transform-choice]")).toHaveLength(41);
  expect(transform.props("disabled")).toBe(false);
  expect(
    transform.get('[data-wordart-transform-choice="textNoShape"]').attributes("aria-checked"),
  ).toBe("true");
  await transform
    .get(`[data-wordart-transform-choice="${WORDART_TRANSFORM_PRESETS[1]!.id}"]`)
    .trigger("click");
  await flushPromises();
  expect(target(current).shapeText?.warp).toEqual(WORDART_TRANSFORM_PRESETS[1]!.warp);
  expect(target(current).shapeStyle).toEqual(original.shapeStyle);
  expect(geometry(target(current))).toEqual(geometry(original));
  expect(current.session.history.undoStack).toHaveLength(2);
  current.undo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(styled);
  current.undo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
});

test("owned TextBox F2 recipe and local effect galleries change only selected alpha, with private and document Undo", async () => {
  const { wrapper, current, before } = await fixture(workbook(true, true)),
    original = clone(target(current)),
    sibling = clone(target(current, "sibling"));
  expect(current.sheetGridRef.selectShapeObjects([["group", "box"]])).toBe(true);
  await flushPromises();
  const input = await editAlpha(wrapper),
    pane = wrapper.getComponent(ShapeFormatPane),
    gallery = pane.getComponent(WordArtStyleGallery),
    recipe = WORDART_STYLE_PRESETS[0]!;
  await textMode(pane, "text-fill-line");
  expect(gallery.isVisible()).toBe(true);
  expect(current.shapeTextEdit.snapshot.value?.path).toEqual(["group", "box"]);
  expect(current.shapeTextEdit.snapshot.value?.selection).toMatchObject({ start: 0, end: 5 });
  expect(gallery.findAll("[data-wordart-style-choice]")).toHaveLength(25);
  await gallery.get(`[data-wordart-style-choice="${recipe.id}"]`).trigger("click");
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value?.draftView.shapeText?.characterRuns).toEqual([
    { start: 0, end: 5, ...materializeWordArtCharacterStylePreset(recipe.id) },
  ]);
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  (input.element as HTMLElement).focus();
  await input.trigger("keydown", { key: "z", ctrlKey: true });
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value?.draftView.shapeText?.characterRuns).toBeUndefined();
  await input.trigger("keydown", { key: "z", ctrlKey: true, shiftKey: true });
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value?.draftView.shapeText?.characterRuns).toHaveLength(1);
  await pane.get('[role="tab"][id$="text-effects-tab"]').trigger("click");
  const local = effects(pane, "text");
  await chooseEffect(local.getComponent(PictureShadowEditor), "outer-top-left");
  for (const [editor, id] of [
    [local.getComponent(PictureReflectionEditor), "reflection-0-0"],
    [local.getComponent(PictureGlowEditor), "glow-accent1-2"],
  ] as const) {
    const section = (editor.element as Element).closest(".picture-format-section")!;
    section.querySelector<HTMLButtonElement>(".picture-format-section__heading")!.click();
    await flushPromises();
    await chooseEffect(editor, id);
  }
  const runs = [
    {
      start: 0,
      end: 5,
      ...materializeWordArtCharacterStylePreset(recipe.id),
      shadow: getPictureEffectPreset("shadow", "outer-top-left"),
      reflection: getPictureEffectPreset("reflection", "reflection-0-0"),
      glow: getPictureEffectPreset("glow", "glow-accent1-2"),
    },
  ];
  expect(current.shapeTextEdit.snapshot.value?.draftView.shapeText?.characterRuns).toEqual(runs);
  expect(current.shapeTextEdit.snapshot.value?.draftView.shapeStyle).toEqual(original.shapeStyle);
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
  (input.element as HTMLElement).focus();
  await input.trigger("keydown", { key: "Enter", ctrlKey: true });
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value).toBeUndefined();
  expect(target(current).shapeText?.characterRuns).toEqual(runs);
  expect(target(current).text).toBe("alpha beta");
  expect(target(current).shapeStyle).toEqual(original.shapeStyle);
  expect(geometry(target(current))).toEqual(geometry(original));
  expect(target(current, "sibling")).toEqual(sibling);
  expect(current.session.history.undoStack).toHaveLength(1);
  const committed = serializeWorkbook(current.session.workbook);
  current.undo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  current.redo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(committed);
});

test("clicking a TextBox recipe during composition cannot submit the half-composed draft", async () => {
  const { wrapper, current, before } = await fixture(),
    input = await editAlpha(wrapper),
    pane = wrapper.getComponent(ShapeFormatPane),
    gallery = pane.getComponent(WordArtStyleGallery);
  await textMode(pane, "text-fill-line");
  const choice = gallery.get(`[data-wordart-style-choice="${WORDART_STYLE_PRESETS[0]!.id}"]`);
  expect(choice.isVisible()).toBe(true);
  await input.trigger("compositionstart");
  input.element.textContent = "alpha中 beta";
  await input.trigger("input", { isComposing: true });
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value?.composing).toBe(true);
  expect(gallery.props("disabled")).toBe(true);
  await choice.trigger("pointerdown");
  await choice.trigger("click");
  await input.trigger("keydown", { key: "Enter", ctrlKey: true, isComposing: true });
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value?.composing).toBe(true);
  expect(input.element.textContent).toBe("alpha中 beta");
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
  input.element.textContent = "alpha中国 beta";
  const ended = new CompositionEvent("compositionend", { bubbles: true });
  Object.defineProperty(ended, "data", { value: "中国" });
  input.element.dispatchEvent(ended);
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value?.composing).toBe(false);
  expect(current.shapeTextEdit.snapshot.value?.draftText).toBe("alpha中国 beta");
  expect(current.shapeTextEdit.snapshot.value?.draftView.shapeText?.characterRuns).toBeUndefined();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  (input.element as HTMLElement).focus();
  await input.trigger("keydown", { key: "Enter", ctrlKey: true });
  await flushPromises();
  expect(target(current).text).toBe("alpha中国 beta");
  expect(current.session.history.undoStack).toHaveLength(1);
  current.undo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
});

test("rejected TextBox commit and changed worksheet owner preserve the complete formatted draft atomically", async () => {
  const { wrapper, current, before } = await fixture(),
    input = await editAlpha(wrapper),
    pane = wrapper.getComponent(ShapeFormatPane),
    gallery = pane.getComponent(WordArtStyleGallery),
    recipe = WORDART_STYLE_PRESETS[0]!;
  await textMode(pane, "text-fill-line");
  expect(gallery.isVisible()).toBe(true);
  await gallery.get(`[data-wordart-style-choice="${recipe.id}"]`).trigger("click");
  await flushPromises();
  const draft = clone(current.shapeTextEdit.snapshot.value!.draftView),
    captured = pane.props("snapshot")!,
    submit = pane.props("onIntent"),
    sessionId = current.shapeTextEdit.snapshot.value!.sessionId;
  vi.mocked(textPaint.preflightShapeTextGlyphBudgets).mockReturnValue({
    kind: "unavailable",
    reason: "asset-pixels-unavailable",
    missingAssetIds: [],
  });
  expect(current.shapeTextEdit.commit(sessionId)).toBe(false);
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value?.error?.code).toBe("prepare");
  expect(input.element.textContent).toBe("alpha beta");
  expect(current.shapeTextEdit.snapshot.value?.draftView).toEqual(draft);
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
  const other = createSheet("Other", "other-sheet");
  current.session.workbook.sheets.set(other.id, other);
  current.selectSheet(other.id);
  await flushPromises();
  const switched = serializeWorkbook(current.session.workbook);
  expect(getActiveSheet(current.session.workbook).id).toBe(other.id);
  expect(current.shapeTextEdit.snapshot.value?.stale).toBe(true);
  expect(current.shapeTextEdit.snapshot.value?.draftView).toEqual(draft);
  expect(
    submit({
      type: "set-wordart-style",
      owner: captured.owner,
      baseRevision: captured.revision,
      intentId: "stale-textbox-recipe",
      presetId: WORDART_STYLE_PRESETS[1]!.id,
    }),
  ).toBe(false);
  expect(current.shapeTextEdit.commit(sessionId)).toBe(false);
  expect(serializeWorkbook(current.session.workbook)).toEqual(switched);
  expect(current.session.workbook.sheets.get("textbox-sheet")!.drawings![0]).toHaveProperty(
    "kind",
    "textBox",
  );
  expect(current.session.workbook.sheets.get("textbox-sheet")!.drawings![0]).toHaveProperty(
    "text",
    "alpha beta",
  );
  expect(current.session.history.undoStack).toHaveLength(0);
});

test("TextBox same-session pane keyboard keeps the private F2 draft and document history untouched", async () => {
  const { wrapper, current, before } = await fixture();
  await editAlpha(wrapper);
  const pane = wrapper.getComponent(ShapeFormatPane);
  await textMode(pane, "text-fill-line");
  const recipe = WORDART_STYLE_PRESETS[0]!;
  await pane
    .getComponent(WordArtStyleGallery)
    .get(`[data-wordart-style-choice="${recipe.id}"]`)
    .trigger("click");
  await flushPromises();
  const sessionId = current.shapeTextEdit.snapshot.value!.sessionId;
  const draft = clone(current.shapeTextEdit.snapshot.value!.draftView);
  expect(pane.attributes("data-shape-text-edit-session")).toBe(String(sessionId));
  await pane.get('[role="tab"][id$="text-effects-tab"]').trigger("click");
  const combobox = effects(pane, "text")
    .getComponent(PictureShadowEditor)
    .get('input[role="combobox"]');
  expect(combobox.isVisible()).toBe(true);
  (combobox.element as HTMLInputElement).focus();
  await flushPromises();
  await combobox.trigger("keydown", { key: "ArrowDown" });
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value?.sessionId).toBe(sessionId);
  expect(current.shapeTextEdit.snapshot.value?.draftView).toEqual(draft);
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);

  // A retired pane marker is an outside action, even on the same visual control.
  pane.element.setAttribute("data-shape-text-edit-session", String(sessionId + 1));
  await combobox.trigger("keydown", { key: "ArrowDown" });
  await flushPromises();
  expect(current.shapeTextEdit.snapshot.value).toBeUndefined();
  expect(target(current).shapeText?.characterRuns).toEqual(draft.shapeText?.characterRuns);
  expect(current.session.history.undoStack).toHaveLength(1);
  expect(serializeWorkbook(current.session.workbook)).not.toEqual(before);
  current.undo();
  await flushPromises();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
});
