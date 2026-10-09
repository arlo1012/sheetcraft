import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import SheetTabMenu from "../../../../../modules/workbook/components/SheetTabMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountMenu() {
  const sheet = createSheet("Plan", "sheet-1");
  sheet.properties = { ...sheet.properties, protected: true, pinned: true };
  const wrapper = mount(SheetTabMenu, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      sheet,
      anchor: null,
      sheetCount: 2,
      sheetIndex: 0,
      isOpen: true,
      canMoveLeft: false,
      canMoveRight: true,
      canHide: true,
      canDelete: true,
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function menu() {
  return new DOMWrapper(document.body).get(".workbook-sheet-tabs__menu");
}

describe("SheetTabMenu", () => {
  test("orders sheet commands and honors explicit command boundaries", async () => {
    const wrapper = mountMenu();
    const actions = menu().findAll("[data-sheet-tab-action]");
    expect(actions.map((item) => item.attributes("data-sheet-tab-action"))).toEqual([
      "duplicate",
      "rename",
      "protect",
      "tab-color",
      "pin",
      "move-left",
      "move-right",
      "hide",
      "delete",
    ]);
    expect(menu().get('[data-sheet-tab-action="protect"]').text()).toBe("Unprotect");
    expect(menu().get('[data-sheet-tab-action="pin"]').text()).toBe("Unpin");
    expect(menu().get('[data-sheet-tab-action="move-left"]').attributes("aria-disabled")).toBe(
      "true",
    );
    await menu().get('[data-sheet-tab-action="protect"]').trigger("click");
    expect(wrapper.emitted("protect")).toEqual([[false]]);
  });

  test("opens the color panel, returns focus on Escape, and applies an exact hex color", async () => {
    const wrapper = mountMenu();
    const colorAction = menu().get('[data-sheet-tab-action="tab-color"]');
    await colorAction.trigger("click");
    await new DOMWrapper(document.body)
      .get(".sheet-tab-color-panel")
      .trigger("keydown", { key: "Escape" });
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector(".sheet-tab-color-panel")).toBeNull();
    expect(document.activeElement).toBe(colorAction.element);

    await colorAction.trigger("click");
    const panel = new DOMWrapper(document.body).get(".sheet-tab-color-panel");
    await panel.get('[data-color-action="more"]').trigger("click");
    const picker = wrapper.findComponent({ name: "TColorPickerPanel" });
    picker.vm.$emit("change", "#12ab34");
    expect(wrapper.emitted("tabColor")).toBeUndefined();
    await panel.get('[data-color-action="apply"]').trigger("click");
    expect(wrapper.emitted("tabColor")).toEqual([["#12AB34"]]);
    expect(wrapper.emitted("close")?.at(-1)).toEqual([true]);
  });

  test("closes the full menu intent when a color panel loses focus outside", async () => {
    const wrapper = mountMenu();
    await menu().get('[data-sheet-tab-action="tab-color"]').trigger("click");
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector(".sheet-tab-color-panel")).toBeNull();
    expect(wrapper.emitted("close")?.at(-1)).toEqual([false]);
  });
});
