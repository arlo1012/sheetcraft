import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import SheetZoomMenu from "../../../../shared/sheet-view/SheetZoomMenu.vue";
import { createAppI18n } from "../../../../shared/i18n";

const wrappers: ReturnType<typeof mount>[] = [];
function mountMenu(zoom = 75) {
  const wrapper = mount(SheetZoomMenu, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: { zoom },
  });
  wrappers.push(wrapper);
  return wrapper;
}
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

describe("SheetZoomMenu", () => {
  test("opens a compact radio menu and selects all explicit presets", async () => {
    const wrapper = mountMenu();
    await wrapper.get('[data-view-control="zoom-menu"]').trigger("click");
    const menu = new DOMWrapper(document.body).get('[aria-label="Zoom"]');
    expect(menu.findAll("[data-zoom-preset]")).toHaveLength(5);
    expect(menu.get('[data-zoom-preset="75"]').attributes("aria-checked")).toBe("true");
    await menu.get('[data-zoom-preset="25"]').trigger("click");
    expect(wrapper.emitted("select")).toEqual([[25]]);
  });

  test("emits fit selection and validates integer custom zoom", async () => {
    const wrapper = mountMenu(100);
    await wrapper.get('[data-view-control="zoom-menu"]').trigger("click");
    const menu = new DOMWrapper(document.body).get('[aria-label="Zoom"]');
    await menu.get("[data-zoom-fit-selection]").trigger("click");
    expect(wrapper.emitted("fitSelection")).toEqual([[]]);

    await wrapper.get('[data-view-control="zoom-menu"]').trigger("click");
    wrapper.findComponent({ name: "TInputNumber" }).vm.$emit("enter", 74.6);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("select")).toEqual([[75]]);
  });
});
