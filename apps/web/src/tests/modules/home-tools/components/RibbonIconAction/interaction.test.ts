import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import RibbonIconAction from "../../../../../modules/home-tools/components/RibbonIconAction.vue";

describe("RibbonIconAction interaction", () => {
  test("shows disclosure only when the action is available", async () => {
    const available = mount(RibbonIconAction, {
      props: { label: "Available menu", disclosure: true },
    });

    expect(available.element).toBeInstanceOf(HTMLButtonElement);
    expect(available.attributes()).toMatchObject({ type: "button" });
    expect((available.element as HTMLButtonElement).disabled).toBe(false);
    expect(available.get(".ribbon-icon-action__disclosure")).toBeTruthy();
    await available.trigger("click");
    expect(available.emitted("activate")).toHaveLength(1);

    const unavailable = mount(RibbonIconAction, {
      props: { label: "Unavailable menu", disclosure: true, disabled: true },
    });

    expect(unavailable.element).toBeInstanceOf(HTMLButtonElement);
    expect(unavailable.attributes()).toMatchObject({ type: "button", disabled: "" });
    expect((unavailable.element as HTMLButtonElement).disabled).toBe(true);
    expect(unavailable.find(".ribbon-icon-action__disclosure").exists()).toBe(false);
    await unavailable.trigger("click");
    expect(unavailable.emitted("activate")).toBeUndefined();
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
