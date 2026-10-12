import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { computed, defineComponent, effectScope, h, ref } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Select } from "tdesign-vue-next/es/select";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { anchorShapeFrameRect, resolveShapeFrame } from "@sheetcraft/core/shape-frame";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import {
  isFramedShapeDrawing,
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createAppI18n } from "../../../shared/i18n";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { useOwnedShapeFormatPane } from "../../../modules/sheet-drawings/useOwnedShapeFormatPane";
import {
  prepareDrawingShapeTextCandidate,
  type DrawingShapeTextRuntimeOptions,
} from "../../../modules/sheet-drawings/shape-text-runtime";
import type { ShapeFormatIntent } from "../../../modules/sheet-drawings/shape-format-pane-model";
import ShapeFormatPane from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import ShapeFormatNumberField from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatNumberField.vue";
import ShapeFormatCheckbox from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatCheckbox.vue";
import ShapeFormatChoiceField from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatChoiceField.vue";
import ShapeFormatTextField from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatTextField.vue";

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((stop) => stop());
  document.body.replaceChildren();
});
const measurement: DrawingShapeTextRuntimeOptions = {
  measurer: {
    measure: (text) => [...text].length * 10,
    measureMetrics: (text) => ({
      width: [...text].length * 10,
      ascent: 15,
      descent: 5,
      inkLeft: 0,
      inkRight: [...text].length * 10,
    }),
  },
  normalLineMetrics: { ascent: 15, descent: 5, lineAdvance: 20 },
};
function fixture(
  options: { legacy?: boolean; metrics?: boolean; kind?: "shape" | "textBox"; text?: string } = {},
) {
  const workbook = ref(createWorkbook({ id: "canonical-pane", sheetId: "shapes" })),
    sheet = ref(getActiveSheet(workbook.value)),
    revision = ref(0),
    generation = ref(0),
    busy = ref(false);
  const metrics = computed(() => {
    void revision.value;
    return createPictureSheetMetrics(sheet.value);
  });
  const legacy = {
    ...createGraphicDrawing("shape", options.kind ?? "shape", "Shape", { row: 2, column: 3 }),
    width: 288,
    height: 192,
    offsetX: 17,
    offsetY: 8,
    rotation: 37,
    text: options.text ?? "",
  };
  if (options.legacy) sheet.value.drawings = [legacy];
  else {
    const { anchor, offsetX, offsetY, width, height, ...appearance } = legacy;
    sheet.value.drawings = [
      normalizeSheetDrawing({
        ...appearance,
        kind: options.kind ?? "shape",
        shapeFrame: {
          kind: "shape-frame-v1",
          anchor: anchorShapeFrameRect(
            "move-and-size",
            {
              x: metrics.value.columns.visiblePrefix(anchor.column) + offsetX,
              y: metrics.value.rows.visiblePrefix(anchor.row) + offsetY,
              width,
              height,
            },
            metrics.value,
          ),
        },
      }),
    ];
  }
  const session = createWorkbookSession({
    workbook: workbook.value,
    idFactory: createSequentialIdFactory(),
  });
  const update = vi.fn((next: SheetDrawing, owner: SheetDrawing) => {
    if (sheet.value.drawings?.find((drawing) => drawing.id === owner.id) !== owner) return false;
    const changed = executeWorkbookCommand(
      session,
      createSetSheetDrawingsCommand(sheet.value.id, [next]),
    );
    if (changed) revision.value++;
    return changed;
  });
  const assets = vi.fn((_id: string) => true);
  const prepareText = vi.fn((next: SheetGraphicDrawing, _current: SheetGraphicDrawing) =>
    prepareDrawingShapeTextCandidate(next, measurement),
  );
  const scope = effectScope();
  const pane = scope.run(() =>
    useOwnedShapeFormatPane({
      getWorkbook: () => workbook.value,
      getSheet: () => sheet.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getMetrics: () => (options.metrics === false ? undefined : metrics.value),
      isBusy: () => busy.value,
      flush: () => true,
      update,
      isAssetAvailable: assets,
      getUnsupportedReason: () => "Unavailable",
      prepareText,
    }),
  )!;
  cleanup.push(() => scope.stop());
  const source = () => sheet.value.drawings![0]!;
  const canonical = () => {
    const drawing = source();
    if (!isFramedShapeDrawing(drawing)) throw Error("Expected frame");
    return drawing;
  };
  const layout = () =>
    resolveShapeFrame(canonical().shapeFrame, metrics.value, canonical().rotation);
  const intent = (body: Record<string, unknown>): ShapeFormatIntent =>
    ({
      ...body,
      owner: { ...pane.snapshot.value!.owner },
      baseRevision: revision.value,
      intentId: `intent-${revision.value}`,
    }) as ShapeFormatIntent;
  const field = (name: string, value: unknown) =>
    pane.onIntent(intent({ type: "set-field", field: name, value }));
  const open = () => pane.open(source());
  return {
    workbook,
    sheet,
    revision,
    generation,
    busy,
    metrics,
    session,
    update,
    assets,
    prepareText,
    pane,
    source,
    canonical,
    layout,
    intent,
    field,
    open,
  };
}
function expectCanonicalOnly(drawing: SheetFramedGraphicDrawing) {
  for (const field of [
    "anchor",
    "offsetX",
    "offsetY",
    "width",
    "height",
    "frame",
    "source",
    "scaleWidthPercent",
    "scaleHeightPercent",
  ])
    expect(Object.hasOwn(drawing, field)).toBe(false);
}
function fill() {
  return {
    kind: "value",
    value: { kind: "solid", color: { kind: "rgb", rgb: "#abcdef" }, opacity: 0.5 },
  };
}
function pictureFill() {
  return {
    kind: "value",
    value: {
      kind: "picture",
      assetId: "texture",
      opacity: 1,
      rotateWithShape: true,
      layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
    },
  };
}

