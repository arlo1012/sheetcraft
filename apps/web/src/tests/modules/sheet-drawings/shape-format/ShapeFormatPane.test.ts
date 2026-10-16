import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Select } from "tdesign-vue-next/es/select";
import { Button } from "tdesign-vue-next/es/button";
import { RadioGroup, RadioButton } from "tdesign-vue-next/es/radio";
import { Tabs } from "tdesign-vue-next/es/tabs";
import { createAppI18n } from "../../../../shared/i18n";
import ShapeFormatPane from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import ShapeFormatNumberField from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatNumberField.vue";
import ShapeFormatCheckbox from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatCheckbox.vue";
import ShapeFormatChoiceField from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatChoiceField.vue";
import ShapeFormatMixedEffect from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatMixedEffect.vue";
import ShapeLineEndsControls from "../../../../modules/sheet-drawings/components/ShapeLineEndsControls.vue";
import NumericField from "../../../../shared/numeric-field/NumericField.vue";
import PicturePaintEditor from "../../../../modules/sheet-images/components/format-pane/PicturePaintEditor.vue";
import PictureLineEditor from "../../../../modules/sheet-images/components/format-pane/PictureLineEditor.vue";
import PictureFormat3dEditor from "../../../../modules/sheet-images/components/format-pane/PictureFormat3dEditor.vue";
import WordArtTransformGallery from "../../../../modules/sheet-drawings/components/WordArtTransformGallery.vue";
import WordArtStyleGallery from "../../../../modules/sheet-drawings/components/WordArtStyleGallery.vue";
import { WORDART_STYLE_PRESETS } from "../../../../modules/sheet-drawings/wordart-style-presets";
import ShapeFormatEffects from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatEffects.vue";
import PictureRotation3dEditor from "../../../../modules/sheet-images/components/format-pane/PictureRotation3dEditor.vue";
import { framedShape } from "../framed-shape-fixture";
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
function groupSnapshot(): ShapeFormatSnapshot {
  const source = snapshot();
  return {
    ...source,
    owner: { ...source.owner, drawingId: "group" },
    drawing: {
      kind: "shapeGroup",
      id: "group",
      name: "Actual group",
      rotation: 31,
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: { mode: "fixed", x: 10, y: 20, size: { width: 360, height: 180 } },
      },
      members: [
        {
          kind: "shape",
          id: "member",
          name: "Actual member",
          shape: "rectangle",
          groupFrame: {
            kind: "shape-group-local-v1",
            rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          },
          rotation: 0,
          text: "member text",
          fill: "#4472C4",
          stroke: "#203864",
          strokeWidth: 1,
          color: "#FFFFFF",
          fontSize: 12,
          bold: false,
          italic: false,
        },
      ],
    },
    values: {
      ...source.values,
      sizeWidthPt: 360,
      sizeHeightPt: 180,
      rotationDeg: 31,
      fontSizePt: undefined,
      fontFamily: undefined,
      textBold: undefined,
      textWrap: undefined,
      textDirection: undefined,
    },
    mixedFields: ["fontSizePt", "fontFamily", "textBold", "textWrap", "textDirection"],
    mixedStyleCategories: { shape: ["fill", "shadow"] },
    scopeDescription: "1 descendant belongs to this selected group.",
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
function retainedNumericAction(wrapper: VueWrapper, field: NumberField) {
  const numeric = number(wrapper, field).getComponent(NumericField);
  const callback = numeric.props("onCommit");
  const context = {
    ownerKey: numeric.props("ownerKey"),
    sessionId: "retained-test",
    source: "external" as const,
  };
  return (value: number) => callback({ kind: "value", value }, context).accepted;
}
async function textMode(wrapper: VueWrapper) {
  wrapper
    .findAllComponents(RadioButton)
    .find((radio) => radio.props("value") === "text")!
    .get<HTMLLabelElement>("label")
    .element.click();
  await flushPromises();
}
describe("shape format pane desktop reference surface", () => {
  test("Text Rotation clearly shares the body camera, retains saved-glyph warning and edits the same Keep Flat field", async () => {
    const state = { ...snapshot(), independentTextCameraCount: 1 };
    const { wrapper, onIntent } = fixture({
      snapshot: state,
      capabilities: {
        ...capabilities,
        fields: { ...capabilities.fields, shapeKeepTextFlat: { enabled: true } },
        styles: { text: { rotation3d: { enabled: true } } },
      },
    });
    await textMode(wrapper);
    const effects = wrapper
      .findAllComponents(ShapeFormatEffects)
      .find((component) => component.props("target") === "text")!;
    expect(effects.text()).toContain("Text and shape use the same body 3-D scene");
    expect(effects.get("[data-independent-text-camera]").text()).toContain(
      "still applied and kept",
    );
    expect(effects.get("[data-independent-text-camera]").text()).toContain("(1)");
    expect(effects.text()).toContain("Text soft edges are a Sheetcraft extension");
    expect(effects.getComponent(ShapeFormatCheckbox).props("field")).toBe("shapeKeepTextFlat");
    const value = { kind: "none" as const };
    expect(effects.getComponent(PictureRotation3dEditor).props("onCommit")(value)).toBe(true);
    expect(onIntent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "set-style",
        target: "text",
        category: "rotation3d",
        value,
        owner: state.owner,
      }),
    );
    await wrapper.setProps({ snapshot: { ...state, independentTextCameraCount: 0 } });
    expect(wrapper.find("[data-independent-text-camera]").exists()).toBe(false);
  });
  test("live connectors expose actual line and endpoint controls without phantom fill, text or carrier geometry", async () => {
    const source = framedShape();
    source.text = "";
    source.shapeGeometry = { preset: "bentConnector3" };
    source.shapeConnector = {
      kind: "shape-connector-v1",
      begin: { kind: "free", xRatio: 0, yRatio: 0 },
      end: { kind: "free", xRatio: 1, yRatio: 1 },
    };
    const state = { ...snapshot(), drawing: source };
    const { wrapper, onIntent } = fixture({
      snapshot: state,
      capabilities: {
        ...capabilities,
        fields: { ...capabilities.fields, rotationDeg: { enabled: false } },
        lineEnds: { enabled: true },
      },
      initialMode: "text",
      initialTab: "text-box",
    });
    expect(wrapper.findAllComponents(RadioButton)).toHaveLength(1);
    expect(wrapper.findAll('[role="tabpanel"]')).toHaveLength(3);
    expect(wrapper.find("[data-shape-format-units]").exists()).toBe(true);
    expect(wrapper.findAllComponents(ShapeFormatNumberField)).toHaveLength(5);
    expect(input(wrapper, "rotationDeg").element.disabled).toBe(true);
    expect(wrapper.findAllComponents(ShapeFormatChoiceField)).toHaveLength(0);
    expect(wrapper.findAllComponents(PictureFormat3dEditor)).toHaveLength(0);
    expect(wrapper.findAllComponents(PictureRotation3dEditor)).toHaveLength(0);
    expect(wrapper.findAllComponents(PictureLineEditor)).toHaveLength(1);
    expect(wrapper.findAllComponents(PicturePaintEditor)).toHaveLength(1); // The real outline paint only.
    expect(wrapper.get("[data-shape-connector-size-limit]").text()).toContain("endpoint span");
    expect(wrapper.find("[data-shape-connector-disconnect]").exists()).toBe(false);
    const selects = wrapper.getComponent(ShapeLineEndsControls).findAllComponents(Select);
    selects[1]!.vm.$emit("change", "oval");
    await flushPromises();
    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "set-line-ends",
        value: { end: { kind: "oval" } },
      }),
    );
    await wrapper.setProps({ snapshot: snapshot(), initialMode: "shape" });
    expect(wrapper.findAllComponents(RadioButton)).toHaveLength(2);
    expect(wrapper.findAll('[role="tabpanel"]')).toHaveLength(6);
  });
  test("bound connector lists exact associations and requires its explicit leased disconnect action", async () => {
    const source = framedShape();
    source.text = "";
    source.shapeGeometry = { preset: "bentConnector3" };
    source.shapeConnector = {
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId: "rect", preset: "rect", siteIndex: 3 },
      end: { kind: "site", targetId: "oval", preset: "ellipse", siteIndex: 0 },
    };
    const state: ShapeFormatSnapshot = {
      ...snapshot(),
      drawing: source,
      owner: { ...snapshot().owner, drawingId: source.id },
      connectorBindings: [
        { endpoint: "begin", targetName: "Rectangle <one>" },
        { endpoint: "end", targetName: "Ellipse two" },
      ],
    };
    const { wrapper, onIntent } = fixture({
      snapshot: state,
      capabilities: {
        fields: { sizeWidthPt: { enabled: false }, sizeHeightPt: { enabled: false } },
        disconnectConnector: { enabled: true },
      },
      locale: "zh-CN",
    });
    expect(wrapper.get("[data-shape-connector-bindings]").text()).toContain(
      "起点: Rectangle <one>",
    );
    expect(wrapper.get("[data-shape-connector-bindings]").text()).toContain("终点: Ellipse two");
    expect(wrapper.get("[data-shape-connector-bindings]").find("one").exists()).toBe(false);
    expect(input(wrapper, "sizeWidthPt").element.disabled).toBe(true);
    expect(onIntent).not.toHaveBeenCalled();
    await wrapper.get("[data-shape-connector-disconnect]").trigger("click");
    expect(onIntent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "disconnect-connector",
        owner: state.owner,
        baseRevision: state.revision,
      }),
    );
    onIntent.mockClear();
    await wrapper.setProps({
      capabilities: { fields: {}, disconnectConnector: { enabled: false } },
    });
    expect(wrapper.get("[data-shape-connector-disconnect]").attributes("disabled")).toBeDefined();
    await wrapper.get("[data-shape-connector-disconnect]").trigger("click");
    expect(onIntent).not.toHaveBeenCalled();
  });
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
    expect(wrapper.findAll('[data-shape-format-field="shapeKeepTextFlat"]')).toHaveLength(2);
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
  test("an unrelated external revision retains a stale draft until Escape; old callbacks reject stale targets", async () => {
    const { wrapper, onIntent } = fixture();
    const oldAction = retainedNumericAction(wrapper, "sizeWidthPt");
    await input(wrapper, "sizeWidthPt").setValue("240.");
    await wrapper.setProps({
      snapshot: { ...snapshot(), revision: 3, values: { ...snapshot().values, sizeWidthPt: 200 } },
    });
    const width = input(wrapper, "sizeWidthPt");
    expect(width.element.value).toBe("240.");
    expect(oldAction(300)).toBe(false);
    await width.trigger("keydown", { key: "Enter" });
    expect(width.attributes("aria-invalid")).toBe("true");
    expect(onIntent).not.toHaveBeenCalled();
    await width.trigger("keydown", { key: "Escape" });
    expect(width.element.value).toBe("200");
    expect(wrapper.emitted("close")).toBeUndefined();
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
    await input(wrapper, "sizeWidthPt").setValue("230");
    await input(wrapper, "sizeWidthPt").trigger("keydown", { key: "Enter" });
    expect(onIntent).toHaveBeenCalledTimes(1);
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

describe("actual shape group aggregate controls", () => {
  test("the genuine group header and scope expose host-enabled descendant line ends", async () => {
    const source = groupSnapshot();
    const { wrapper } = fixture({
      snapshot: source,
      capabilities: { ...capabilities, lineEnds: { enabled: true } },
    });
    expect(wrapper.get(".shape-format-pane__heading").text()).toContain("Format Group");
    expect(wrapper.get(".shape-format-pane__heading").text()).toContain("Actual group");
    expect(wrapper.props("snapshot")!.drawing).toEqual(source.drawing);
    expect(input(wrapper, "sizeWidthPt").element.value).toBe("360");
    expect(input(wrapper, "sizeHeightPt").element.value).toBe("180");
    expect(input(wrapper, "rotationDeg").element.value).toBe("31");
    expect(wrapper.get("[data-shape-format-group-scope]").text()).toContain(
      "Size and object properties apply to this group",
    );
    expect(wrapper.get("[data-shape-format-group-scope]").text()).toContain(
      source.scopeDescription,
    );
    expect(wrapper.findComponent(ShapeLineEndsControls).exists()).toBe(true);
    expect(wrapper.findAll('[role="tabpanel"]')).toHaveLength(6);
    const fill = wrapper.findAllComponents(PicturePaintEditor)[0]!;
    expect(fill.props("mixed")).toBe(true);
    expect(fill.props("value")).toBeUndefined();
    expect(wrapper.find('[data-shape-format-mixed-style="fill"]').text()).toContain(
      "entire category",
    );
    await textMode(wrapper);
    expect(wrapper.get("[data-shape-format-group-scope]").text()).toContain(
      "Text formatting applies to all shape and text-box members",
    );
    const font = wrapper.get<HTMLInputElement>('[data-shape-format-field="fontFamily"] input');
    expect(font.element.value).toBe("");
    expect(font.attributes("placeholder")).toBe("Mixed values");
  });
  test("group endpoint controls dispatch a single side intent against the real owner and expose mixed values", async () => {
    const source = { ...groupSnapshot(), mixedLineEnds: ["begin", "end"] as const };
    const { wrapper, onIntent } = fixture({
      snapshot: source,
      capabilities: { ...capabilities, lineEnds: { enabled: true } },
    });
    const controls = wrapper.getComponent(ShapeLineEndsControls);
    expect(controls.props("mixed")).toEqual(["begin", "end"]);
    expect(controls.props("endpointHandler")!("begin", { kind: "open" })).toBe(true);
    expect(onIntent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "set-line-end",
        endpoint: "begin",
        value: { kind: "open" },
        owner: source.owner,
      }),
    );
    expect(wrapper.props("snapshot")!.drawing.kind).toBe("shapeGroup");
    await wrapper.setProps({ capabilities: { ...capabilities, lineEnds: { enabled: false } } });
    expect(controls.props("disabled")).toBe(true);
  });
  test("mixed numeric fields start blank and preserve full digits until one explicit canonical commit", async () => {
    const { wrapper, onIntent } = fixture({
      snapshot: groupSnapshot(),
      capabilities: {
        ...capabilities,
        fields: { ...capabilities.fields, fontSizePt: { enabled: true, min: 1 } },
      },
    });
    const field = input(wrapper, "fontSizePt");
    expect(field.element.value).toBe("");
    expect(field.attributes("placeholder")).toBe("Mixed values");
    expect(field.element.disabled).toBe(false);
    for (const digits of ["1", "12", "123", "123.", "123.45"]) {
      await field.setValue(digits);
      expect(field.element.value).toBe(digits);
      expect(onIntent).not.toHaveBeenCalled();
    }
    await field.trigger("keydown", { key: "Enter" });
    expect(onIntent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "set-field",
        field: "fontSizePt",
        value: 123.45,
        owner: groupSnapshot().owner,
      }),
    );
    await field.trigger("blur");
    expect(onIntent).toHaveBeenCalledTimes(1);
  });
  test("mixed invalid/rejected drafts remain intact; external revisions retain stale drafts until Escape", async () => {
    const onIntent = vi.fn(() => false);
    const { wrapper } = fixture({
      snapshot: groupSnapshot(),
      onIntent,
      capabilities: {
        ...capabilities,
        fields: { ...capabilities.fields, fontSizePt: { enabled: true, min: 1 } },
      },
    });
    const field = input(wrapper, "fontSizePt");
    const action = retainedNumericAction(wrapper, "fontSizePt");
    await field.setValue("12e");
    await field.trigger("blur");
    expect(field.element.value).toBe("12e");
    expect(onIntent).not.toHaveBeenCalled();
    await field.setValue("123.45");
    await field.trigger("blur");
    expect(field.element.value).toBe("123.45");
    expect(wrapper.text()).toContain("Your draft has been kept");
    expect(onIntent).toHaveBeenCalledTimes(1);
    await field.trigger("keydown", { key: "Escape" });
    expect(field.element.value).toBe("");
    expect(wrapper.emitted("close")).toBeUndefined();
    await field.setValue("555.");
    await wrapper.setProps({ snapshot: { ...groupSnapshot(), revision: 3 } });
    expect(field.element.value).toBe("555.");
    expect(action(200)).toBe(false);
    await field.trigger("keydown", { key: "Enter" });
    expect(field.attributes("aria-invalid")).toBe("true");
    expect(onIntent).toHaveBeenCalledTimes(1);
    await field.trigger("keydown", { key: "Escape" });
    expect(field.element.value).toBe("");
    expect(wrapper.emitted("close")).toBeUndefined();
    await flushPromises();
    expect(
      wrapper
        .findAllComponents(Select)
        .find((component) => component.attributes("data-shape-format-units") !== undefined)!
        .props("disabled"),
    ).toBe(false);
  });
  test("accepted group edits preserve another mixed numeric draft at the acknowledged revision", async () => {
    const { wrapper, onIntent } = fixture({
      snapshot: groupSnapshot(),
      capabilities: {
        ...capabilities,
        fields: { ...capabilities.fields, fontSizePt: { enabled: true, min: 1 } },
      },
    });
    const field = input(wrapper, "fontSizePt"),
      element = field.element;
    await field.setValue("123.");
    await input(wrapper, "sizeWidthPt").setValue("400");
    await input(wrapper, "sizeWidthPt").trigger("keydown", { key: "Enter" });
    expect(onIntent).toHaveBeenCalledTimes(1);
    const intent = onIntent.mock.calls.at(-1)![0];
    await wrapper.setProps({
      snapshot: {
        ...groupSnapshot(),
        revision: 3,
        acceptedIntentId: intent.intentId,
        values: { ...groupSnapshot().values, sizeWidthPt: 400 },
      },
    });
    expect(field.element).toBe(element);
    expect(field.element.value).toBe("123.");
    await field.trigger("blur");
    expect(onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ field: "fontSizePt", value: 123, baseRevision: 3 }),
    );
  });
  test("indeterminate booleans and empty mixed choices emit explicit common values with exact ownership", async () => {
    const { wrapper, onIntent } = fixture({
      snapshot: groupSnapshot(),
      capabilities: {
        ...capabilities,
        fields: {
          ...capabilities.fields,
          textBold: { enabled: true },
          textDirection: { enabled: true },
        },
      },
    });
    const bold = wrapper
      .findAllComponents(ShapeFormatCheckbox)
      .find((component) => component.props("field") === "textBold")!
      .getComponent(Checkbox);
    expect(bold.props("indeterminate")).toBe(true);
    expect(bold.props("modelValue")).toBe(false); // Controlled backing state; indeterminate is the displayed aggregate.
    bold.vm.$emit("change", true);
    const direction = wrapper
      .findAllComponents(ShapeFormatChoiceField)
      .find((component) => component.props("field") === "textDirection")!
      .getComponent(Select);
    expect(direction.props("modelValue")).toBe("");
    expect(direction.props("placeholder")).toBe("Mixed values");
    direction.vm.$emit("change", "horizontal");
    await flushPromises();
    expect(onIntent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ field: "textBold", value: true, owner: groupSnapshot().owner }),
    );
    expect(onIntent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        field: "textDirection",
        value: "horizontal",
        owner: groupSnapshot().owner,
      }),
    );
    const unsupported = number(wrapper, "paragraphBeforePt").getComponent(Input);
    expect(unsupported.props("modelValue")).toBe("");
    expect(unsupported.props("disabled")).toBe(true);
  });
  test("mixed effect reset is explicit and capability gated instead of displaying invented inheritance", async () => {
    const { wrapper, onIntent } = fixture({
      snapshot: groupSnapshot(),
      capabilities: {
        ...capabilities,
        styles: { shape: { ...capabilities.styles?.shape, shadow: { enabled: true } } },
      },
    });
    const mixed = wrapper.getComponent(ShapeFormatMixedEffect),
      select = mixed.getComponent(Select);
    expect(mixed.props("category")).toBe("shadow");
    expect(select.props("modelValue")).toBe("");
    expect(select.props("placeholder")).toBe("Mixed values");
    select.vm.$emit("change", "none");
    await flushPromises();
    expect(onIntent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "set-style",
        target: "shape",
        category: "shadow",
        value: { kind: "none" },
      }),
    );
  });
});

