import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import FilterPanelActions from "../../../../shared/filter/components/FilterPanelActions.vue";
import { createAppI18n } from "../../../../shared/i18n";

describe("shared filter panel actions", () => {
  test("formats ordinary, search and record summaries and emits the existing actions", async () => {
    const wrapper = mount(FilterPanelActions, {
      props: { disabled: false, summary: { selected: 2, total: 5 } },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      expect(wrapper.get(".filter-panel-actions__summary").text()).toBe("2 of 5 selected");
      await wrapper.setProps({ summary: { selected: 1, total: 3, search: true } });
      expect(wrapper.get(".filter-panel-actions__summary").text()).toBe("Search results: 1 of 3");
      await wrapper.setProps({ summary: { selected: 4, total: 9, records: true } });
      expect(wrapper.get(".filter-panel-actions__summary").text()).toBe("4 of 9 records selected");
      const buttons = wrapper.findAll("button");
      await buttons[0]!.trigger("click");
      await buttons[1]!.trigger("click");
      expect(wrapper.emitted("cancel")).toHaveLength(1);
      expect(wrapper.emitted("apply")).toHaveLength(1);
      await wrapper.setProps({ disabled: true });
      expect((buttons[1]!.element as HTMLButtonElement).disabled).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });
});
