import { mount } from "@vue/test-utils";
import { expect, test, vi } from "vitest";
import WordArtStylePreview from "../../../modules/sheet-drawings/components/WordArtStylePreview.vue";
import ShapeTextContent from "../../../modules/sheet-drawings/components/ShapeTextContent.vue";
import { WORDART_STYLE_PRESETS } from "../../../modules/sheet-drawings/wordart-style-presets";

vi.mock("../../../modules/sheet-drawings/components/ShapeTextContent.vue", () => ({
  default: { props: ["drawing", "theme", "density"], emits: ["paint"], template: "<span />" },
}));

test("preview sends exact appearance to a tiny native consumer and retains a label until real paint", async () => {
  const preset = WORDART_STYLE_PRESETS[0]!;
  const wrapper = mount(WordArtStylePreview, {
    props: { choice: preset, label: preset.label["en-US"] },
  });
  const native = wrapper.getComponent(ShapeTextContent);
  const drawing = native.props("drawing");
  expect(native.props("density")).toBe(1);
  expect(drawing).toMatchObject({ width: 60, height: 64, text: "A", fontSize: 44, bold: true });
  expect(drawing.shapeText?.style).toEqual(preset.style);
  expect(wrapper.get("[data-preview-ready]").attributes("data-preview-ready")).toBe("false");
  expect(wrapper.text()).toBe(preset.label["en-US"]);
  native.vm.$emit("paint", {
    drawing,
    canvas: document.createElement("canvas"),
    density: 1,
    bounds: { left: 0, top: 0, width: 60, height: 64 },
  });
  await wrapper.vm.$nextTick();
  expect(wrapper.get("[data-preview-ready]").attributes("data-preview-ready")).toBe("true");
  expect(wrapper.find(".wordart-style-preview__fallback").exists()).toBe(false);
  native.vm.$emit("paint", undefined);
  await wrapper.vm.$nextTick();
  expect(wrapper.text()).toBe(preset.label["en-US"]);
  wrapper.unmount();
});
