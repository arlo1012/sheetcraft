import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { createSheet, type CellRange } from "@sheetcraft/core/workbook";
import SheetDimensionInput from "../../../../../modules/sheet-grid/components/SheetDimensionInput.vue";
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

function rootMenu() {
  return new DOMWrapper(document.body).get('ul[role="menu"]');
}

function submenu() {
  return new DOMWrapper(document.body).get(
    '#row-column-operations-submenu-v-0[role="menu"], [id^="row-column-operations-submenu-"]',
  );
}

afterEach(() => {
  for (const { wrapper, host } of mounted.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
});

describe("RowColumnOperationsMenu", () => {
  test.each([
    { baseline: undefined, expected: 24 },
    { baseline: 20, expected: 20 },
    { baseline: 24, expected: 24 },
  ])("opens unspecified row height with baseline $baseline", async ({ baseline, expected }) => {
    const sheet = createSheet("Sheet1", "sheet-1");
    sheet.defaultRowHeight = baseline;
    const wrapper = mountMenu({ sheet });
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="row-height"]').trigger("click");
    expect(wrapper.getComponent(SheetDimensionInput).props("modelValue")).toBe(expected);
    expect(sheet.rowHeights.size).toBe(0);
  });

  test("groups structural operations into screenshot-matching cascading menus", async () => {
    const wrapper = mountMenu();
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();

    expect(
      rootMenu()
        .findAll("[data-row-column-action]")
        .map((item) => item.attributes("data-row-column-action")),
    ).toEqual([
      "row-height",
      "auto-fit-row-height",
      "column-width",
      "auto-fit-column-width",
      "standard-column-width",
      "insert",
      "delete",
      "visibility",
    ]);

    await rootMenu().get('[data-row-column-action="insert"]').trigger("click");
    await nextTick();
    await submenu().get('[data-row-column-action="insert-rows-above"]').trigger("click");
    expect(wrapper.emitted("insert")).toEqual([[{ axis: "row", index: 2, count: 2 }]]);

    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="delete"]').trigger("click");
    await nextTick();
    await submenu().get('[data-row-column-action="delete-rows"]').trigger("click");
    expect(wrapper.emitted("delete")).toEqual([[{ axis: "row", index: 2, count: 2 }]]);
  });

  test("uses the selected column count for structural and visibility commands", async () => {
    const wrapper = mountMenu({
      range: {
        start: { row: 4, column: 3 },
        end: { row: 10, column: 4 },
      },
    });
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();

    await rootMenu().get('[data-row-column-action="insert"]').trigger("click");
    await nextTick();
    await submenu().get('[data-row-column-action="insert-columns-after"]').trigger("click");
    expect(wrapper.emitted("insert")).toEqual([[{ axis: "column", index: 5, count: 2 }]]);

    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="visibility"]').trigger("click");
    await nextTick();
    await submenu().get('[data-row-column-action="hide-columns"]').trigger("click");
    expect(wrapper.emitted("visibility")).toEqual([
      [{ axis: "column", index: 3, count: 2, hidden: true }],
    ]);
  });

  test("disables protected-sheet operations while retaining multi-axis dimension actions", async () => {
    const wrapper = mountMenu({ disabled: true });
    expect(wrapper.get('[data-ribbon-action="row-column-operations"]').attributes("disabled")).toBe(
      "",
    );
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    expect(document.body.querySelector('ul[role="menu"]')).toBeNull();

    await wrapper.setProps({ disabled: false });
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    expect(
      rootMenu().get('[data-row-column-action="row-height"]').attributes("aria-disabled"),
    ).toBe("false");
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
    await rootMenu().get('[data-row-column-action="row-height"]').trigger("click");
    await nextTick();

    wrapper.getComponent({ name: "TInputNumber" }).vm.$emit("change", 33);
    await wrapper.setProps({
      range: {
        start: { row: 7, column: 0 },
        end: { row: 7, column: 4 },
      },
    });
    await new DOMWrapper(document.body).get(".t-dialog__confirm").trigger("click");
    await nextTick();

    expect(wrapper.emitted("resize")).toEqual([[{ axis: "row", index: 2, count: 1, size: 44 }]]);
    expect(document.activeElement).toBe(trigger.element);
  });

  test("resizes and auto-fits every selected axis, then keeps submenu keyboard navigation", async () => {
    const wrapper = mountMenu({
      range: {
        start: { row: 2, column: 3 },
        end: { row: 3, column: 4 },
      },
    });
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="auto-fit-row-height"]').trigger("click");
    expect(wrapper.emitted("autoFit")).toEqual([
      [
        {
          axis: "row",
          range: { start: { row: 2, column: 3 }, end: { row: 3, column: 4 } },
        },
      ],
    ]);

    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="row-height"]').trigger("click");
    wrapper.getComponent({ name: "TInputNumber" }).vm.$emit("change", 33);
    await new DOMWrapper(document.body).get(".t-dialog__confirm").trigger("click");
    expect(wrapper.emitted("resize")).toEqual([[{ axis: "row", index: 2, count: 2, size: 44 }]]);

    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    const insert = rootMenu().get('[data-row-column-action="insert"]');
    await insert.trigger("keydown", { key: "ArrowRight" });
    await nextTick();
    expect(document.body.querySelector('[id^="row-column-operations-submenu-"]')).not.toBeNull();
    await submenu().trigger("keydown", { key: "ArrowLeft" });
    await nextTick();
    expect(document.activeElement).toBe(insert.element);
    expect(document.body.querySelector('[id^="row-column-operations-submenu-"]')).toBeNull();
    await insert.trigger("keydown", { key: "ArrowRight" });
    await submenu().trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(document.activeElement).toBe(insert.element);
    expect(document.body.querySelector('[id^="row-column-operations-submenu-"]')).toBeNull();
  });

  test("applies a multi-row size even when the opening row already has that size", async () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    sheet.rowHeights.set(2, 20);
    sheet.rowHeights.set(3, 50);
    const wrapper = mountMenu({ sheet });
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="row-height"]').trigger("click");
    wrapper.getComponent({ name: "TInputNumber" }).vm.$emit("change", 15);
    await new DOMWrapper(document.body).get(".t-dialog__confirm").trigger("click");

    expect(wrapper.emitted("resize")).toEqual([[{ axis: "row", index: 2, count: 2, size: 20 }]]);
  });

  test("keeps independent insert counts for every direction and confirms them by button or Enter", async () => {
    const wrapper = mountMenu({
      range: {
        start: { row: 2, column: 3 },
        end: { row: 3, column: 4 },
      },
    });
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="insert"]').trigger("click");
    await nextTick();

    const counts = [
      ["insert-rows-above", "3"],
      ["insert-rows-below", "4"],
      ["insert-columns-before", "5"],
      ["insert-columns-after", "6"],
    ] as const;
    for (const [action, count] of counts) {
      await submenu().get(`[data-axis-insert-count="${action}"] input`).setValue(count);
    }

    for (const [action, count] of counts) {
      expect(
        (submenu().get(`[data-axis-insert-count="${action}"] input`).element as HTMLInputElement)
          .value,
      ).toBe(count);
    }

    await submenu().get('[data-axis-insert-confirm="insert-columns-after"]').trigger("click");
    expect(wrapper.emitted("insert")).toEqual([[{ axis: "column", index: 5, count: 6 }]]);

    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="insert"]').trigger("click");
    await nextTick();
    const rowInput = submenu().get('[data-axis-insert-count="insert-rows-above"] input');
    await rowInput.setValue("7");
    await rowInput.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("insert")).toEqual([
      [{ axis: "column", index: 5, count: 6 }],
      [{ axis: "row", index: 2, count: 7 }],
    ]);
  });

  test("rejects invalid insert counts without trapping recovery in the submenu", async () => {
    const wrapper = mountMenu();
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="insert"]').trigger("click");
    await nextTick();

    const input = submenu().get<HTMLInputElement>(
      '[data-axis-insert-count="insert-rows-above"] input',
    );
    const confirm = submenu().get('[data-axis-insert-confirm="insert-rows-above"]');
    await input.setValue("0");
    expect(confirm.attributes("aria-disabled")).toBe("true");
    await confirm.trigger("click");
    expect(wrapper.emitted("insert")).toBeUndefined();

    await input.setValue("3");
    expect(confirm.attributes("aria-disabled")).toBe("false");
    await confirm.trigger("click");
    expect(wrapper.emitted("insert")).toEqual([[{ axis: "row", index: 2, count: 3 }]]);
  });

  test("captures a cell-operation target range and emits its selected direction", async () => {
    const openingRange: CellRange = {
      start: { row: 2, column: 3 },
      end: { row: 3, column: 4 },
    };
    const wrapper = mountMenu({ range: openingRange });
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="insert"]').trigger("click");
    await nextTick();
    await submenu().get('[data-row-column-action="insert-cells"]').trigger("click");
    await nextTick();

    await wrapper.setProps({
      range: { start: { row: 8, column: 8 }, end: { row: 8, column: 8 } },
    });
    await new DOMWrapper(document.body).get(".t-dialog__confirm").trigger("click");
    expect(wrapper.emitted("cellOperation")).toEqual([
      [{ operation: "insert", range: openingRange, direction: "down" }],
    ]);
  });

  test("emits deleting empty rows for the selected range", async () => {
    const wrapper = mountMenu();
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="delete"]').trigger("click");
    await nextTick();
    await submenu().get('[data-row-column-action="delete-empty-rows"]').trigger("click");
    expect(wrapper.emitted("deleteEmptyRows")).toEqual([[rowRange]]);
  });

  test("leaves ArrowLeft to a focused count input and closes the submenu on Escape", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get('[data-ribbon-action="row-column-operations"]');
    await trigger.trigger("click");
    await nextTick();
    const insert = rootMenu().get('[data-row-column-action="insert"]');
    await insert.trigger("click");
    await nextTick();

    const input = submenu().get<HTMLInputElement>(
      '[data-axis-insert-count="insert-rows-above"] input',
    );
    input.element.focus();
    input.element.setSelectionRange(1, 1);
    await input.trigger("keydown", { key: "ArrowLeft" });
    expect(document.activeElement).toBe(input.element);
    expect(document.body.querySelector('[id^="row-column-operations-submenu-"]')).not.toBeNull();

    await input.trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(document.activeElement).toBe(insert.element);
    expect(document.body.querySelector('[id^="row-column-operations-submenu-"]')).toBeNull();
  });
  test("uses the same unit conversions for standard width without writing on unit-only confirmation", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get('[data-ribbon-action="row-column-operations"]');
    await trigger.trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="standard-column-width"]').trigger("click");
    await nextTick();
    let field = wrapper.getComponent(SheetDimensionInput);
    expect(field.getComponent({ name: "TInputNumber" }).props("modelValue")).toBe(13);
    field.getComponent({ name: "TSelect" }).vm.$emit("change", "in");
    await nextTick();
    expect(field.getComponent({ name: "TInputNumber" }).props("modelValue")).toBe(1);
    await new DOMWrapper(document.body)
      .get('[role="dialog"][aria-label="Standard column width"] .t-dialog__confirm')
      .trigger("click");
    expect(wrapper.emitted("standardWidth")).toBeUndefined();

    await trigger.trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="standard-column-width"]').trigger("click");
    await nextTick();
    field = wrapper.getComponent(SheetDimensionInput);
    field.getComponent({ name: "TSelect" }).vm.$emit("change", "cm");
    await nextTick();
    field.getComponent({ name: "TInputNumber" }).vm.$emit("change", 5.08);
    await nextTick();
    await new DOMWrapper(document.body)
      .get('[role="dialog"][aria-label="Standard column width"] .t-dialog__confirm')
      .trigger("click");
    expect(field.props("modelValue")).toBe(192);
    expect(wrapper.emitted("standardWidth")).toEqual([[{ size: 192 }]]);
  });

  test("cancels a pending dimension edit and disables confirmation for invalid input", async () => {
    const wrapper = mountMenu();
    await wrapper.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await nextTick();
    await rootMenu().get('[data-row-column-action="row-height"]').trigger("click");
    await nextTick();
    const number = wrapper.getComponent(SheetDimensionInput).getComponent({ name: "TInputNumber" });
    number.vm.$emit("change", 9999);
    await nextTick();
    expect(
      new DOMWrapper(document.body).get(".t-dialog__confirm").attributes("disabled"),
    ).toBeDefined();
    number.vm.$emit("change", 36);
    await nextTick();
    expect(wrapper.emitted("resize")).toBeUndefined();
    await new DOMWrapper(document.body).get(".t-dialog__cancel").trigger("click");
    expect(wrapper.emitted("resize")).toBeUndefined();
  });
});
