import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import type { createWorkbookSession } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { isShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import { isFramedShapeDrawing } from "@sheetcraft/core/sheet-drawings";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import ShapeFormatPane from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import WordArtStyleGallery from "../../../modules/sheet-drawings/components/WordArtStyleGallery.vue";
import WordArtTransformGallery from "../../../modules/sheet-drawings/components/WordArtTransformGallery.vue";
import ShapeCanvasTextEditor from "../../../modules/sheet-drawings/components/ShapeCanvasTextEditor.vue";
import { createModernWordArtDrawing } from "../../../modules/sheet-drawings/modern-wordart-insertion";
import { WORDART_STYLE_PRESETS } from "../../../modules/sheet-drawings/wordart-style-presets";
import { WORDART_TRANSFORM_PRESETS } from "../../../modules/sheet-drawings/wordart-transform-presets";
import * as measurement from "../../../modules/sheet-drawings/shape-text-measure";
import { clearShapeTextPaintCache } from "../../../modules/sheet-drawings/shape-text-paint";
import type { useShapeCreation } from "../../../modules/sheet-drawings/useShapeCreation";
import type { useShapeTextEditSession } from "../../../modules/sheet-drawings/useShapeTextEditSession";
import type { useOwnedShapeGroupFormatPane } from "../../../modules/sheet-drawings/useOwnedShapeGroupFormatPane";
import { writeTextDomSelection } from "../../../shared/cell-editing/text-dom-selection";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";

type Matrix = [number, number, number, number, number, number];
type PixelSurface = { width: number; height: number; data: Uint8ClampedArray };
type NativeCall = { text: string; font: string; mode: "fill" | "stroke" };
let surfaces = new WeakMap<HTMLCanvasElement, PixelSurface>();
let nativeCalls: NativeCall[] = [];

function surface(canvas: HTMLCanvasElement): PixelSurface {
  let value = surfaces.get(canvas);
  if (!value || value.width !== canvas.width || value.height !== canvas.height) {
    value = {
      width: canvas.width,
      height: canvas.height,
      data: new Uint8ClampedArray(canvas.width * canvas.height * 4),
    };
    surfaces.set(canvas, value);
  }
  return value;
}

// Adapt the existing numeric Canvas/alpha boundary to genuine DOM canvases.
// The glyph rectangles are synthetic. Real warp plans, alpha sampling, paint
// preparation, Workspace watches, owner leases and command history stay real.
// These tests make no claim about native browser glyph or pixel fidelity.
class NativeTextContext {
  font = "";
  direction = "ltr";
  textAlign = "left";
  textBaseline = "alphabetic";
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  fillStyle = "#ffffff";
  strokeStyle = "#ffffff";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "round";
  miterLimit = 4;
  matrix: Matrix = [1, 0, 0, 1, 0, 0];
  stack: Matrix[] = [];
  constructor(readonly canvas: HTMLCanvasElement) {}
  save() {
    this.stack.push([...this.matrix]);
  }
  restore() {
    this.matrix = this.stack.pop() ?? this.matrix;
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    const [aa, bb, cc, dd, ee, ff] = this.matrix;
    this.matrix = [
      aa * a + cc * b,
      bb * a + dd * b,
      aa * c + cc * d,
      bb * c + dd * d,
      aa * e + cc * f + ee,
      bb * e + dd * f + ff,
    ];
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.matrix = [a, b, c, d, e, f];
  }
  translate(x: number, y: number) {
    this.transform(1, 0, 0, 1, x, y);
  }
  scale(x: number, y: number) {
    this.transform(x, 0, 0, y, 0, 0);
  }
  rotate(angle: number) {
    this.transform(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0);
  }
  clearRect() {
    surface(this.canvas).data.fill(0);
  }
  measureText(text: string) {
    return {
      width: Array.from(text).length * 10,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.trim() ? Array.from(text.trimEnd()).length * 10 : 0,
      actualBoundingBoxAscent: text.trim() ? 15 : 0,
      actualBoundingBoxDescent: text.trim() ? 5 : 0,
      fontBoundingBoxAscent: 15,
      fontBoundingBoxDescent: 5,
    };
  }
  fillRect(x: number, y: number, width: number, height: number) {
    const [a, b, c, d, e, f] = this.matrix,
      determinant = a * d - b * c,
      pixels = surface(this.canvas).data;
    const corners = [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height],
    ].map(([cx, cy]) => ({ x: a * cx! + c * cy! + e, y: b * cx! + d * cy! + f }));
    const left = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.x)))),
      right = Math.min(this.canvas.width, Math.ceil(Math.max(...corners.map((point) => point.x)))),
      top = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.y)))),
      bottom = Math.min(
        this.canvas.height,
        Math.ceil(Math.max(...corners.map((point) => point.y))),
      );
    for (let py = top; py < bottom; py++)
      for (let px = left; px < right; px++) {
        const dx = px + 0.5 - e,
          dy = py + 0.5 - f,
          lx = (d * dx - c * dy) / determinant,
          ly = (-b * dx + a * dy) / determinant;
        if (lx >= x && lx < x + width && ly >= y && ly < y + height)
          pixels.set([255, 255, 255, 255], (py * this.canvas.width + px) * 4);
      }
  }
  fillText(text: string, x: number, y: number) {
    nativeCalls.push({ text, font: this.font, mode: "fill" });
    for (const [index, character] of Array.from(text).entries())
      if (character.trim()) this.fillRect(x + index * 10, y - 15, 8, 20);
  }
  strokeText(text: string, x: number, y: number) {
    nativeCalls.push({ text, font: this.font, mode: "stroke" });
    this.fillText(text, x, y);
  }
  drawImage(
    image: HTMLCanvasElement,
    x: number,
    y: number,
    width = image.width,
    height = image.height,
  ) {
    const [a, b, c, d, e, f] = this.matrix,
      determinant = a * d - b * c,
      from = surface(image).data,
      to = surface(this.canvas).data;
    for (let py = 0; py < this.canvas.height; py++)
      for (let px = 0; px < this.canvas.width; px++) {
        const dx = px + 0.5 - e,
          dy = py + 0.5 - f,
          u = ((d * dx - c * dy) / determinant - x) / width,
          v = ((-b * dx + a * dy) / determinant - y) / height;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const offset =
          (Math.floor(v * image.height) * image.width + Math.floor(u * image.width)) * 4;
        to.set(from.subarray(offset, offset + 4), (py * this.canvas.width + px) * 4);
      }
  }
  getImageData() {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
      data: surface(this.canvas).data.slice(),
    };
  }
  createImageData(width: number, height: number) {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  }
  putImageData(image: { data: Uint8ClampedArray }) {
    surface(this.canvas).data.set(image.data);
  }
}

