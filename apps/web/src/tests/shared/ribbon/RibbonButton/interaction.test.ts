import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import RibbonButton from "../../../../shared/ribbon/RibbonButton.vue";

describe("RibbonButton", () => {
  test("keeps native button semantics and exposes its trigger", async () => {
    const wrapper = mount(RibbonButton, {
      props: { label: "Bold", text: "Bold", pressed: "mixed", fullWidth: true },
    });

    expect(wrapper.element).toBeInstanceOf(HTMLButtonElement);
    expect(wrapper.attributes()).toMatchObject({
      type: "button",
      "aria-label": "Bold",
      "aria-pressed": "mixed",
    });
    expect(wrapper.classes()).toContain("is-full-width");
    expect(wrapper.vm.rootElement).toBe(wrapper.element);

    await wrapper.trigger("click");
    expect(wrapper.emitted("activate")).toHaveLength(1);
  });

  test("does not emit an action while disabled", async () => {
    const wrapper = mount(RibbonButton, { props: { label: "Undo", disabled: true } });

    expect((wrapper.element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.trigger("click");
    expect(wrapper.emitted("activate")).toBeUndefined();
  });
});
