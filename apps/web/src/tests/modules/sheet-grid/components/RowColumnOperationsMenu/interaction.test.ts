import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { createSheet, type CellRange } from "@idea10/core/workbook";
import RowColumnOperationsMenu from "../../../../../modules/sheet-grid/components/RowColumnOperationsMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const rowRange: CellRange = {
  start: { row: 2, column: 0 },
  end: { row: 3, column: 16_383 },
};

const mounted: Array<{ wrapper: ReturnType<typeof mount>; host: HTMLElement }> = [];

function mountMenu(
  overrides: Partial<InstanceType<typeof RowColumnOperationsMenu>["$props"]> = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(RowColumnOperationsMenu, {
    attachTo: host,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      sheet: createSheet("Sheet1", "sheet-1"),
      range: rowRange,
      disabled: false,
      ...overrides,
    },
  });
  mounted.push({ wrapper, host });
  return wrapper;
}

function menu() {
  return new DOMWrapper(document.body).get('ul[role="menu"]');
}

afterEach(() => {
  for (const { wrapper, host } of mounted.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
});

describe("RowColumnOperationsMenu", () => {
  test("uses the selected row count for structural commands and clears a complete row span", async () => {
    const wrapper = mountMenu();
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();

    await menu().get('[data-row-column-action="insert-rows-above"]').trigger("click");
    expect(wrapper.emitted("insert")).toEqual([[{ axis: "row", index: 2, count: 2 }]]);

    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await menu().get('[data-row-column-action="delete-rows"]').trigger("click");
    expect(wrapper.emitted("delete")).toEqual([[{ axis: "row", index: 2, count: 2 }]]);

    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await menu().get('[data-row-column-action="clear-rows"]').trigger("click");
    expect(wrapper.emitted("clear")).toEqual([
      [
        {
          start: { row: 2, column: 0 },
          end: { row: 3, column: 16_383 },
        },
      ],
    ]);
  });

  test("uses the selected column count and clears a complete column span", async () => {
    const wrapper = mountMenu({
      range: {
        start: { row: 4, column: 3 },
        end: { row: 10, column: 4 },
      },
    });
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();

    await menu().get('[data-row-column-action="insert-columns-after"]').trigger("click");
    expect(wrapper.emitted("insert")).toEqual([[{ axis: "column", index: 5, count: 2 }]]);

    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await menu().get('[data-row-column-action="clear-columns"]').trigger("click");
    expect(wrapper.emitted("clear")).toEqual([
      [
        {
          start: { row: 0, column: 3 },
          end: { row: 1_048_575, column: 4 },
        },
      ],
    ]);
  });

  test("disables protected-sheet operations and dimension actions for multi-axis selections", async () => {
    const wrapper = mountMenu({ disabled: true });
    expect(wrapper.get('[data-ribbon-action="row-column-operations"]').attributes("disabled")).toBe(
      "",
    );
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    expect(document.body.querySelector('ul[role="menu"]')).toBeNull();

    await wrapper.setProps({ disabled: false });
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    expect(menu().get('[data-row-column-action="row-height"]').attributes("aria-disabled")).toBe(
      "true",
    );
  });

  test("keeps a row-height dialog bound to its opening target and restores trigger focus", async () => {
    const wrapper = mountMenu({
      range: {
        start: { row: 2, column: 0 },
        end: { row: 2, column: 4 },
      },
    });
    const trigger = wrapper.get('[data-ribbon-action="row-column-operations"]');
    await trigger.trigger("click");
    await nextTick();
    await menu().get('[data-row-column-action="row-height"]').trigger("click");
    await nextTick();

    wrapper.getComponent({ name: "TInputNumber" }).vm.$emit("change", 44);
    await wrapper.setProps({
      range: {
        start: { row: 7, column: 0 },
        end: { row: 7, column: 4 },
      },
    });
    await new DOMWrapper(document.body).get(".t-dialog__confirm").trigger("click");
    await nextTick();

    expect(wrapper.emitted("resize")).toEqual([[{ axis: "row", index: 2, size: 44 }]]);
    expect(document.activeElement).toBe(trigger.element);
  });
});
