import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import SheetAxisContextMenu from "../../../../../modules/sheet-grid/components/SheetAxisContextMenu.vue";
import SheetDimensionInput from "../../../../../modules/sheet-grid/components/SheetDimensionInput.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("axis context dimension units", () => {
  test("converts a column width to pixels only when a new dimension is committed", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetAxisContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        axis: "column",
        selectionCount: 1,
        maxBeforeCount: 10,
        maxAfterCount: 10,
        currentSize: 96,
        minimumSize: 32,
        maximumSize: 640,
        anchor: { contextElement: host, getBoundingClientRect: () => new DOMRect(20, 20, 0, 0) },
      },
    });
    try {
      const field = wrapper.getComponent(SheetDimensionInput);
      const number = field.getComponent({ name: "TInputNumber" });
      const unit = field.getComponent({ name: "TSelect" });
      expect(number.props("modelValue")).toBe(13);
      unit.vm.$emit("change", "cm");
      await nextTick();
      expect(number.props("modelValue")).toBe(2.54);
      expect(wrapper.emitted("resize")).toBeUndefined();
      number.vm.$emit("change", 5.08);
      await nextTick();
      expect(wrapper.emitted("resize")).toBeUndefined();
      number.vm.$emit("enter", 5.08, { e: new KeyboardEvent("keydown", { key: "Enter" }) });
      await nextTick();
      expect(wrapper.emitted("resize")).toEqual([[192]]);
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });

  test("allows a mixed multi-column selection to receive a common size", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetAxisContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        axis: "column",
        selectionCount: 2,
        maxBeforeCount: 10,
        maxAfterCount: 10,
        minimumSize: 32,
        maximumSize: 640,
        anchor: { contextElement: host, getBoundingClientRect: () => new DOMRect(20, 20, 0, 0) },
      },
    });
    try {
      const field = wrapper.getComponent(SheetDimensionInput);
      const number = field.getComponent({ name: "TInputNumber" });
      expect(new DOMWrapper(document.body).find("[data-sheet-dimension-number]").exists()).toBe(
        true,
      );
      expect(number.props("modelValue")).toBe("");
      number.vm.$emit("change", 10);
      number.vm.$emit("enter", 10, { e: new KeyboardEvent("keydown", { key: "Enter" }) });
      await nextTick();
      expect(wrapper.emitted("resize")).toEqual([[75]]);
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
});
