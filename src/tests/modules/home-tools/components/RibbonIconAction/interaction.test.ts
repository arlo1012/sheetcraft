import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import RibbonIconAction from "../../../../../modules/home-tools/components/RibbonIconAction.vue";

describe("RibbonIconAction interaction", () => {
  test("shows disclosure only when the action is available", async () => {
    const available = mount(RibbonIconAction, {
      props: { label: "Available menu", disclosure: true },
    });

    expect(available.get(".ribbon-icon-action__disclosure")).toBeTruthy();
    await available.trigger("click");
    expect(available.emitted("activate")).toHaveLength(1);

    const unavailable = mount(RibbonIconAction, {
      props: { label: "Unavailable menu", disclosure: true, disabled: true },
    });

    expect(unavailable.find(".ribbon-icon-action__disclosure").exists()).toBe(false);
    await unavailable.trigger("click");
    expect(unavailable.emitted("activate")).toBeUndefined();
  });
});
