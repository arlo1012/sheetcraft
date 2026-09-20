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
  test("opens the list shortcut independently of general validation", async () => {
    const wrapper = mount(DataToolbar, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { capabilities },
    });
    await wrapper.get('[data-data-action="dropdown-list"]').trigger("click");
    expect(wrapper.emitted("openDropdownList")).toEqual([[]]);
    expect(wrapper.emitted("openValidation")).toBeUndefined();
    await wrapper.setProps({ disabled: true });
    expect(wrapper.get('[data-data-action="dropdown-list"]').attributes("disabled")).toBe("");
    wrapper.unmount();
  });

  test.each(["down", "right", "up", "left"])(
    "dispatches %s fill and dismisses the menu",
    async (direction) => {
      const wrapper = mount(DataToolbar, {
        attachTo: document.body,
        global: { plugins: [createAppI18n("en-US")] },
        props: { capabilities, canFillRows: true, canFillColumns: true },
      });
      await wrapper.get('[data-data-action="fill"]').trigger("click");
      await new DOMWrapper(document.body).get(`[data-data-fill="${direction}"]`).trigger("click");
      expect(wrapper.emitted("fill")).toEqual([[direction]]);
      expect(new DOMWrapper(document.body).find('[data-data-fill="down"]').exists()).toBe(false);
      wrapper.unmount();
    },
  );

  test("disables unavailable fill axes and single-cell fills", async () => {
    const wrapper = mount(DataToolbar, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { capabilities, canFillRows: true },
    });
    await wrapper.get('[data-data-action="fill"]').trigger("click");
    const right = new DOMWrapper(document.body).get('[data-data-fill="right"]');
    expect(right.attributes("aria-disabled")).toBe("true");
    await right.trigger("click");
    expect(wrapper.emitted("fill")).toBeUndefined();
    await wrapper.setProps({ canFillRows: false });
    expect(wrapper.get('[data-data-action="fill"]').attributes("disabled")).toBe("");
    wrapper.unmount();
  });

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
  test("opens the Filter split menu and forwards Advanced Filter", async () => {
    const wrapper = mount(DataToolbar, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { capabilities },
    });
    await wrapper.get('[data-data-action="filter"] [data-ribbon-split-menu]').trigger("click");
    await new DOMWrapper(document.body).get('[data-data-filter="advanced"]').trigger("click");
    expect(wrapper.emitted("advancedFilter")).toEqual([[]]);
    wrapper.unmount();
  });
});
