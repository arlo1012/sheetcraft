import { flushPromises, mount } from "@vue/test-utils";
import { ColorPickerPanel } from "tdesign-vue-next/es/color-picker";
import { afterEach, describe, expect, test } from "vitest";
import ColorPalette from "../../../../shared/color/ColorPalette.vue";
import CustomColorPanel from "../../../../shared/color/CustomColorPanel.vue";
import { createAppI18n } from "../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  localStorage.clear();
});

function mountPalette(props: Record<string, unknown> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(ColorPalette, {
    attachTo: host,
    props,
    global: {
      plugins: [createAppI18n("en-US")],
    },
  });
  wrappers.push({
    unmount() {
      wrapper.unmount();
      host.remove();
    },
  });
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

  test("returns to the original palette when custom colors are applied or dismissed", async () => {
    const wrapper = mountPalette({ moreMode: "popup", modelValue: "#ffffff" });
    const swatch = wrapper.get('[data-color-swatch="#ffffff"]').element;
    // TDesign dismisses floating content when its anchor has no layout box.
    wrapper.get<HTMLButtonElement>('[data-color-action="more"]').element.getBoundingClientRect =
      () => new DOMRect(10, 10, 208, 25);
    await flushPromises();
    await wrapper.get('[data-color-action="more"]').trigger("click");
    await expect.poll(() => wrapper.findComponent(CustomColorPanel).exists()).toBe(true);
    expect(wrapper.get('[data-color-swatch="#ffffff"]').element).toBe(swatch);
    expect(wrapper.classes()).not.toContain("is-more");
    wrapper.getComponent(ColorPickerPanel).vm.$emit("change", "#A1B2C3");
    await wrapper.getComponent(CustomColorPanel).get('[data-color-action="back"]').trigger("click");
    expect(wrapper.emitted("select")).toBeUndefined();
    expect(wrapper.findComponent(CustomColorPanel).exists()).toBe(false);

    await wrapper.get('[data-color-action="more"]').trigger("click");
    await expect.poll(() => wrapper.findComponent(CustomColorPanel).exists()).toBe(true);
    expect(wrapper.getComponent(ColorPickerPanel).props("modelValue")).toBe("#ffffff");
    wrapper.getComponent(ColorPickerPanel).vm.$emit("change", "#A1B2C3");
    await wrapper
      .getComponent(CustomColorPanel)
      .get('[data-color-action="apply"]')
      .trigger("click");
    expect(wrapper.emitted("select")).toEqual([["#a1b2c3"]]);
    expect(wrapper.findComponent(CustomColorPanel).exists()).toBe(false);
    expect(wrapper.get('[data-color-swatch="#ffffff"]').element).toBe(swatch);
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

  test("navigates compact rows using their column count and can clear restricted colors", async () => {
    const colors = [
      "#f3f5f7",
      "#d6e5ff",
      "#d6f1ff",
      "#d3f3e2",
      "#ffdcdb",
      "#ffecdb",
      "#fff5cc",
      "#fbdbff",
      "#ffdbea",
      "#c5cad3",
      "#adcbff",
    ];
    const wrapper = mountPalette({
      allowedColors: colors,
      showDefault: false,
      compact: true,
      columns: 9,
      clearable: true,
    });
    const first = wrapper.get<HTMLButtonElement>('[data-color-swatch="#f3f5f7"]');
    await first.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.get('[data-color-swatch="#c5cad3"]').attributes("tabindex")).toBe("0");
    await wrapper.get('[data-color-swatch="#c5cad3"]').trigger("keydown", { key: "ArrowUp" });
    expect(first.attributes("tabindex")).toBe("0");
    await wrapper.get('[data-color-action="clear"]').trigger("click");
    expect(wrapper.emitted("select")).toEqual([[null]]);
  });
});