test("a related-connector restriction disables camera values, explains why, and keeps resets discoverable", async () => {
  const current = snapshot();
  current.shapeStyle = {
    ...current.shapeStyle,
    rotation3d: {
      kind: "value",
      value: { projection: "parallel", xDeg: 30, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
    },
  };
  const { wrapper, onIntent } = fixture({
    snapshot: current,
    capabilities: {
      ...capabilities,
      styles: {
        shape: {
          ...capabilities.styles?.shape,
          rotation3d: {
            enabled: true,
            valueEnabled: false,
            reason: "Bound connector projection unavailable",
          },
        },
      },
    },
  });
  const editor = wrapper.getComponent(PictureRotation3dEditor),
    select = editor.getComponent(Select);
  expect(editor.props("disabled")).toBe(false);
  expect(editor.props("valueDisabled")).toBe(true);
  expect(
    select
      .props("options")
      ?.filter(
        (item) =>
          "value" in item && ["parallel", "perspective", "oblique"].includes(String(item.value)),
      )
      .every((item) => "disabled" in item && item.disabled),
  ).toBe(true);
  expect(wrapper.text()).toContain("Bound connector projection unavailable");
  select.vm.$emit("change", "perspective");
  await flushPromises();
  expect(onIntent).not.toHaveBeenCalled();
  select.vm.$emit("change", "none");
  await flushPromises();
  expect(onIntent).toHaveBeenLastCalledWith(
    expect.objectContaining({ category: "rotation3d", value: { kind: "none" } }),
  );
  select.vm.$emit("change", "inherit");
  await flushPromises();
  expect(onIntent).toHaveBeenLastCalledWith(
    expect.objectContaining({ category: "rotation3d", value: undefined }),
  );
});

test("Text Effects embeds controlled Transform choices, mixed scope and the existing owner intent", async () => {
  const state = {
    ...groupSnapshot(),
    mixedTextWarp: true,
    textWarpScope: { eligibleCount: 2, descendantCount: 5 },
  };
  const { wrapper, onIntent } = fixture({
    snapshot: state,
    capabilities: { ...capabilities, textWarp: { enabled: true } },
    initialTab: "text-effects",
  });
  const section = wrapper.get("[data-text-transform-section]");
  expect(section.text()).toContain("Text transform");
  expect(section.text()).toContain(
    "2 TextBox, WordArt or retained-transform text members of 5 members",
  );
  const gallery = wrapper.getComponent(WordArtTransformGallery);
  expect(gallery.props("mixed")).toBe(true);
  expect(gallery.props("menu")).toBe(false);
  const choose = gallery.props("onSelect")!;
  expect(
    choose(
      {
        id: "textWave1",
        family: "envelope",
        label: { "en-US": "Wave", "zh-CN": "波浪" },
        warp: { preset: "textWave1" },
      },
      { isCurrent: () => true },
    ),
  ).toBe(true);
  expect(onIntent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "set-text-warp",
      owner: state.owner,
      baseRevision: 2,
      value: { preset: "textWave1" },
    }),
  );
  await wrapper.setProps({
    snapshot: { ...state, revision: 3, mixedTextWarp: false, textWarp: { preset: "textWave1" } },
  });
  expect(
    choose(
      { id: "textNoShape", family: "none", label: { "en-US": "None", "zh-CN": "无" } },
      { isCurrent: () => true },
    ),
  ).toBe(false);
  expect(onIntent).toHaveBeenCalledTimes(1);
  expect(wrapper.getComponent(WordArtTransformGallery).props("selectedWarp")).toEqual({
    preset: "textWave1",
  });
});
test("unsupported transform exposes the apply-text-first reason without an editable command", () => {
  const { wrapper, onIntent } = fixture({
    capabilities: {
      fields: {},
      textWarp: { enabled: false, reason: "Apply the text before changing advanced text effects." },
    },
    initialTab: "text-effects",
  });
  const gallery = wrapper.getComponent(WordArtTransformGallery);
  expect(gallery.props("disabled")).toBe(true);
  expect(gallery.props("disabledReason")).toContain("Apply the text");
  expect(wrapper.get("[data-text-transform-section]").text()).toContain("Apply the text");
  expect(onIntent).not.toHaveBeenCalled();
});