function nativeBoundary() {
  surfaces = new WeakMap();
  nativeCalls = [];
  const contexts = new WeakMap<HTMLCanvasElement, NativeTextContext>();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      // The unrelated sheet surface keeps HappyDOM's absent native painter.
      if (
        this.hasAttribute("data-sheet-canvas") ||
        this.hasAttribute("data-sheet-foreground-canvas")
      )
        return null;
      let context = contexts.get(this);
      if (!context) {
        context = new NativeTextContext(this);
        contexts.set(this, context);
      }
      return context as unknown as CanvasRenderingContext2D;
    },
  );
  vi.spyOn(measurement, "getBrowserShapeTextMeasurement").mockReturnValue({
    measurer: {
      measure: (text) => Array.from(text).length * 10,
      measureMetrics: (text) => ({
        width: Array.from(text).length * 10,
        ascent: text.trim() ? 15 : 0,
        descent: text.trim() ? 5 : 0,
        inkLeft: 0,
        inkRight: text.trim() ? Array.from(text.trimEnd()).length * 10 : 0,
      }),
    },
    resolveNormalLineMetrics: () => ({
      metrics: { ascent: 15, descent: 5, lineAdvance: 20 },
      policy: "provided-native",
    }),
  });
}

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  clearShapeTextPaintCache();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function workspaceState(wrapper: VueWrapper) {
  return (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    session: ReturnType<typeof createWorkbookSession>;
    shapeCreation: ReturnType<typeof useShapeCreation>;
    shapeTextEdit: ReturnType<typeof useShapeTextEditSession>;
    shapeGroupFormatPane: ReturnType<typeof useOwnedShapeGroupFormatPane>;
    sheetGridRef: {
      selectShapeObjects(paths: readonly (readonly string[])[]): boolean;
      getSelectedShapeObjects(): readonly (readonly string[])[];
    };
    saveError: string | undefined;
    undo(): void;
    redo(): void;
  };
}
function storedWordArt(id = "art") {
  const workbook = createWorkbook({ id: `live-warp-${id}`, sheetId: "warp-sheet" }),
    sheet = getActiveSheet(workbook),
    metrics = createPictureSheetMetrics(sheet);
  const drawing = createModernWordArtDrawing({
    id,
    name: id,
    placeholder: "Warp source",
    address: { row: 0, column: 0 },
    metrics,
    choice: WORDART_STYLE_PRESETS.find((preset) => preset.id === "accent3-solid")!,
  });
  drawing.fontSize = 24;
  drawing.shapeText!.layout.autoFit = "none";
  sheet.drawings = [drawing];
  return { workbook, sheet, metrics, drawing };
}
async function workspace(workbook: ReturnType<typeof createWorkbook>) {
  nativeBoundary();
  const snapshot = serializeWorkbook(workbook),
    wrapper = mount(SpreadsheetWorkspace, {
      attachTo: document.body,
      props: {
        workbookStore: {
          load: async () => ({ revision: 1, savedAt: 1, snapshot }),
          save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
          replace: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        },
        imageAssetStore: createMemoryImageAssetStore(),
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
  mounted.push(wrapper);
  await flushPromises();
  const state = workspaceState(wrapper);
  expect(state.saveError).toBeUndefined();
  expect(state.shapeCreation.request.value).toBeUndefined();
  expect(serializeWorkbook(state.session.workbook)).toEqual(snapshot);
  return { wrapper, state, sheet: getActiveSheet(state.session.workbook), snapshot };
}
async function textEffects(wrapper: VueWrapper) {
  const pane = wrapper.getComponent(ShapeFormatPane);
  await pane.get(".shape-format-pane__modes button:nth-child(2)").trigger("click");
  await pane.get('[role="tab"][id$="text-effects-tab"]').trigger("click");
  await pane.get("[data-text-transform-section] > button").trigger("click");
  const gallery = pane.getComponent(WordArtTransformGallery);
  expect(gallery.findAll("[data-wordart-transform-choice]")).toHaveLength(41);
  expect(gallery.props("disabled")).toBe(false);
  return { pane, gallery };
}
function rootArt(sheet: ReturnType<typeof getActiveSheet>) {
  const drawing = sheet.drawings!.find((source) => source.id === "art")!;
  if (!isFramedShapeDrawing(drawing) || drawing.kind !== "shape" || !drawing.wordArt)
    throw Error("Expected the real stored modern WordArt root.");
  return drawing;
}

test("real Workspace gallery warps a modern root, keeps history and straight F2 source editing, and removes warp sparsely", async () => {
  const { wrapper, state, sheet, snapshot } = await workspace(storedWordArt().workbook);
  const originalFrame = rootArt(sheet).shapeFrame;
  expect(snapshot.version).toBe(70);
  expect(state.sheetGridRef.selectShapeObjects([["art"]])).toBe(true);
  await flushPromises();
  await wrapper.getComponent(SheetDrawingLayer).get("[data-shape-format-trigger]").trigger("click");
  await flushPromises();
  const { pane, gallery } = await textEffects(wrapper),
    paneUid = pane.vm.$.uid;
  expect(pane.props("snapshot")!.owner.drawingId).toBe("art");
  expect(
    gallery.get('[data-wordart-transform-choice="textNoShape"]').attributes("aria-checked"),
  ).toBe("true");
  await gallery.get('[data-wordart-transform-choice="textArchUp"]').trigger("click");
  await flushPromises();
  expect(rootArt(sheet).shapeText?.warp).toEqual({ preset: "textArchUp" });
  expect(rootArt(sheet).text).toBe("Warp source");
  expect(rootArt(sheet).shapeFrame).toEqual(originalFrame);
  expect(state.session.history.undoStack).toHaveLength(1);
  expect(wrapper.getComponent(ShapeFormatPane).vm.$.uid).toBe(paneUid);
  expect(
    gallery.get('[data-wordart-transform-choice="textArchUp"]').attributes("aria-checked"),
  ).toBe("true");
  const warped = serializeWorkbook(state.session.workbook);
  expect(warped.version).toBe(71);
  expect(nativeCalls.some((call) => call.text === "W" && call.font.includes("24px"))).toBe(true);
  state.undo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(snapshot);
  state.redo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(warped);

  await wrapper
    .getComponent(SheetDrawingLayer)
    .get('[data-sheet-drawing-id="art"]')
    .trigger("keydown", { key: "F2" });
  await flushPromises();
  const editor = wrapper.getComponent(ShapeCanvasTextEditor),
    input = editor.get("[data-shape-rich-text-input]");
  expect(editor.props("rich")).toBe(true);
  expect(input.element.textContent).toBe("Warp source");
  expect(document.querySelector("[data-shape-text-source-preview-note]")?.textContent).toContain(
    "Edit the straight source text. Applying preserves the current WordArt transform.",
  );
  expect(state.shapeTextEdit.snapshot.value?.draftView.shapeText?.warp).toEqual({
    preset: "textArchUp",
  });
  for (const element of [input.element, ...input.findAll("span").map((span) => span.element)]) {
    expect((element as HTMLElement).style.transform).toBe("");
    expect((element as HTMLElement).style.clipPath).toBe("");
  }
  expect(wrapper.getComponent(ShapeFormatPane).props("capabilities")?.textWarp?.enabled).toBe(
    false,
  );
  writeTextDomSelection(input.element as HTMLElement, { start: 0, end: 11, direction: "forward" });
  await input.trigger("beforeinput", { inputType: "insertText", data: "Edited art" });
  expect(state.shapeTextEdit.snapshot.value?.draftText).toBe("Edited art");
  expect(serializeWorkbook(state.session.workbook)).toEqual(warped);
  await input.trigger("keydown", { key: "Enter", ctrlKey: true });
  await flushPromises();
  expect(state.shapeTextEdit.snapshot.value).toBeUndefined();
  expect(wrapper.findComponent(ShapeCanvasTextEditor).exists()).toBe(false);
  expect(rootArt(sheet).text).toBe("Edited art");
  expect(rootArt(sheet).shapeText?.warp).toEqual({ preset: "textArchUp" });
  const edited = serializeWorkbook(state.session.workbook);
  expect(state.session.history.undoStack).toHaveLength(2);
  state.undo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(warped);
  state.redo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(edited);

  await wrapper.getComponent(SheetDrawingLayer).get("[data-shape-format-trigger]").trigger("click");
  await flushPromises();
  const { gallery: removal } = await textEffects(wrapper);
  await removal.get('[data-wordart-transform-choice="textNoShape"]').trigger("click");
  await flushPromises();
  expect(Object.hasOwn(rootArt(sheet).shapeText!, "warp")).toBe(false);
  expect(rootArt(sheet).text).toBe("Edited art");
  expect(serializeWorkbook(state.session.workbook).version).toBe(70);
  expect(state.session.history.undoStack).toHaveLength(3);
  expect(
    removal.get('[data-wordart-transform-choice="textNoShape"]').attributes("aria-checked"),
  ).toBe("true");
  state.undo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(edited);
}, 15_000);

test("real restored Workspace leaf gallery owns one group path and rejects its captured callback after selection changes", async () => {
  const fixture = storedWordArt("leaf"),
    sibling = { ...fixture.drawing, id: "sibling", name: "Sibling", text: "Other source" };
  sibling.shapeText = { ...sibling.shapeText!, warp: { preset: "textSlantUp" } };
  sibling.shapeFrame = {
    kind: "shape-frame-v1",
    anchor: { mode: "fixed", x: 350, y: 24, size: { width: 180, height: 100 } },
  };
  fixture.sheet.drawings = groupShapeRoots(
    [fixture.drawing, sibling],
    ["leaf", "sibling"],
    { id: "group", name: "Owned WordArt" },
    fixture.metrics,
  );
  const { wrapper, state, sheet, snapshot } = await workspace(fixture.workbook);
  expect(snapshot.version).toBe(71);
  const group = sheet.drawings![0]!;
  if (!isShapeGroupDrawing(group)) throw Error("Expected restored actual group.");
  expect(group.members[1]).toHaveProperty("shapeText.warp", { preset: "textSlantUp" });
  expect(state.sheetGridRef.selectShapeObjects([["group", "leaf"]])).toBe(true);
  await flushPromises();
  wrapper.getComponent(SheetDrawingLayer).vm.$emit("formatGroup", group, ["group", "leaf"]);
  await flushPromises();
  const { pane, gallery } = await textEffects(wrapper),
    owner = pane.props("snapshot")!.owner;
  expect(owner.drawingId).toBe("leaf");
  expect(state.shapeGroupFormatPane.root.value).toBe(group);
  expect(state.shapeGroupFormatPane.path.value).toEqual(["group", "leaf"]);
  expect(pane.props("snapshot")!.drawing.id).toBe("leaf");
  await gallery.get('[data-wordart-transform-choice="textWave1"]').trigger("click");
  await flushPromises();
  const changed = sheet.drawings![0]!;
  if (!isShapeGroupDrawing(changed)) throw Error("Expected retained actual owner.");
  expect(changed.members[0]).toHaveProperty("shapeText.warp", { preset: "textWave1" });
  expect(changed.members[1]).toEqual(group.members[1]);
  expect(changed.members[1]).toHaveProperty("shapeText.warp", { preset: "textSlantUp" });
  expect(changed.shapeFrame).toEqual(group.shapeFrame);
  expect(changed.members[0]!.groupFrame).toEqual(group.members[0]!.groupFrame);
  expect(changed.members[0]).toHaveProperty("text", "Warp source");
  expect(state.session.history.undoStack).toHaveLength(1);
  const warped = serializeWorkbook(state.session.workbook);
  expect(warped.version).toBe(71);
  state.undo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(snapshot);
  state.redo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(warped);

  const captured = pane.props("snapshot")!,
    submit = pane.props("onIntent"),
    staleGallerySelect = gallery.props("onSelect")!,
    staleIntent = {
      type: "set-text-warp" as const,
      owner: { ...captured.owner },
      baseRevision: captured.revision,
      intentId: "captured-leaf-warp",
      value: { preset: "textCurveUp" as const },
    };
  expect(state.sheetGridRef.selectShapeObjects([["group", "sibling"]])).toBe(true);
  await flushPromises();
  expect(submit(staleIntent)).toBe(false);
  expect(staleGallerySelect(WORDART_TRANSFORM_PRESETS[2]!, { isCurrent: () => true })).toBe(false);
  expect(serializeWorkbook(state.session.workbook)).toEqual(warped);
  expect(state.session.history.undoStack).toHaveLength(1);
  expect(state.sheetGridRef.getSelectedShapeObjects()).toEqual([["group", "sibling"]]);
});

async function wordArtStyles(wrapper: VueWrapper) {
  const pane = wrapper.getComponent(ShapeFormatPane);
  await pane.get(".shape-format-pane__modes button:nth-child(2)").trigger("click");
  await pane.get('[role="tab"][id$="text-fill-line-tab"]').trigger("click");
  const gallery = pane.getComponent(WordArtStyleGallery);
  expect(gallery.findAll("[data-wordart-style-choice]")).toHaveLength(25);
  return { pane, gallery };
}

test.each(["root", "owned"] as const)(
  "real Workspace %s WordArt reapplies all-object appearance and clears effects with exact history and owner",
  async (ownership) => {
    const fixture = storedWordArt(),
      source = fixture.drawing;
    source.rotation = 37;
    source.shapeText!.layout.autoFit = "resize-shape";
    source.shapeText!.warp = { preset: "textSlantUp" };
    source.shapeText!.characterRuns = [
      {
        start: 0,
        end: 4,
        fontSize: 32,
        bold: false,
        italic: true,
        underline: true,
        color: "#FF0000",
        line: { kind: "none" },
      },
    ];
    const sibling = { ...source, id: "sibling", name: "Sibling", text: "Other art" };
    sibling.shapeFrame = {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 350, y: 24, size: { width: 180, height: 100 } },
    };
    if (ownership === "owned")
      fixture.sheet.drawings = groupShapeRoots(
        [source, sibling],
        ["art", "sibling"],
        { id: "group", name: "WordArt group" },
        fixture.metrics,
      );
    const { wrapper, state, sheet, snapshot } = await workspace(fixture.workbook),
      path = ownership === "root" ? ["art"] : ["group", "art"];
    function target() {
      const root = sheet.drawings![0]!;
      const drawing = isShapeGroupDrawing(root) ? root.members[0]! : root;
      if (drawing.kind !== "shape" || !drawing.wordArt) throw Error("Expected WordArt target");
      return drawing;
    }
    const before = JSON.parse(JSON.stringify(target())),
      originalGroup = JSON.parse(JSON.stringify(sheet.drawings![0]!));
    expect(state.sheetGridRef.selectShapeObjects([path])).toBe(true);
    await flushPromises();
    if (ownership === "root")
      await wrapper
        .getComponent(SheetDrawingLayer)
        .get("[data-shape-format-trigger]")
        .trigger("click");
    else wrapper.getComponent(SheetDrawingLayer).vm.$emit("formatGroup", sheet.drawings![0]!, path);
    await flushPromises();
    const { pane, gallery } = await wordArtStyles(wrapper);
    expect(gallery.props("disabled")).toBe(false);
    expect(pane.props("snapshot")!.owner.drawingId).toBe("art");
    await gallery.get('[data-wordart-style-choice="neutral-solid"]').trigger("click");
    await flushPromises();
    const styled = target();
    expect(styled.text).toBe(before.text);
    expect(styled.rotation).toBe(37);
    expect(styled.shapeText!.warp).toEqual(before.shapeText.warp);
    expect(styled.shapeText!.characterRuns).toEqual([
      { start: 0, end: 4, fontSize: 32, bold: false, italic: true, underline: true },
    ]);
    expect({ ...styled, shapeText: before.shapeText }).toEqual(before);
    expect(styled.shapeText!.style).toEqual(
      WORDART_STYLE_PRESETS.find((p) => p.id === "neutral-solid")!.style,
    );
    if (isShapeGroupDrawing(sheet.drawings![0]!)) {
      const group = sheet.drawings![0]!;
      if (!isShapeGroupDrawing(group)) throw Error("Group");
      expect(group.members[1]).toEqual(originalGroup.members[1]);
      expect(group.shapeFrame).toEqual(originalGroup.shapeFrame);
    }
    expect(state.session.history.undoStack).toHaveLength(1);
    const reapplied = serializeWorkbook(state.session.workbook);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(snapshot);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(reapplied);
    await pane.get("[data-clear-wordart-effects]").trigger("click");
    await flushPromises();
    expect(target().shapeText).not.toHaveProperty("warp");
    expect(target().text).toBe(before.text);
    expect(target().shapeText!.characterRuns).toEqual(styled.shapeText!.characterRuns);
    expect(target().rotation).toBe(37);
    expect(target().shapeText!.style!.shadow).toEqual({ kind: "none" });
    expect(state.session.history.undoStack).toHaveLength(2);
    const cleared = serializeWorkbook(state.session.workbook);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(reapplied);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(cleared);
  },
  15_000,
);
