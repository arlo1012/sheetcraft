import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import SheetCellContextMenu from "../../../../../modules/sheet-grid/components/SheetCellContextMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("SheetCellContextMenu filtered selection", () => {
  test("disables cut with its localized hidden-row explanation", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const reason = "Cannot cut a range that crosses hidden rows.";
    const wrapper = mount(SheetCellContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        anchor: {
          contextElement: host,
          getBoundingClientRect: () => new DOMRect(16, 16, 0, 0),
        },
        cutDisabledReason: reason,
      },
    });

    try {
      await nextTick();
      const body = new DOMWrapper(document.body);
      const cut = body.get<HTMLElement>('[data-context-clipboard-action="cut"]');
      expect(cut.attributes("disabled")).toBe("");
      expect(cut.attributes("title")).toBe(reason);
      expect(cut.attributes("aria-description")).toBe(reason);

      await body.get('ul[role="menu"]').trigger("keydown", { key: "x", ctrlKey: true });
      await cut.trigger("click");
      expect(wrapper.emitted("cut")).toBeUndefined();
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
});