describe("canonical exact-owner Size and Properties consumer", () => {
  test("metadata reads preserve actual committed source, sparse defaults, snapshot and history", () => {
    const f = fixture(),
      before = serializeWorkbook(f.workbook.value),
      source = f.source();
    expect(f.open()).toBe(true);
    expect(f.pane.snapshot.value!.drawing).toBe(source);
    expect(f.pane.snapshot.value!.values).toMatchObject({
      sizeWidthPt: 216,
      sizeHeightPt: 144,
      rotationDeg: 37,
      scaleWidthPercent: 100,
      scaleHeightPercent: 100,
      lockAspectRatio: false,
      anchor: "move-size",
      printObject: true,
      locked: true,
      altTitle: "",
      altDescription: "",
    });
    expect(f.source()).toBe(source);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toEqual([]);
    expect(f.pane.capabilities.value.fields.sizeWidthPt?.min).toBe(0.75);
  });
  test("37 degree numeric width and height preserve rotated local NW and one history entry each", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const before = serializeWorkbook(f.workbook.value),
      corner = f.layout().corners[0],
      owner = f.source();
    expect(f.field("sizeWidthPt", 288)).toBe(true);
    expect(f.update.mock.calls[0]![1]).toBe(owner);
    expect(f.layout().rect.width).toBeCloseTo(384, 8);
    expect(f.layout().corners[0].x).toBeCloseTo(corner.x, 8);
    expect(f.layout().corners[0].y).toBeCloseTo(corner.y, 8);
    expect(f.field("sizeHeightPt", 180)).toBe(true);
    expect(f.layout().rect.height).toBeCloseTo(240, 8);
    expect(f.layout().corners[0].x).toBeCloseTo(corner.x, 8);
    expect(f.layout().corners[0].y).toBeCloseTo(corner.y, 8);
    expect(f.session.history.undoStack).toHaveLength(2);
    expectCanonicalOnly(f.canonical());
    const after = serializeWorkbook(f.workbook.value);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(serializeWorkbook(f.workbook.value)).toEqual(after);
  });
  test("scale denominator stays with the selection session and resets on same-owner reselection", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const owner = f.pane.snapshot.value!.owner;
    expect(f.field("sizeWidthPt", 288)).toBe(true);
    expect(f.pane.snapshot.value!.values.scaleWidthPercent).toBeCloseTo(133.333333, 5);
    expect(f.field("scaleWidthPercent", 150)).toBe(true);
    expect(f.layout().rect.width).toBeCloseTo(432, 8);
    expect(f.field("scaleWidthPercent", 200)).toBe(true);
    expect(f.layout().rect.width).toBeCloseTo(576, 8);
    expect(f.pane.snapshot.value!.owner).toEqual(owner);
    expect(f.pane.snapshot.value!.values.scaleHeightPercent).toBeCloseTo(100, 8);
    f.pane.close();
    expect(f.open()).toBe(true);
    expect(f.pane.snapshot.value!.owner.sessionId).not.toBe(owner.sessionId);
    expect(f.pane.snapshot.value!.values.scaleWidthPercent).toBeCloseTo(100, 8);
    expect(f.field("scaleWidthPercent", 50)).toBe(true);
    expect(f.layout().rect.width).toBeCloseTo(288, 8);
    expectCanonicalOnly(f.canonical());
  });
  test("aspect numeric and percent sizes preserve NW, proportion and bounded explicit sizes", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const corner = f.layout().corners[0];
    expect(f.field("lockAspectRatio", true)).toBe(true);
    expect(f.field("sizeWidthPt", 288)).toBe(true);
    expect(f.layout().rect.width).toBeCloseTo(384, 8);
    expect(f.layout().rect.height).toBeCloseTo(256, 8);
    expect(f.field("scaleHeightPercent", 150)).toBe(true);
    expect(f.layout().rect.width).toBeCloseTo(432, 8);
    expect(f.layout().rect.height).toBeCloseTo(288, 8);
    expect(f.layout().corners[0].x).toBeCloseTo(corner.x, 8);
    expect(f.layout().corners[0].y).toBeCloseTo(corner.y, 8);
    const before = serializeWorkbook(f.workbook.value),
      history = f.session.history.undoStack.length;
    for (const [field, value] of [
      ["sizeWidthPt", 0.74],
      ["sizeHeightPt", 12289],
      ["scaleWidthPercent", NaN],
      ["scaleHeightPercent", 1e9],
    ] as const)
      expect(f.field(field, value)).toBe(false);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(history);
  });
  test("rotation and appearance preserve frame; all anchor modes preserve current rectangle", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const frame = JSON.stringify(f.canonical().shapeFrame),
      rect = f.layout().rect;
    expect(f.field("rotationDeg", 79)).toBe(true);
    expect(JSON.stringify(f.canonical().shapeFrame)).toBe(frame);
    expect(
      f.pane.onIntent(
        f.intent({ type: "set-style", target: "shape", category: "fill", value: fill() }),
      ),
    ).toBe(true);
    expect(JSON.stringify(f.canonical().shapeFrame)).toBe(frame);
    for (const mode of ["move", "fixed", "move-size"] as const) {
      expect(f.field("anchor", mode)).toBe(true);
      expect(f.layout().rect.x).toBeCloseTo(rect.x, 8);
      expect(f.layout().rect.y).toBeCloseTo(rect.y, 8);
      expect(f.layout().rect.width).toBeCloseTo(rect.width, 8);
      expect(f.layout().rect.height).toBeCloseTo(rect.height, 8);
      expect(f.pane.snapshot.value!.values.anchor).toBe(mode);
      expectCanonicalOnly(f.canonical());
    }
  });
  test("object properties normalize defaults sparsely and keep text/appearance independent", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const originalText = f.canonical().shapeText;
    for (const [field, value] of [
      ["printObject", false],
      ["locked", false],
      ["lockAspectRatio", true],
      ["altTitle", "Title"],
      ["altDescription", "Description"],
    ] as const)
      expect(f.field(field, value)).toBe(true);
    expect(f.canonical().shapeProperties).toEqual({
      printObject: false,
      locked: false,
      lockAspectRatio: true,
      altTitle: "Title",
      altDescription: "Description",
    });
    expect(f.canonical().shapeText).toEqual(originalText);
    for (const [field, value] of [
      ["printObject", true],
      ["locked", true],
      ["lockAspectRatio", false],
      ["altTitle", ""],
      ["altDescription", ""],
    ] as const)
      expect(f.field(field, value)).toBe(true);
    expect(f.canonical().shapeProperties).toBeUndefined();
    expect(getShapeObjectProperties(f.canonical().shapeProperties).locked).toBe(true);
    expect(f.field("altDescription", "a".repeat(32769))).toBe(false);
  });
  test("no-text-rectangle shapes retain active object metadata controls", () => {
    const f = fixture();
    f.canonical().shapeGeometry = { preset: "line" };
    f.canonical().text = "retained line text";
    f.revision.value++;
    expect(f.open()).toBe(true);
    expect(f.pane.capabilities.value.fields.textWrap?.enabled).toBe(false);
    expect(f.pane.capabilities.value.fields.altTitle?.enabled).toBe(true);
    expect(f.pane.capabilities.value.fields.printObject?.enabled).toBe(true);
    expect(f.field("altTitle", "Line title")).toBe(true);
    expect(f.field("printObject", false)).toBe(true);
    expect(f.canonical().text).toBe("retained line text");
    expect(f.prepareText).not.toHaveBeenCalled();
  });
  test("fully hidden canonical shape keeps collapsed source on metadata and appearance edits", () => {
    const f = fixture();
    const anchor = f.canonical().shapeFrame.anchor;
    if (anchor.mode !== "move-and-size") throw Error("Expected logical span");
    for (let row = anchor.start.row.index; row <= anchor.end.row.index; row++)
      (f.sheet.value.hiddenRows ??= new Set()).add(row);
    f.revision.value++;
    expect(f.open()).toBe(true);
    const originalFrame = JSON.stringify(f.canonical().shapeFrame);
    expect(f.layout().collapsed).toBe(true);
    expect(f.pane.snapshot.value!.values.sizeHeightPt).toBe(0);
    expect(f.field("altDescription", "Hidden shape")).toBe(true);
    expect(
      f.pane.onIntent(
        f.intent({ type: "set-style", target: "shape", category: "fill", value: fill() }),
      ),
    ).toBe(true);
    expect(JSON.stringify(f.canonical().shapeFrame)).toBe(originalFrame);
    expect(f.layout().rect.height).toBe(0);
    f.sheet.value.hiddenRows?.clear();
    f.revision.value++;
    expect(f.layout().rect.height).toBeCloseTo(192, 8);
  });
  test("protected existing unlocked objects can edit but cannot change their lock authorization", () => {
    const f = fixture();
    f.canonical().shapeProperties = { locked: false };
    f.sheet.value.properties.protected = true;
    expect(f.open()).toBe(true);
    expect(f.pane.capabilities.value.fields.sizeWidthPt?.enabled).toBe(true);
    expect(f.pane.capabilities.value.fields.locked?.enabled).toBe(false);
    expect(f.field("sizeWidthPt", 288)).toBe(true);
    expect(f.field("altTitle", "Allowed")).toBe(true);
    const before = serializeWorkbook(f.workbook.value),
      count = f.session.history.undoStack.length;
    expect(f.field("locked", true)).toBe(false);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(count);
    f.pane.close();
    f.canonical().shapeProperties = undefined;
    f.revision.value++;
    expect(f.open()).toBe(false);
    f.sheet.value.protection = { editableRanges: [], editObjects: true };
    expect(f.open()).toBe(true);
    expect(f.field("locked", false)).toBe(true);
  });
  test("false/throw, stale source/session/revision/metrics and assets leave command history unchanged", () => {
    const f = fixture();
    expect(f.open()).toBe(true);
    const before = serializeWorkbook(f.workbook.value),
      source = f.source();
    const edit = f.intent({ type: "set-field", field: "sizeWidthPt", value: 288 });
    f.update.mockReturnValueOnce(false);
    expect(f.pane.onIntent(edit)).toBe(false);
    f.update.mockImplementationOnce(() => {
      throw Error("Rejected");
    });
    expect(f.pane.onIntent(edit)).toBe(false);
    expect(f.source()).toBe(source);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toEqual([]);
    expect(f.pane.snapshot.value!.acceptedIntentId).toBeUndefined();
    f.revision.value++;
    expect(f.pane.onIntent(edit)).toBe(false);
    const current = f.intent({ type: "set-field", field: "sizeWidthPt", value: 288 });
    f.pane.close();
    expect(f.open()).toBe(true);
    expect(f.pane.onIntent(current)).toBe(false);
    f.assets.mockReturnValue(false);
    expect(
      f.pane.onIntent(
        f.intent({ type: "set-style", target: "shape", category: "fill", value: pictureFill() }),
      ),
    ).toBe(false);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toEqual([]);
    f.assets.mockImplementation(() => {
      f.pane.close();
      expect(f.open()).toBe(true);
      return true;
    });
    expect(
      f.pane.onIntent(
        f.intent({ type: "set-style", target: "shape", category: "fill", value: pictureFill() }),
      ),
    ).toBe(false);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toEqual([]);
  });
  test("text preflight uses detached legacy views, raw canonical candidate and exact source CAS", () => {
    const f = fixture({ kind: "textBox", text: "one\ntwo" });
    expect(f.open()).toBe(true);
    const source = f.source(),
      before = serializeWorkbook(f.workbook.value);
    expect(f.field("textResizeToFit", true)).toBe(true);
    const [candidateView, sourceView] = f.prepareText.mock.calls[0]!;
    expect(isFramedShapeDrawing(candidateView)).toBe(false);
    expect(isFramedShapeDrawing(sourceView)).toBe(false);
    expect(sourceView).not.toBe(source);
    expect(sourceView.text).toBe("one\ntwo");
    expect(f.update.mock.calls[0]![1]).toBe(source);
    const raw = f.update.mock.calls[0]![0];
    expect(isFramedShapeDrawing(raw)).toBe(true);
    if (!isFramedShapeDrawing(raw)) throw Error("Expected source frame");
    expect(resolveShapeFrame(raw.shapeFrame, f.metrics.value).rect.height).toBeCloseTo(192, 8);
    expect(raw.text).toBe("one\ntwo");
    expect(serializeWorkbook(f.workbook.value)).not.toEqual(before);
  });
  test.each(["selection", "revision", "metrics", "protection"] as const)(
    "text preflight callback changing %s rejects before commit",
    (boundary) => {
      const f = fixture({ kind: "textBox", text: "one\ntwo" });
      expect(f.open()).toBe(true);
      const source = f.source(),
        beforeDrawings = JSON.stringify(f.sheet.value.drawings);
      f.prepareText.mockImplementationOnce((next, current) => {
        current.shapeText!.layout.wrap = false;
        if (boundary === "selection") {
          f.pane.close();
          expect(f.open()).toBe(true);
        }
        if (boundary === "revision") f.revision.value++;
        if (boundary === "metrics") f.sheet.value.rowHeights.set(0, 31);
        if (boundary === "protection") f.sheet.value.properties.protected = true;
        return prepareDrawingShapeTextCandidate(next, measurement);
      });
      expect(f.field("textWrap", false)).toBe(false);
      expect(f.source()).toBe(source);
      expect(JSON.stringify(f.sheet.value.drawings)).toBe(beforeDrawings);
      expect(f.update).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toEqual([]);
    },
  );
  test("legacy read and ordinary edits stay legacy; explicit object edit alone opts into move-only frame", () => {
    const f = fixture({ legacy: true });
    const before = serializeWorkbook(f.workbook.value),
      source = f.source();
    expect(f.open()).toBe(true);
    expect(f.pane.snapshot.value!.drawing).toBe(source);
    expect(f.pane.snapshot.value!.values.anchor).toBe("move");
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.field("sizeWidthPt", 288)).toBe(true);
    expect(isFramedShapeDrawing(f.source())).toBe(false);
    const legacy = f.source() as SheetGraphicDrawing;
    expect(legacy.width).toBe(384);
    expect(legacy.anchor).toEqual({ row: 2, column: 3 });
    expect(legacy.offsetX).toBe(17);
    expect(
      f.pane.onIntent(
        f.intent({ type: "set-style", target: "shape", category: "fill", value: fill() }),
      ),
    ).toBe(true);
    expect(isFramedShapeDrawing(f.source())).toBe(false);
    expect(f.field("altTitle", "Explicit title")).toBe(true);
    expect(f.canonical().shapeFrame.anchor.mode).toBe("move-only");
    expect(f.layout().rect.width).toBe(384);
    expectCanonicalOnly(f.canonical());
  });
  test("legacy without metrics keeps old controls and refuses frame-only property edits", () => {
    const f = fixture({ legacy: true, metrics: false });
    expect(f.open()).toBe(true);
    expect(f.pane.capabilities.value.fields.altTitle?.enabled).toBe(false);
    expect(f.field("altTitle", "Missing geometry")).toBe(false);
    expect(f.field("sizeWidthPt", 288)).toBe(true);
    expect(isFramedShapeDrawing(f.source())).toBe(false);
  });
});

