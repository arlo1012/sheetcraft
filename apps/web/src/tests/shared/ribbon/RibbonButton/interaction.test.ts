import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import RibbonButton from "../../../../shared/ribbon/RibbonButton.vue";

describe("RibbonButton", () => {
  test("keeps accessible tool semantics and exposes its trigger", async () => {
    const wrapper = mount(RibbonButton, {
      props: { label: "Bold", text: "Bold", pressed: "mixed", fullWidth: true },
    });

    expect(wrapper.element.tagName).toBe("SPAN");
    expect(wrapper.attributes()).toMatchObject({
      role: "button",
      tabindex: "0",
      "aria-disabled": "false",
      "aria-label": "Bold",
      "aria-pressed": "mixed",
    });
    expect(wrapper.classes()).toContain("is-full-width");
    expect(wrapper.vm.rootElement).toBe(wrapper.element);

    await wrapper.trigger("click");
    expect(wrapper.emitted("activate")).toHaveLength(1);
  });

  test.each(["Enter", " "])("activates once with %j and ignores held-key repeats", async (key) => {
    const wrapper = mount(RibbonButton, { props: { label: "Bold" } });

    await wrapper.trigger("keydown", { key });
    await wrapper.trigger("keydown", { key, repeat: true });
    expect(wrapper.emitted("activate")).toHaveLength(1);
  });

  test("does not emit an action while disabled", async () => {
    const wrapper = mount(RibbonButton, { props: { label: "Undo", disabled: true } });

    expect(wrapper.attributes()).toMatchObject({ "aria-disabled": "true", tabindex: "-1" });
    await wrapper.trigger("click");
    await wrapper.trigger("keydown", { key: "Enter" });
    await wrapper.trigger("keydown", { key: " " });
    expect(wrapper.emitted("activate")).toBeUndefined();
  });
});
