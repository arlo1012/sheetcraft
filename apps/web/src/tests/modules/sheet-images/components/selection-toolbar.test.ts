import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import SheetPictureSelectionToolbar from "../../../../modules/sheet-images/components/SheetPictureSelectionToolbar.vue";
import { createAppI18n } from "../../../../shared/i18n";
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function fixture(count = 2) {
  const wrapper = mount(SheetPictureSelectionToolbar, {
    attachTo: document.body,
    props: { anchor: document.body, count, disabled: false, selectionKey: "owner:selection" },
    global: { plugins: [createAppI18n("zh-CN")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
function button(action: string): HTMLButtonElement {
  return document.querySelector(`[data-picture-selection-action="${action}"]`)!;
}
describe("picture multiselection floating shortcuts", () => {
  test("shows the concrete desktop action order and disables distribution for two objects", () => {
    fixture();
    expect(
      Array.from(document.querySelectorAll("[data-picture-selection-action]")).map((element) =>
        element.getAttribute("data-picture-selection-action"),
      ),
    ).toEqual([
      "reference",
      "left",
      "center",
      "right",
      "top",
      "middle",
      "bottom",
      "both",
      "horizontal",
      "vertical",
      "group",
    ]);
    expect(button("horizontal").disabled).toBe(true);
    expect(button("vertical").disabled).toBe(true);
    expect(button("both").title).toBe("水平垂直居中");
  });
  test("emits one alignment/group action bound to the current selection identity", () => {
    const wrapper = fixture(3);
    button("both").click();
    button("horizontal").click();
    button("group").click();
    expect(wrapper.emitted("align")).toEqual([
      ["both", "selection", "owner:selection"],
      ["horizontal", "selection", "owner:selection"],
    ]);
    expect(wrapper.emitted("group")).toEqual([["owner:selection"]]);
  });
  test("has a keyboard-accessible reference selector and resets open state on selection change", async () => {
    const wrapper = fixture();
    button("reference").click();
    await wrapper.vm.$nextTick();
    const last = document.querySelector<HTMLElement>(
      '[data-picture-selection-reference="last-selected"]',
    )!;
    last.click();
    await wrapper.vm.$nextTick();
    button("left").click();
    expect(wrapper.emitted("align")).toEqual([["left", "last-selected", "owner:selection"]]);
    button("reference").click();
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ selectionKey: "next:selection" });
    expect(document.querySelector("[data-picture-selection-reference]")).toBeNull();
    button("group").focus();
    button("group").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(document.activeElement).toBe(button("reference"));
    button("reference").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(wrapper.emitted("dismiss")).toEqual([["next:selection"]]);
  });
  test("read-only shortcuts cannot fire edits", async () => {
    const wrapper = fixture();
    await wrapper.setProps({ disabled: true });
    button("group").click();
    button("left").click();
    button("reference").click();
    expect(wrapper.emitted("group")).toBeUndefined();
    expect(wrapper.emitted("align")).toBeUndefined();
    expect(document.querySelector("[data-picture-selection-reference]")).toBeNull();
  });
});
