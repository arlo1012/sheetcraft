import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import SheetCellContextMenu from "../../../../../modules/sheet-grid/components/SheetCellContextMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("pivot Show Details context menu entry", () => {
  test("appears only for an eligible value cell and emits its dedicated action", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetCellContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        anchor: { contextElement: host, getBoundingClientRect: () => new DOMRect(16, 16, 0, 0) },
        showPivotDetails: false,
      },
    });
    try {
      await nextTick();
      const body = new DOMWrapper(document.body);
      expect(body.find('[data-cell-action="pivot-details"]').exists()).toBe(false);
      await wrapper.setProps({ showPivotDetails: true });
      await body.get('[data-cell-action="pivot-details"]').trigger("click");
      expect(wrapper.emitted("showPivotDetails")).toEqual([[]]);
      expect(wrapper.emitted("action")).toBeUndefined();
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
});
