import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import RibbonDialogLauncher from "../../../../shared/ribbon/RibbonDialogLauncher.vue";

describe("RibbonDialogLauncher", () => {
  test.each(["Enter", " "])("activates with %j and ignores held-key repeats", async (key) => {
    const wrapper = mount(RibbonDialogLauncher, { props: { label: "Page setup" } });
    expect(wrapper.element.tagName).toBe("SPAN");
    expect(wrapper.attributes()).toMatchObject({ role: "button", tabindex: "0" });
    expect(wrapper.vm.rootElement).toBe(wrapper.element);

    await wrapper.trigger("keydown", { key });
    await wrapper.trigger("keydown", { key, repeat: true });
    expect(wrapper.emitted("activate")).toHaveLength(1);
  });

  test("suppresses click and keyboard activation until re-enabled", async () => {
    const wrapper = mount(RibbonDialogLauncher, {
      props: { label: "Page setup", disabled: true },
    });
    expect(wrapper.attributes()).toMatchObject({ "aria-disabled": "true", tabindex: "-1" });
    await wrapper.trigger("click");
    await wrapper.trigger("keydown", { key: "Enter" });
    await wrapper.trigger("keydown", { key: " " });
    expect(wrapper.emitted("activate")).toBeUndefined();

    await wrapper.setProps({ disabled: false });
    expect(wrapper.attributes()).toMatchObject({ "aria-disabled": "false", tabindex: "0" });
    await wrapper.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("activate")).toHaveLength(1);
  });
});
