import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import ViewToolbar from "../../../../../modules/view-tools/components/ViewToolbar.vue";
import { createAppI18n } from "../../../../../shared/i18n";

function mountToolbar() {
  return mount(ViewToolbar, {
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      viewMode: "normal",
      showFormulaBar: true,
      showHeaders: true,
      showGridLines: true,
      eyeComfortEnabled: false,
      highlightEnabled: false,
      highlightColor: "#22a06b",
      fullscreen: false,
      fullscreenAvailable: true,
      zoom: 75,
      freezeDisabled: false,
      activeCell: { row: 2, column: 3 },
      freezePanes: { rows: 0, columns: 0 },
    },
  });
}

describe("ViewToolbar", () => {
  test("switches each real workbook view and opens page setup", async () => {
    const wrapper = mountToolbar();
    await wrapper.get('[data-view-tool="page-break-preview"]').trigger("click");
    await wrapper.get('[data-view-tool="page-layout-view"]').trigger("click");
    await wrapper.get('[data-view-tool="normal-view"]').trigger("click");
    await wrapper.get('[data-view-tool="page-setup"]').trigger("click");

    expect(wrapper.emitted("update:viewMode")).toEqual([
      ["page-break-preview"],
      ["page-layout"],
      ["normal"],
    ]);
    expect(wrapper.emitted("pageSetup")).toEqual([[]]);
  });

  test("keeps custom views and task pane unavailable", () => {
    const wrapper = mountToolbar();
    expect(
      wrapper.get('[data-view-option="task-pane"] input').attributes("disabled"),
    ).toBeDefined();
    expect(wrapper.get('[data-view-tool="custom-views"]').attributes("disabled")).toBeDefined();
  });
});
