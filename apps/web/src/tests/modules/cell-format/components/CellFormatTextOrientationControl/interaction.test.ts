import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import CellFormatTextOrientationControl from "../../../../../modules/cell-format/components/CellFormatTextOrientationControl.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("CellFormatTextOrientationControl", () => {
  test("clamps signed rotation and makes vertical text an explicit option", async () => {
    const wrapper = mount(CellFormatTextOrientationControl, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { modelValue: 0, mixed: false },
    });
    wrapper
      .get("[data-cell-format-rotation]")
      .findComponent({ name: "TInputNumber" })
      .vm.$emit("change", -120);
    wrapper
      .get("[data-cell-format-vertical-text]")
      .findComponent({ name: "TCheckbox" })
      .vm.$emit("change", true);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("update:modelValue")).toEqual([[-90], ["vertical"]]);
  });
});
