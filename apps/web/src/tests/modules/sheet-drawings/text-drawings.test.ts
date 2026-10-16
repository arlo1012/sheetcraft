import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import DrawingEditorDialog from "../../../modules/sheet-drawings/components/DrawingEditorDialog.vue";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function drawing(kind: "textBox" | "wordArt"): SheetGraphicDrawing {
  return {
    id: kind,
    kind,
    name: "Existing text",
    anchor: { row: 1, column: 2 },
    offsetX: 8,
    offsetY: 8,
    width: 240,
    height: 120,
    text: "First line\n<script>literal text</script>",
    shape: "rectangle",
    fill: "#abcdef",
    stroke: "#123456",
    strokeWidth: 3,
    color: "#654321",
    fontSize: 28,
    bold: false,
    italic: true,
    rotation: 15,
  };
}
function editor(original: SheetGraphicDrawing, disabled = false) {
  const wrapper = mount(DrawingEditorDialog, {
    attachTo: document.body,
    props: { drawing: original, disabled },
    global: { plugins: [createAppI18n("en-US")], stubs: { TTextarea: true } },
  });
  mounted.push(wrapper);
  return wrapper;
}
describe("existing text box and WordArt contract", () => {
  test("WordArt hides unused appearance controls while preserving stored fields", async () => {
    const original = drawing("wordArt");
    const wrapper = editor(original);
    expect(wrapper.findAllComponents(ColorPaletteSelect)).toHaveLength(1);
    expect(wrapper.text()).not.toContain("No fill");
    expect(wrapper.text()).not.toContain("Line width");
    expect(wrapper.text()).not.toContain("Outline");
    const name = wrapper
      .findAllComponents(Input)
      .find((input) => input.props("modelValue") === original.name)!;
    name.vm.$emit("update:modelValue", "Changed name");
    await nextTick();
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    expect(wrapper.emitted("confirm")?.[0]).toEqual([{ ...original, name: "Changed name" }]);
    expect(original.name).toBe("Existing text");
  });
  test("text boxes retain their effective fill and border controls", () => {
    const wrapper = editor(drawing("textBox"));
    expect(wrapper.findAllComponents(ColorPaletteSelect)).toHaveLength(3);
    expect(wrapper.text()).toContain("No fill");
    expect(wrapper.text()).toContain("Line width");
    expect(wrapper.text()).toContain("Outline");
  });
  test.each(["textBox", "wordArt"] as const)(
    "%s renders literal multiline text with font-relative line height",
    async (kind) => {
      const original = drawing(kind);
      const wrapper = mount(DrawingContent, { props: { drawing: original } });
      mounted.push(wrapper);
      const text = wrapper.get(".drawing-content__text");
      expect(text.text()).toBe(original.text);
      expect(wrapper.find("script").exists()).toBe(false);
      expect(text.attributes("style")).toContain("font-size: 28px");
      expect(text.attributes("style")).toContain("font-weight: 400");
      expect(text.attributes("style")).toContain("font-style: italic");
      expect(text.attributes("style")).toContain("line-height: normal");
      expect(wrapper.get(".drawing-content").attributes("style")).toContain("rotate(15deg)");
      expect(text.classes().includes("is-word-art")).toBe(kind === "wordArt");
      await wrapper.setProps({ drawing: { ...original, bold: true, italic: false } });
      expect(text.attributes("style")).toContain("font-weight: 700");
      expect(text.attributes("style")).toContain("font-style: normal");
    },
  );
  test("only text boxes consume container fill and border", () => {
    for (const kind of ["textBox", "wordArt"] as const) {
      const wrapper = mount(DrawingContent, { props: { drawing: drawing(kind) } });
      mounted.push(wrapper);
      const style = wrapper.get(".drawing-content__text").attributes("style");
      if (kind === "textBox") {
        expect(style).toContain("background: #abcdef");
        expect(style).toContain("border: 3px solid #123456");
      } else {
        expect(style).not.toContain("background:");
        expect(style).not.toContain("border:");
      }
    }
  });
  test.each(["textBox", "wordArt"] as const)(
    "%s disabled confirmation and cancel leave original fields untouched",
    async (kind) => {
      const original = drawing(kind);
      const before = structuredClone(original);
      const wrapper = editor(original, true);
      wrapper.getComponent(Dialog).vm.$emit("confirm");
      await nextTick();
      expect(wrapper.emitted("confirm")).toBeUndefined();
      wrapper.getComponent(Dialog).vm.$emit("close");
      await nextTick();
      expect(wrapper.emitted("close")).toEqual([[]]);
      expect(original).toEqual(before);
    },
  );
});
