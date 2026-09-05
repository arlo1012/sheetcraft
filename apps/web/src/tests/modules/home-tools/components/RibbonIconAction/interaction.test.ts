import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import RibbonIconAction from "../../../../../modules/home-tools/components/RibbonIconAction.vue";

describe("RibbonIconAction interaction", () => {
  test("keeps a disclosure visible when availability changes", async () => {
    const wrapper = mount(RibbonIconAction, {
      props: { label: "Available menu", disclosure: true },
    });

    expect(wrapper.element).toBeInstanceOf(HTMLButtonElement);
    expect(wrapper.attributes()).toMatchObject({ type: "button" });
    expect((wrapper.element as HTMLButtonElement).disabled).toBe(false);
    expect(wrapper.get(".ribbon-icon-action__disclosure")).toBeTruthy();
    await wrapper.trigger("click");
    expect(wrapper.emitted("activate")).toHaveLength(1);

    await wrapper.setProps({ disabled: true });
    expect(wrapper.attributes()).toMatchObject({
      type: "button",
      disabled: "",
    });
    expect((wrapper.element as HTMLButtonElement).disabled).toBe(true);
    expect(wrapper.get(".ribbon-icon-action__disclosure")).toBeTruthy();
    await wrapper.trigger("click");
    expect(wrapper.emitted("activate")).toHaveLength(1);

    await wrapper.setProps({ disabled: false });
    expect((wrapper.element as HTMLButtonElement).disabled).toBe(false);
    expect(wrapper.get(".ribbon-icon-action__disclosure")).toBeTruthy();
  });

  test("exposes pressed state through the native button", () => {
    const wrapper = mount(RibbonIconAction, {
      props: { label: "Bold", pressed: "mixed" },
    });

    expect(wrapper.element).toBeInstanceOf(HTMLButtonElement);
    expect(wrapper.attributes()).toMatchObject({
      type: "button",
      "aria-pressed": "mixed",
    });
  });
});
