import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import FloatingPanelSurface from "../../../../shared/floating/FloatingPanelSurface.vue";

describe("FloatingPanelSurface", () => {
  test("updates fallthrough positioning and classes while preserving its accessible surface contract", async () => {
    const wrapper = mount(FloatingPanelSurface, {
      props: {
        label: "Fill color",
        style: { left: "12px", top: "24px" },
        class: "initial-panel",
      },
      slots: { default: "Palette" },
    });

    try {
      expect(wrapper.attributes("role")).toBe("dialog");
      expect(wrapper.attributes("aria-label")).toBe("Fill color");
      expect(wrapper.attributes("tabindex")).toBe("-1");
      expect(wrapper.classes()).toContain("initial-panel");
      expect(wrapper.element.style.left).toBe("12px");
      expect(wrapper.vm.rootElement).toBe(wrapper.element);

      await wrapper.setProps({
        style: { left: "48px", top: "72px" },
        class: "moved-panel",
      });

      expect(wrapper.classes()).not.toContain("initial-panel");
      expect(wrapper.classes()).toContain("moved-panel");
      expect(wrapper.element.style.left).toBe("48px");
      expect(wrapper.element.style.top).toBe("72px");
    } finally {
      wrapper.unmount();
    }
  });
});
