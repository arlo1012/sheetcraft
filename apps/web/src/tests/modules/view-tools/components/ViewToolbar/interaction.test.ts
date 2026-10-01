import { isRef, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import ViewToolbar from "../../../../../modules/view-tools/components/ViewToolbar.vue";
import { createAppI18n } from "../../../../../shared/i18n";

function mountToolbar(overrides = {}, i18n = createAppI18n("en-US")) {
  return mount(ViewToolbar, {
    global: { plugins: [i18n] },
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
      ...overrides,
    },
  });
}

describe("ViewToolbar", () => {
  test("updates the visible ruler unit label when language changes", async () => {
    const i18n = createAppI18n("en-US");
    const wrapper = mountToolbar({ viewMode: "page-layout" }, i18n);
    try {
      const input = wrapper.get<HTMLInputElement>('[data-page-layout-option="ruler-unit"] input');
      expect(input.element.value).toBe("Centimetres");
      const locale = i18n.global.locale;
      if (isRef(locale)) locale.value = "zh-CN";
      else i18n.global.locale = "zh-CN";
      await nextTick();
      expect(input.element.value).toBe("厘米");
    } finally {
      wrapper.unmount();
    }
  });
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
  test("shows page-layout ruler controls only in page layout and emits their settings", async () => {
    const normal = mountToolbar();
    expect(normal.find('[data-ribbon-group="page-layout-rulers"]').exists()).toBe(false);

    const wrapper = mountToolbar({ viewMode: "page-layout" });
    expect(wrapper.find('[data-page-layout-option="rulers"]').exists()).toBe(true);
    expect(wrapper.find('[data-page-layout-option="margins"]').exists()).toBe(true);
    expect(wrapper.find('[data-page-layout-option="white-space"]').exists()).toBe(true);

    await wrapper.get('[data-page-layout-option="rulers"] input').setValue(false);
    await wrapper.get('[data-page-layout-option="margins"] input').setValue(true);
    await wrapper.get('[data-page-layout-option="white-space"] input').setValue(false);
    wrapper.getComponent(TSelect).vm.$emit("update:modelValue", "in");

    expect(wrapper.emitted("update:showPageRulers")).toEqual([[false]]);
    expect(wrapper.emitted("update:showPageMargins")).toEqual([[true]]);
    expect(wrapper.emitted("update:showPageWhiteSpace")).toEqual([[false]]);
    expect(wrapper.emitted("update:pageRulerUnit")).toEqual([["in"]]);
  });
});
