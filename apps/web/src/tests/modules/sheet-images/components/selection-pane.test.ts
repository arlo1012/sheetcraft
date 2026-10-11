import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import PictureSelectionPane from "../../../../modules/sheet-images/components/PictureSelectionPane.vue";
import { createAppI18n } from "../../../../shared/i18n";
describe("picture pane group selection", () => {
  test("removing any group member deselects the whole group and additions include hidden members", async () => {
    const image = (id: string, groupId?: string): FloatingImage => ({
      id,
      assetId: "asset",
      altText: id,
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 100,
      height: 50,
      ...(groupId ? { groupId } : {}),
    });
    const wrapper = mount(PictureSelectionPane, {
      props: {
        images: [image("a", "group"), { ...image("b", "group"), hidden: true }, image("c")],
        selectedIds: ["a", "b", "c"],
        disabled: false,
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    const checkbox = wrapper
      .findAllComponents(TCheckbox)
      .find((entry) => entry.attributes("aria-label") === "a")!;
    checkbox.vm.$emit("change", false);
    expect(wrapper.emitted("select")).toEqual([[["c"]]]);
    await wrapper.setProps({ selectedIds: ["c"] });
    checkbox.vm.$emit("change", true);
    expect(wrapper.emitted("select")![1]).toEqual([["c", "a", "b"]]);
    wrapper.unmount();
  });
});
