import { mount } from "@vue/test-utils";
import { ColorPickerPanel } from "tdesign-vue-next/es/color-picker";
import { afterEach, describe, expect, test } from "vitest";
import ColorPalette from "../../../../shared/color/ColorPalette.vue";
import { createAppI18n } from "../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  localStorage.clear();
});

function mountPalette() {
  const wrapper = mount(ColorPalette, {
    global: {
      plugins: [createAppI18n("en-US")],
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe("ColorPalette", () => {
  test("selects preset colors as normalized hex and resets to default", async () => {
    const wrapper = mountPalette();
    await wrapper.get('[data-color-swatch="#ffffff"]').trigger("click");
    await wrapper.get('[data-color-action="default"]').trigger("click");
    expect(wrapper.emitted("select")).toEqual([["#ffffff"], [null]]);
  });

  test("does not commit a custom color until it is applied", async () => {
    const wrapper = mountPalette();
    await wrapper.get('[data-color-action="more"]').trigger("click");
    wrapper
      .findComponent(ColorPickerPanel)
      .vm.$emit("change", "rgb(1, 2, 3)", { color: { hex: "#A1B2C3" } });
    await wrapper.get('[data-color-action="back"]').trigger("click");
    expect(wrapper.emitted("select")).toBeUndefined();

    await wrapper.get('[data-color-action="more"]').trigger("click");
    wrapper.findComponent(ColorPickerPanel).vm.$emit("change", "#A1B2C3");
    await wrapper.get('[data-color-action="apply"]').trigger("click");
    expect(wrapper.emitted("select")).toEqual([["#a1b2c3"]]);
  });
});
