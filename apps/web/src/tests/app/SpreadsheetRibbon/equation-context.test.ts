import { createDefaultSelectionCellStyleState } from "@sheetcraft/core/style-state";
import { mount } from "@vue/test-utils";
import { expect, test } from "vitest";
import SpreadsheetRibbon from "../../../app/SpreadsheetRibbon.vue";
import { createAppI18n } from "../../../shared/i18n";

test("mathematical source editing retains its tools when the genuine drawing selection arrives later", async () => {
  const wrapper = mount(SpreadsheetRibbon, {
    props: {
      state: createDefaultSelectionCellStyleState(),
      disabled: false,
      hasShape: false,
      hasEquation: false,
    },
    slots: {
      "equation-tools": "<span data-test-math-tools>Math editing</span>",
      "shape-tools": "<span data-test-object-tools>Object controls</span>",
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  try {
    await wrapper.setProps({ hasEquation: true });
    expect(wrapper.find("[data-test-math-tools]").exists()).toBe(true);
    await wrapper.setProps({ hasShape: true });
    expect(wrapper.find("[data-test-math-tools]").exists()).toBe(true);
    expect(wrapper.find("[data-test-object-tools]").exists()).toBe(false);
    await wrapper.setProps({ hasEquation: false });
    expect(wrapper.find("[data-test-object-tools]").exists()).toBe(true);
  } finally {
    wrapper.unmount();
  }
});