describe("existing WordArt style and clear controls", () => {
  function wordArtSnapshot(): ShapeFormatSnapshot {
    const state = snapshot();
    return {
      ...state,
      drawing: { ...framedShape(), id: "shape", wordArt: true },
      wordArtStyleId: WORDART_STYLE_PRESETS[0]!.id,
      wordArtStyleScope: { eligibleCount: 1, descendantCount: 1 },
    };
  }
  const wordArtCapabilities = {
    ...capabilities,
    wordArtStyle: { enabled: true },
    clearWordArtEffects: { enabled: true },
  } satisfies ShapeFormatCapabilities;

  test("Text Fill/Outline reuses all 25 styles and dispatches only a canonical owner-bound preset ID", async () => {
    const state = wordArtSnapshot();
    const { wrapper, onIntent } = fixture({
      snapshot: state,
      capabilities: wordArtCapabilities,
      initialTab: "text-fill-line",
    });
    const section = wrapper.get("[data-wordart-style-section]");
    expect(section.text()).toContain("WordArt styles");
    expect(section.get("[data-wordart-style-help]").text()).toContain("glyph 3-D effects");
    expect(section.get("[data-wordart-style-help]").text()).toContain("shared body camera");
    expect(section.findAll("[data-wordart-style-choice]")).toHaveLength(25);
    const gallery = wrapper.getComponent(WordArtStyleGallery);
    expect(gallery.props("selectedId")).toBe(state.wordArtStyleId);
    expect(gallery.props("ownerId")).toContain(":wordart-style:2");
    const choice = WORDART_STYLE_PRESETS[3]!;
    await gallery.get(`[data-wordart-style-choice="${choice.id}"]`).trigger("click");
    await flushPromises();
    expect(onIntent).toHaveBeenCalledExactlyOnceWith({
      type: "set-wordart-style",
      presetId: choice.id,
      owner: state.owner,
      baseRevision: 2,
      intentId: expect.any(String),
    });
    expect(gallery.emitted("applied")).toHaveLength(1);
    expect(gallery.props("selectedId")).toBe(state.wordArtStyleId);
  });

  test("Clear WordArt effects is a distinct recipe-free intent with visible preservation help", async () => {
    const state = wordArtSnapshot();
    const { wrapper, onIntent } = fixture({
      snapshot: state,
      capabilities: wordArtCapabilities,
      initialTab: "text-fill-line",
    });
    const button = wrapper.get("[data-clear-wordart-effects]");
    expect(button.text()).toBe("Clear WordArt effects");
    const help = wrapper.get("[data-clear-wordart-effects-help]").text();
    expect(help).toContain("black text");
    expect(help).toContain("remove the text transform");
    expect(help).toContain("2-D angle");
    expect(help).toContain("auto-fit");
    await button.trigger("click");
    expect(onIntent).toHaveBeenCalledExactlyOnceWith({
      type: "clear-wordart-effects",
      owner: state.owner,
      baseRevision: 2,
      intentId: expect.any(String),
    });
  });

  test("mixed groups show exact WordArt-only scope and never highlight an arbitrary member", () => {
    const state = {
      ...groupSnapshot(),
      mixedWordArtStyle: true,
      wordArtStyleId: WORDART_STYLE_PRESETS[0]!.id,
      wordArtStyleScope: { eligibleCount: 2, descendantCount: 5 },
    };
    const { wrapper, onIntent } = fixture({
      snapshot: state,
      capabilities: wordArtCapabilities,
      initialTab: "text-fill-line",
    });
    expect(wrapper.get("[data-wordart-style-scope]").text()).toContain(
      "2 TextBox or WordArt members of 5 members",
    );
    expect(wrapper.get("[data-wordart-style-mixed]").text()).toContain("different styles");
    const gallery = wrapper.getComponent(WordArtStyleGallery);
    expect(gallery.props("selectedId")).toBeUndefined();
    expect(gallery.findAll('[data-wordart-style-choice][aria-pressed="true"]')).toHaveLength(0);
    expect(gallery.props("onSelect")!(WORDART_STYLE_PRESETS[0]!)).toBe(true);
    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "set-wordart-style", owner: state.owner }),
    );
  });

  test("ordinary text hides WordArt controls unless the host supplies an explicit capability", async () => {
    const { wrapper } = fixture({ initialTab: "text-fill-line" });
    expect(wrapper.find("[data-wordart-style-section]").exists()).toBe(false);
    await wrapper.setProps({
      snapshot: wordArtSnapshot(),
      capabilities: { fields: {} },
    });
    expect(wrapper.getComponent(WordArtStyleGallery).props("disabled")).toBe(true);
    expect(wrapper.get("[data-clear-wordart-effects]").attributes("disabled")).toBeDefined();
    await wrapper.setProps({
      snapshot: snapshot(),
      capabilities: { fields: {}, wordArtStyle: { enabled: false, reason: "Unsupported scope" } },
    });
    expect(wrapper.get("[data-wordart-style-disabled-reason]").text()).toBe("Unsupported scope");
  });

  test("source-edit Apply-first disables both commands and old enabled callbacks cannot change the whole object", async () => {
    const state = wordArtSnapshot();
    const { wrapper, onIntent } = fixture({
      snapshot: state,
      capabilities: wordArtCapabilities,
      initialTab: "text-fill-line",
    });
    const oldChoose = wrapper.getComponent(WordArtStyleGallery).props("onSelect")!;
    const reason = "Apply the text before changing advanced text effects.";
    await wrapper.setProps({
      capabilities: {
        ...wordArtCapabilities,
        wordArtStyle: { enabled: false, reason },
        clearWordArtEffects: { enabled: false, reason },
      },
    });
    const gallery = wrapper.getComponent(WordArtStyleGallery);
    expect(gallery.props("disabled")).toBe(true);
    expect(gallery.findAll("button[disabled]")).toHaveLength(25);
    expect(wrapper.get("[data-wordart-style-disabled-reason]").text()).toBe(reason);
    expect(wrapper.get("[data-clear-wordart-effects-disabled-reason]").text()).toBe(reason);
    expect(wrapper.get("[data-clear-wordart-effects]").attributes("disabled")).toBeDefined();
    expect(oldChoose(WORDART_STYLE_PRESETS[1]!)).toBe(false);
    const clear = wrapper
      .findAllComponents(Button)
      .find((button) => button.attributes("data-clear-wordart-effects") !== undefined)!;
    clear.vm.$emit("click");
    await flushPromises();
    expect(onIntent).not.toHaveBeenCalled();
  });

  test("retained gallery callbacks reject changed owner, revision, handler and explicit cancellation", async () => {
    for (const change of ["owner", "revision", "handler", "cancel"] as const) {
      const state = wordArtSnapshot();
      const { wrapper, onIntent } = fixture({
        snapshot: state,
        capabilities: wordArtCapabilities,
        initialTab: "text-fill-line",
      });
      const gallery = wrapper.getComponent(WordArtStyleGallery);
      const choose = gallery.props("onSelect")!;
      const ownerId = gallery.props("ownerId");
      const replacement = vi.fn(() => true);
      if (change === "owner")
        await wrapper.setProps({
          snapshot: { ...state, owner: { ...state.owner, sessionId: "new" } },
        });
      if (change === "revision") await wrapper.setProps({ snapshot: { ...state, revision: 3 } });
      if (change === "handler") await wrapper.setProps({ onIntent: replacement });
      if (change === "cancel") (wrapper.vm as unknown as { cancel: () => void }).cancel();
      expect(choose(WORDART_STYLE_PRESETS[1]!)).toBe(false);
      await flushPromises();
      expect(onIntent).not.toHaveBeenCalled();
      expect(replacement).not.toHaveBeenCalled();
      expect(gallery.props("ownerId")).not.toBe(ownerId);
      expect(wrapper.get('[role="alert"]').text()).toContain("selection or drawing changed");
    }
  });

  test("rejected style and clear commands retain selected readback and surface retry feedback", async () => {
    const state = wordArtSnapshot();
    const onIntent = vi.fn(() => false);
    const { wrapper } = fixture({
      snapshot: state,
      capabilities: wordArtCapabilities,
      onIntent,
      initialTab: "text-fill-line",
    });
    const gallery = wrapper.getComponent(WordArtStyleGallery);
    await gallery
      .get(`[data-wordart-style-choice="${WORDART_STYLE_PRESETS[1]!.id}"]`)
      .trigger("click");
    await flushPromises();
    expect(gallery.props("selectedId")).toBe(state.wordArtStyleId);
    expect(gallery.emitted("applied")).toBeUndefined();
    expect(gallery.emitted("failed")).toHaveLength(1);
    expect(gallery.text()).toContain("could not be applied. Try again");
    expect(wrapper.get('[role="alert"]').text()).toContain("could not be applied");
    await wrapper.get("[data-clear-wordart-effects]").trigger("click");
    expect(onIntent).toHaveBeenCalledTimes(2);
    expect(gallery.props("selectedId")).toBe(state.wordArtStyleId);
    expect(wrapper.get('[role="alert"]').text()).toContain("could not be applied");
  });

  test("Chinese controls explain reapply, Clear and the exact eligible scope", () => {
    const state = {
      ...groupSnapshot(),
      mixedWordArtStyle: true,
      wordArtStyleScope: { eligibleCount: 2, descendantCount: 5 },
    };
    const { wrapper } = fixture({
      snapshot: state,
      capabilities: wordArtCapabilities,
      locale: "zh-CN",
      initialTab: "text-fill-line",
    });
    expect(wrapper.get("[data-wordart-style-section]").text()).toContain("艺术字样式");
    expect(wrapper.get("[data-clear-wordart-effects]").text()).toBe("清除艺术字效果");
    expect(wrapper.get("[data-wordart-style-help]").text()).toContain("保留文字、字体、字号");
    expect(wrapper.get("[data-wordart-style-scope]").text()).toContain(
      "2 个文本框或艺术字成员（共 5 个成员）",
    );
    expect(wrapper.get("[data-clear-wordart-effects-help]").text()).toContain("二维角度");
  });
});

