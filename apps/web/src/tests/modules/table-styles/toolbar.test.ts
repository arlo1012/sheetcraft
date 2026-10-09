import { mount } from "@vue/test-utils";
import { expect, test } from "vitest";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import type { SheetTable } from "@sheetcraft/core/workbook";
import TableToolsToolbar from "../../../modules/table-styles/components/TableToolsToolbar.vue";
import { createAppI18n } from "../../../shared/i18n";

test("synchronizes the table name, selected style and protected controls", async () => {
  const table: SheetTable = {
    id: "sales",
    name: "Table1",
    range: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
    columns: [
      { id: "region", name: "Region" },
      { id: "amount", name: "Amount" },
    ],
    style: createBuiltinTableStyles()[4]!,
    headerRow: true,
    totalRow: false,
    firstColumn: false,
    lastColumn: false,
    bandedRows: true,
    bandedColumns: false,
    filterButton: true,
    filter: null,
  };
  const wrapper = mount(TableToolsToolbar, {
    props: { table, customStyles: [], customPivotStyles: [] },
    global: { plugins: [createAppI18n("en-US")] },
  });
  expect(wrapper.findAll("[data-table-style-id]")).toHaveLength(6);
  expect(wrapper.get(`[data-table-style-id="${table.style.id}"]`).attributes("aria-pressed")).toBe(
    "true",
  );
  const input = wrapper.get("[data-table-name] input");
  await input.setValue("Cancelled");
  await input.trigger("keydown", { key: "Escape" });
  expect((input.element as HTMLInputElement).value).toBe("Table1");
  expect(wrapper.emitted("rename")).toBeUndefined();
  await input.setValue("Sales");
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  input.element.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(true);
  expect(wrapper.emitted("rename")).toEqual([["Sales"]]);
  expect(wrapper.get("[data-ribbon-tools]").attributes("data-cell-edit-session")).toBeUndefined();
  await wrapper.setProps({ table: { ...table, name: "Sales", headerRow: false } });
  expect((input.element as HTMLInputElement).value).toBe("Sales");
  expect(wrapper.get('[data-table-option="filterButton"] input').attributes("disabled")).toBe("");
  await wrapper.setProps({ disabled: true });
  for (const control of wrapper.findAll('button, input, [role="button"]')) {
    if (control.element.matches('span[role="button"]'))
      expect(control.attributes("aria-disabled")).toBe("true");
    else expect(control.attributes("disabled")).toBe("");
  }
  await wrapper.get("[data-table-style-id]").trigger("click");
  expect(wrapper.emitted("applyStyle")).toBeUndefined();
  wrapper.unmount();
});
