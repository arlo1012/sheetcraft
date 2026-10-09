import { describe, expect, test } from "vitest";
import { DOMWrapper, mount } from "@vue/test-utils";
import { DEFAULT_SHEET_WATERMARK } from "@sheetcraft/core/page-decoration";
import { createAppI18n } from "../../../shared/i18n";
import PageWatermarkMenu from "../../../modules/page-decorations/components/PageWatermarkMenu.vue";

describe("page watermark menu", () => {
  test("keeps the gallery open while deleting the fourth saved watermark from its floating menu", async () => {
    const presets = ["one", "two", "three", "four"].map((id) => ({
      id,
      name: `Watermark ${id}`,
      watermark: { ...DEFAULT_SHEET_WATERMARK, text: id },
    }));
    const wrapper = mount(PageWatermarkMenu, {
      attachTo: document.body,
      props: { disabled: false, presets },
      global: { plugins: [createAppI18n("en-US")] },
    });

    await wrapper.get('[data-page-tool="watermark"]').trigger("click");
    const body = new DOMWrapper(document.body);
    await body.get('[data-watermark-preset-actions="four"]').trigger("click");
    const deleteAction = body.get('[data-watermark-preset-action="delete"]');
    await deleteAction.trigger("pointerdown");
    await deleteAction.trigger("click");

    expect(wrapper.emitted("deletePreset")).toEqual([[presets[3]]]);
    expect(body.find('[data-watermark-preset-id="four"]').exists()).toBe(true);
    wrapper.unmount();
    document.body.replaceChildren();
  });
});
