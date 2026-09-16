import { DOMWrapper, mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import DataToolbar from "../../../../modules/data-tools/components/DataToolbar.vue";
import { createAppI18n } from "../../../../shared/i18n";

const capabilities = {
  sort: true,
  split: true,
  removeDuplicates: true,
  subtotal: true,
  ungroupRows: true,
  ungroupColumns: true,
  expand: true,
  collapse: true,
  clearFilter: true,
};
describe("DataToolbar", () => {
  test("opens and closes the Group menu after selecting columns", async () => {
    const wrapper = mount(DataToolbar, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { capabilities },
    });
    expect(new DOMWrapper(document.body).find('[data-data-group="columns"]').exists()).toBe(false);
    await wrapper.get('[data-data-action="group"]').trigger("click");
    const item = new DOMWrapper(document.body).get('[data-data-group="columns"]');
    await item.trigger("click");
    expect(wrapper.emitted("group")).toEqual([["columns"]]);
    expect(new DOMWrapper(document.body).find('[data-data-group="columns"]').exists()).toBe(false);
    wrapper.unmount();
  });
  test("disables the Ungroup menu when neither axis has a group", () => {
    const wrapper = mount(DataToolbar, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { capabilities: { ...capabilities, ungroupRows: false, ungroupColumns: false } },
    });
    expect(wrapper.get('[data-data-action="ungroup"]').attributes("disabled")).toBe("");
  });
});