function livePane(f: ReturnType<typeof fixture>) {
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(ShapeFormatPane, {
          snapshot: f.pane.snapshot.value,
          capabilities: f.pane.capabilities.value,
          onIntent: f.pane.onIntent,
          initialUnit: "in",
          t: (key: string) => key,
        }),
    }),
    {
      attachTo: document.body,
      global: {
        plugins: [createAppI18n("en-US")],
        stubs: {
          ColorPaletteSelect: { props: ["disabled"], template: '<button :disabled="disabled" />' },
        },
      },
    },
  );
  cleanup.push(() => wrapper.unmount());
  return wrapper;
}
function numeric(wrapper: VueWrapper, field: string) {
  return wrapper
    .findAllComponents(ShapeFormatNumberField)
    .find((component) => component.props("field") === field)!
    .getComponent(Input)
    .get<HTMLInputElement>("input");
}
test("concrete pane Size/Properties controls commit canonical values and preserve rejected draft/history", async () => {
  const f = fixture();
  expect(f.open()).toBe(true);
  const wrapper = livePane(f);
  await wrapper.getComponent(ShapeFormatPane).findAll('[role="tab"]')[2]!.trigger("click");
  const width = numeric(wrapper, "sizeWidthPt");
  expect(width.element.disabled).toBe(false);
  expect(width.element.value).toBe("3");
  await width.setValue("4");
  await width.trigger("keydown", { key: "Enter" });
  await flushPromises();
  expect(f.layout().rect.width).toBeCloseTo(384, 8);
  expect(Number(numeric(wrapper, "scaleWidthPercent").element.value)).toBeCloseTo(133.333333, 5);
  const print = wrapper
    .findAllComponents(ShapeFormatCheckbox)
    .find((component) => component.props("field") === "printObject")!
    .getComponent(Checkbox);
  print.props("onChange")!(false, { e: new MouseEvent("click") });
  await flushPromises();
  expect(f.canonical().shapeProperties?.printObject).toBe(false);
  const anchor = wrapper
    .findAllComponents(ShapeFormatChoiceField)
    .find((component) => component.props("field") === "anchor")!
    .getComponent(Select);
  anchor.props("onChange")!("fixed", {} as never);
  await flushPromises();
  expect(f.canonical().shapeFrame.anchor.mode).toBe("fixed");
  const title = wrapper
    .findAllComponents(ShapeFormatTextField)
    .find((component) => component.props("field") === "altTitle")!
    .getComponent(Input);
  title.vm.$emit("change", "Pane title");
  title.vm.$emit("enter");
  await flushPromises();
  expect(f.canonical().shapeProperties?.altTitle).toBe("Pane title");
  const before = serializeWorkbook(f.workbook.value),
    count = f.session.history.undoStack.length;
  f.update.mockReturnValueOnce(false);
  await width.setValue("5");
  await width.trigger("keydown", { key: "Enter" });
  await flushPromises();
  expect(width.element.value).toBe("5");
  expect(
    wrapper
      .findAllComponents(ShapeFormatNumberField)
      .find((component) => component.props("field") === "sizeWidthPt")!
      .getComponent(Input)
      .props("status"),
  ).toBe("error");
  expect(serializeWorkbook(f.workbook.value)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(count);
});
