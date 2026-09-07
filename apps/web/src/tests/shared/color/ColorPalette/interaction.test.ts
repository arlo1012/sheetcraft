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

function mountPalette(props: Record<string, unknown> = {}) {
  const wrapper = mount(ColorPalette, {
    props,
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

  test("limits swatches and entry points to normalized allowed colors", async () => {
    const wrapper = mountPalette({
      allowedColors: [" #A1B2C3 ", "#d4e5f6", "#A1B2C3", "invalid"],
      defaultColor: "#20242c",
    });

    expect(
      wrapper
        .findAll("[data-color-swatch]")
        .map((swatch) => swatch.attributes("data-color-swatch")),
    ).toEqual(["#a1b2c3", "#d4e5f6"]);
    expect(wrapper.find('[data-color-action="default"]').exists()).toBe(false);
    expect(wrapper.find('[data-color-action="more"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Standard");
    expect(wrapper.text()).not.toContain("Recent");

    await wrapper.get('[data-color-swatch="#d4e5f6"]').trigger("click");
    expect(wrapper.emitted("select")).toEqual([["#d4e5f6"]]);
  });

  test("only exposes the default action when its color is allowed", async () => {
    const wrapper = mountPalette({
      allowedColors: ["#20242C"],
      defaultColor: "#20242c",
    });

    await wrapper.get('[data-color-action="default"]').trigger("click");
    expect(wrapper.emitted("select")).toEqual([[null]]);
  });

  test("treats an empty allowed list as no selectable colors", () => {
    const wrapper = mountPalette({ allowedColors: [] });

    expect(wrapper.findAll("[data-color-swatch]")).toHaveLength(0);
    expect(wrapper.find('[data-color-action="default"]').exists()).toBe(false);
    expect(wrapper.find('[data-color-action="more"]').exists()).toBe(false);
  });

  test("closes the custom picker when a color restriction is applied", async () => {
    const wrapper = mountPalette();
    await wrapper.get('[data-color-action="more"]').trigger("click");

    await wrapper.setProps({ allowedColors: ["#d3eee1"] });

    expect(wrapper.find('[data-color-action="apply"]').exists()).toBe(false);
    expect(wrapper.find('[data-color-action="more"]').exists()).toBe(false);
    await wrapper.get('[data-color-swatch="#d3eee1"]').trigger("click");
    expect(wrapper.emitted("select")).toEqual([["#d3eee1"]]);
  });
});
