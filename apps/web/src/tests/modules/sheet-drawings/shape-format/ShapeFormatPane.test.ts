import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Select } from "tdesign-vue-next/es/select";
import { createAppI18n } from "../../../../shared/i18n";
import ShapeFormatPane from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import ShapeFormatNumberField from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatNumberField.vue";
import ShapeFormatCheckbox from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatCheckbox.vue";
import PicturePaintNumber from "../../../../modules/sheet-images/components/format-pane/PicturePaintNumber.vue";
import PicturePaintEditor from "../../../../modules/sheet-images/components/format-pane/PicturePaintEditor.vue";
import PictureLineEditor from "../../../../modules/sheet-images/components/format-pane/PictureLineEditor.vue";
import PictureFormat3dEditor from "../../../../modules/sheet-images/components/format-pane/PictureFormat3dEditor.vue";
import PictureRotation3dEditor from "../../../../modules/sheet-images/components/format-pane/PictureRotation3dEditor.vue";
import type {
  ShapeFormatCapabilities,
  ShapeFormatIntent,
  ShapeFormatNumberField as NumberField,
  ShapeFormatSnapshot,
} from "../../../../modules/sheet-drawings/shape-format-pane-model";
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function snapshot(): ShapeFormatSnapshot {
  return {
    owner: { workbookId: "book", sheetId: "sheet", drawingId: "shape", sessionId: "session" },
    revision: 2,
    drawing: {
      id: "shape",
      name: "Rounded rectangle",
      kind: "shape",
      shape: "roundedRectangle",
      shapeGeometry: { preset: "roundRect" },
      anchor: { row: 2, column: 3 },
      offsetX: 0,
      offsetY: 0,
      width: 288,
      height: 192,
      rotation: 37,
      text: "shape\ntext",
      fill: "#4472C4",
      stroke: "#203864",
      strokeWidth: 1,
      color: "#FFFFFF",
      fontSize: 12,
      bold: false,
      italic: false,
    },
    values: {
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
      textVerticalAlignment: "top",
      textDirection: "horizontal",
      textMarginLeftPt: 7.2,
      textMarginRightPt: 7.2,
      textMarginTopPt: 3.6,
      textMarginBottomPt: 3.6,
      textResizeToFit: false,
      textOverflow: false,
      textWrap: true,
      fontFamily: "Inter",
      fontSizePt: 12,
      textBold: false,
      textItalic: false,
      paragraphAlignment: "left",
    },
    shapeStyle: {
      fill: {
        kind: "value",
        value: { kind: "solid", color: { kind: "rgb", rgb: "#4472C4" }, opacity: 1 },
      },
    },
  };
}
const capabilities: ShapeFormatCapabilities = {
  fields: {
    sizeWidthPt: { enabled: true, min: 1, max: 16384 },
    sizeHeightPt: { enabled: true, min: 1, max: 16384 },
    rotationDeg: { enabled: true, min: -360, max: 360 },
    textWrap: { enabled: true },
    textMarginLeftPt: { enabled: true, min: 0 },
    textMarginRightPt: { enabled: true, min: 0 },
    textMarginTopPt: { enabled: true, min: 0 },
    textMarginBottomPt: { enabled: true, min: 0 },
  },
  styles: { shape: { fill: { enabled: true }, line: { enabled: true } } },
  lineEnds: { enabled: false, reason: "Closed shape has no arrowheads" },
};
function fixture(overrides: Record<string, unknown> = {}) {
  const onIntent = vi.fn((_intent: ShapeFormatIntent) => true);
  const wrapper = mount(ShapeFormatPane, {
    attachTo: document.body,
    props: { snapshot: snapshot(), capabilities, onIntent, t: (key) => key, ...overrides },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        ColorPaletteSelect: {
          props: ["modelValue", "disabled", "label"],
          emits: ["select"],
          template: '<button type="button" :disabled="disabled" :aria-label="label" />',
        },
      },
    },
  });
  wrappers.push(wrapper);
  return { wrapper, onIntent };
}
function number(wrapper: VueWrapper, field: NumberField) {
  return wrapper
    .findAllComponents(ShapeFormatNumberField)
    .find((component) => component.props("field") === field)!;
}
function input(wrapper: VueWrapper, field: NumberField) {
  return number(wrapper, field).getComponent(Input).get<HTMLInputElement>("input");
}
async function textMode(wrapper: VueWrapper) {
  await wrapper.get(".shape-format-pane__modes button:nth-child(2)").trigger("click");
}
describe("shape format pane desktop reference surface", () => {
  test("two real modes each expose three tabs, six concrete panels and generic structured editors", async () => {
    const { wrapper } = fixture();
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      "fillLineTab",
      "effectsTab",
      "sizePropertiesTab",
    ]);
    expect(wrapper.findAll('[role="tabpanel"]')).toHaveLength(6);
    expect(wrapper.findAllComponents(PicturePaintEditor)).toHaveLength(4); // Fill plus line paint, for shape and text.
    expect(wrapper.findAllComponents(PictureLineEditor)).toHaveLength(2);
    expect(wrapper.findAllComponents(PictureFormat3dEditor)).toHaveLength(2);
    expect(wrapper.findAllComponents(PictureRotation3dEditor)).toHaveLength(2);
    expect(wrapper.text()).toContain("Relative to original picture size");
    expect(wrapper.text()).toContain("Shapes do not have an original picture size");
    expect(wrapper.text()).toContain("Closed shape has no arrowheads");
    expect(wrapper.findAll('[data-shape-format-field="shapeKeepTextFlat"]')).toHaveLength(1);
    expect(wrapper.find('[data-shape-format-field="textKeepTextFlat"]').exists()).toBe(false);
    await textMode(wrapper);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      "Text Fill & Outline",
      "effectsTab",
      "Text Box",
    ]);
    for (const field of [
      "textMarginLeftPt",
      "textMarginRightPt",
      "textMarginTopPt",
      "textMarginBottomPt",
      "textDirection",
      "textLineOrder",
      "textVerticalAlignment",
      "textResizeToFit",
      "textWrap",
      "textOverflow",
      "fontFamily",
      "paragraphAlignment",
      "paragraphLineSpacing",
    ])
      expect(wrapper.find(`[data-shape-format-field="${field}"]`).exists()).toBe(true);
  });
  test("inches commit points only on explicit blur/Enter and unit changes do not reinterpret a draft", async () => {
    const { wrapper, onIntent } = fixture({ initialUnit: "in" });
    const field = input(wrapper, "sizeWidthPt");
    expect(field.element.value).toBe("3");
    await field.setValue("2.75");
    expect(onIntent).not.toHaveBeenCalled();
    const unit = wrapper
      .findAllComponents(Select)
      .find((component) => component.attributes("data-shape-format-units") !== undefined)!;
    expect(unit.props("disabled")).toBe(true);
    await field.trigger("keydown", { key: "Enter" });
    expect(onIntent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "set-field",
        field: "sizeWidthPt",
        value: 198,
        baseRevision: 2,
      }),
    );
    await field.trigger("blur");
    expect(onIntent).toHaveBeenCalledTimes(1);
  });
  test("false and thrown transactions retain numeric digits with clear feedback", async () => {
    for (const onIntent of [
      vi.fn(() => false),
      vi.fn(() => {
        throw Error("failed");
      }),
    ]) {
      const { wrapper } = fixture({ onIntent });
      const field = input(wrapper, "sizeWidthPt");
      await field.setValue("240.5");
      await field.trigger("blur");
      expect(field.element.value).toBe("240.5");
      expect(
        wrapper
          .findAll('[role="alert"]')
          .some((element) => element.text().includes("Your draft has been kept")),
      ).toBe(true);
      expect(onIntent).toHaveBeenCalledTimes(1);
    }
  });
  test("an unrelated external revision clears drafts and retained numeric callbacks reject stale targets", async () => {
    const { wrapper, onIntent } = fixture();
    const oldAction = number(wrapper, "sizeWidthPt")
      .getComponent(PicturePaintNumber)
      .props("onCommit");
    await input(wrapper, "sizeWidthPt").setValue("240.");
    await wrapper.setProps({
      snapshot: { ...snapshot(), revision: 3, values: { ...snapshot().values, sizeWidthPt: 200 } },
    });
    expect(input(wrapper, "sizeWidthPt").element.value).toBe("200");
    expect(oldAction(300)).toBe(false);
    expect(onIntent).not.toHaveBeenCalled();
    await wrapper.setProps({
      snapshot: {
        ...snapshot(),
        owner: { ...snapshot().owner, drawingId: "other", sessionId: "other-session" },
        drawing: { ...snapshot().drawing, id: "other" },
      },
    });
    expect(oldAction(400)).toBe(false);
    expect(onIntent).not.toHaveBeenCalled();
  });
  test("accepted own revision preserves another partially typed field without remounting", async () => {
    const { wrapper, onIntent } = fixture();
    const height = input(wrapper, "sizeHeightPt"),
      element = height.element;
    await height.setValue("155.");
    const accepted = number(wrapper, "sizeWidthPt")
      .getComponent(PicturePaintNumber)
      .props("onCommit")(230);
    expect(accepted).toBe(true);
    const intent = onIntent.mock.calls.at(-1)![0];
    await wrapper.setProps({
      snapshot: {
        ...snapshot(),
        revision: 3,
        acceptedIntentId: intent.intentId,
        values: { ...snapshot().values, sizeWidthPt: 230 },
      },
    });
    expect(input(wrapper, "sizeHeightPt").element).toBe(element);
    expect(input(wrapper, "sizeHeightPt").element.value).toBe("155.");
    await height.trigger("blur");
    expect(onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ field: "sizeHeightPt", value: 155, baseRevision: 3 }),
    );
  });
  test("boolean rejection stays controlled and margin presets create one atomic intent", async () => {
    const onIntent = vi.fn(() => false),
      { wrapper } = fixture({ onIntent });
    const wrap = wrapper
      .findAllComponents(ShapeFormatCheckbox)
      .find((component) => component.props("field") === "textWrap")!;
    wrap.getComponent(Checkbox).vm.$emit("change", false);
    await flushPromises();
    expect(wrap.getComponent(Checkbox).props("modelValue")).toBe(true);
    expect(wrapper.text()).toContain("Your draft has been kept");
    await textMode(wrapper);
    const margins = wrapper
      .findAllComponents(Select)
      .find((component) => component.attributes("aria-label") === "Text margins")!;
    margins.vm.$emit("change", "none");
    await flushPromises();
    expect(onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "set-text-margins",
        value: { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 },
      }),
    );
  });
  test("source callbacks are explicit and asynchronous file results cannot survive a revision change", async () => {
    let complete!: (value: string) => void;
    const loadPaintAsset = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          complete = resolve;
        }),
    );
    const { wrapper, onIntent } = fixture({ loadPaintAsset });
    const paint = wrapper.findAllComponents(PicturePaintEditor)[0]!;
    expect(paint.props("sourceAssetId")).toBeUndefined();
    expect(loadPaintAsset).not.toHaveBeenCalled();
    const loader = paint.props("loadAsset")!,
      apply = paint.props("onCommit");
    const pending = loader(new Blob(["synthetic"]));
    expect(loadPaintAsset).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ snapshot: { ...snapshot(), revision: 3 } });
    complete("document-owned-asset");
    expect(await pending).toBeUndefined();
    expect(apply({ kind: "none" })).toBe(false);
    expect(onIntent).not.toHaveBeenCalled();
  });
  test("shape-specific captions localize, unknown features remain visibly disabled, Escape closes once", async () => {
    const { wrapper } = fixture({ locale: "zh-CN" });
    expect(wrapper.text()).toContain("形状选项");
    expect(wrapper.text()).toContain("文本选项");
    const overflow = wrapper
      .findAllComponents(ShapeFormatCheckbox)
      .find((component) => component.props("field") === "textOverflow")!;
    expect(overflow.getComponent(Checkbox).props("disabled")).toBe(true);
    expect(overflow.text()).toContain("暂不支持");
    await wrapper.trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
