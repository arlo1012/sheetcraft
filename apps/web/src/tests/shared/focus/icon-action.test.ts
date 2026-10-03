import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import { vIconAction } from "../../../shared/focus/icon-action";

function fixture(disabled = false, handled = false) {
  const activate = vi.fn();
  const customKey = vi.fn((event: KeyboardEvent) => {
    if (handled && event.key === "Enter") {
      event.preventDefault();
      activate();
    }
  });
  const component = defineComponent({
    directives: { iconAction: vIconAction },
    props: { disabled: Boolean },
    setup: () => ({ activate, customKey }),
    template:
      '<span v-icon-action="disabled" :class="{ muted: disabled }" aria-label="Remove" @click="activate" @keydown="customKey"><svg /></span>',
  });
  return { wrapper: mount(component, { props: { disabled } }), activate, customKey };
}

describe("interactive icon containers", () => {
  test("supports pointer, Enter and Space activation without repeated key presses", async () => {
    const { wrapper, activate } = fixture();
    expect(wrapper.attributes("role")).toBe("button");
    expect(wrapper.attributes("tabindex")).toBe("0");
    await wrapper.trigger("click");
    await wrapper.trigger("keydown", { key: "Enter" });
    await wrapper.trigger("keydown", { key: " " });
    await wrapper.trigger("keydown", { key: " ", repeat: true });
    expect(activate).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });

  test("blocks disabled pointer and keyboard actions and restores keyboard access on enable", async () => {
    const { wrapper, activate, customKey } = fixture(true, true);
    expect(wrapper.attributes("tabindex")).toBe("-1");
    expect(wrapper.attributes("aria-disabled")).toBe("true");
    await wrapper.trigger("click");
    await wrapper.trigger("keydown", { key: "Enter" });
    expect(activate).not.toHaveBeenCalled();
    expect(customKey).not.toHaveBeenCalled();
    await wrapper.setProps({ disabled: false });
    expect(wrapper.attributes("tabindex")).toBe("0");
    expect(wrapper.classes()).toContain("idea-icon-action");
    await wrapper.trigger("keydown", { key: "Enter" });
    expect(activate).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  test("keeps existing keyboard handlers from activating an icon twice", async () => {
    const { wrapper, activate } = fixture(false, true);
    await wrapper.trigger("keydown", { key: "Enter" });
    expect(activate).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
