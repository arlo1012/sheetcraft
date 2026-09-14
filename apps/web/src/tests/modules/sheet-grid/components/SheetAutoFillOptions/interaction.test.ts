import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import SheetAutoFillOptions from "../../../../../modules/sheet-grid/components/SheetAutoFillOptions.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: ReturnType<typeof mount>[] = [];

function mountOptions() {
  const wrapper = mount(SheetAutoFillOptions, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      position: { x: 120, y: 80 },
      visible: true,
      currentMode: "series",
      availableModes: ["copy", "series", "fillFormatsOnly", "fillWithoutFormatting"],
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

describe("SheetAutoFillOptions", () => {
  test("shows only the available modes and marks the active mode", async () => {
    const wrapper = mountOptions();
    await wrapper.get("[data-sheet-auto-fill-options-trigger]").trigger("click");

    const menu = new DOMWrapper(document.body).get('[role="menu"][aria-label="Auto Fill Options"]');
    expect(menu.findAll("[data-sheet-auto-fill-mode]")).toHaveLength(4);
    expect(menu.get('[data-sheet-auto-fill-mode="series"]').attributes("aria-checked")).toBe(
      "true",
    );
    expect(menu.find('[data-sheet-auto-fill-mode="dateDay"]').exists()).toBe(false);
  });

  test("emits a requested mode without changing the selection", async () => {
    const wrapper = mountOptions();
    await wrapper.get("[data-sheet-auto-fill-options-trigger]").trigger("click");
    await new DOMWrapper(document.body)
      .get('[data-sheet-auto-fill-mode="fillFormatsOnly"]')
      .trigger("click");

    expect(wrapper.emitted("select")).toEqual([["fillFormatsOnly"]]);
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  test("Escape closes only the menu without requesting a new fill mode", async () => {
    const wrapper = mountOptions();
    await wrapper.get("[data-sheet-auto-fill-options-trigger]").trigger("click");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("select")).toBeUndefined();
    expect(
      new DOMWrapper(document.body).find('[role="menu"][aria-label="Auto Fill Options"]').exists(),
    ).toBe(false);
    expect(wrapper.find("[data-sheet-auto-fill-options-trigger]").exists()).toBe(true);
  });
});