test.each(["selection", "caret"] as const)(
  "WordArt %s gallery describes the exact local scope",
  (scope) => {
    const state: ShapeFormatSnapshot = {
      ...snapshot(),
      drawing: { ...framedShape(), id: "shape", wordArt: true },
      wordArtStyleEditingScope: scope,
      mixedWordArtStyle: scope === "selection",
    };
    const { wrapper } = fixture({
      snapshot: state,
      capabilities: {
        ...capabilities,
        wordArtStyle: { enabled: true },
        clearWordArtEffects: { enabled: false, reason: "Apply first" },
      },
      initialTab: "text-fill-line",
    });
    const help = wrapper.get("[data-wordart-style-help]").text();
    expect(help).toContain(
      scope === "selection" ? "only the selected text" : "new text at the caret",
    );
    expect(help).toContain("shadow, reflection and glow");
    expect(help).not.toContain("glyph 3-D effects");
    expect(wrapper.get("[data-clear-wordart-effects]").attributes("disabled")).toBeDefined();
    if (scope === "selection")
      expect(wrapper.get("[data-wordart-style-mixed]").text()).toContain("Selected characters");
  },
);

describe("public Shape pane navigation and necessary feedback", () => {
  test("public mode/tab controls retain the current field and refuse navigation before the host guard accepts", async () => {
    let allow = false;
    const guard = vi.fn(() => allow);
    const { wrapper, onIntent } = fixture({ beforeTabChange: guard });
    expect(wrapper.findComponent(RadioGroup).exists()).toBe(true);
    expect(wrapper.findComponent(Tabs).exists()).toBe(true);
    const field = input(wrapper, "sizeWidthPt");
    const originalField = field.element;
    await field.setValue("240.");
    const tabs = () => wrapper.findAll<HTMLButtonElement>('[role="tab"]');
    await tabs()[1]!.trigger("click");
    expect(tabs()[2]!.attributes("aria-selected")).toBe("true");
    await textMode(wrapper);
    expect(wrapper.findComponent(RadioGroup).props("value")).toBe("shape");
    for (const radio of wrapper.findAllComponents(RadioButton))
      expect(radio.get<HTMLInputElement>("input").element.checked).toBe(
        radio.props("value") === "shape",
      );
    expect(field.element.value).toBe("240.");
    allow = true;
    await tabs()[1]!.trigger("keydown", { key: "Home" });
    expect(tabs()[0]!.attributes("aria-selected")).toBe("true");
    await textMode(wrapper);
    expect(wrapper.findComponent(RadioGroup).props("value")).toBe("text");
    wrapper
      .findAllComponents(RadioButton)
      .find((radio) => radio.props("value") === "shape")!
      .get<HTMLLabelElement>("label")
      .element.click();
    await flushPromises();
    expect(input(wrapper, "sizeWidthPt").element).toBe(originalField);
    expect(originalField.value).toBe("240.");
    expect(onIntent).not.toHaveBeenCalled();
    expect(guard).toHaveBeenCalled();
  });

  test("normal shape fill omits generic help while actual capability reasons and material scope remain", async () => {
    const { wrapper } = fixture({ initialTab: "fill-line" });
    expect(wrapper.text()).not.toContain("Available controls depend on this drawing");
    expect(wrapper.text()).not.toContain("Fill paints the selected shape.");
    expect(wrapper.text()).toContain("Closed shape has no arrowheads");
    const scope = "Formatting applies to selected characters, not other text.";
    await wrapper.setProps({ snapshot: { ...snapshot(), scopeDescription: scope } });
    expect(wrapper.text().split(scope)).toHaveLength(2);
    const group = { ...groupSnapshot(), scopeDescription: "One material group scope." };
    await wrapper.setProps({ snapshot: group });
    expect(wrapper.text().split(group.scopeDescription)).toHaveLength(2);
  });
});
