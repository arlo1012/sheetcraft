import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, shallowRef } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import type { SheetPivotTable } from "@idea10/core/pivot-tables";
import { getCellValue } from "@idea10/core/workbook";
import PivotFieldsPane from "../../../modules/pivot-tables/components/PivotFieldsPane.vue";
import { createAppI18n } from "../../../shared/i18n";
import { fixture } from "./fixture";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function paneFixture(disabled = false) {
  const f = fixture();
  f.actions.open();
  f.actions.confirm(f.actions.editing.value!);
  const table = shallowRef(f.sheet.pivotTables![0]!);
  const wrapper = mount(
    defineComponent({
      setup() {
        return () =>
          h(PivotFieldsPane, {
            table: table.value,
            workbook: f.workbook,
            revision: f.execute.mock.calls.length,
            disabled,
            onUpdate: (next: SheetPivotTable) => {
              f.actions.update(next);
              table.value = f.sheet.pivotTables![0]!;
            },
          });
      },
    }),
    { attachTo: document.body, global: { plugins: [createAppI18n("en-US")] } },
  );
  mounted.push(wrapper);
  return { ...f, wrapper, table };
}
describe("pivot fields pane", () => {
  test("checkboxes automatically place text in Rows and numeric data in Values", async () => {
    const f = paneFixture();
    await f.wrapper.get('[data-pivot-source-field="0"] input[type="checkbox"]').setValue(true);
    expect(f.table.value.rowFields).toEqual([0]);
    expect(f.table.value.values).toEqual([]);
    await f.wrapper.get('[data-pivot-source-field="2"] input[type="checkbox"]').setValue(true);
    expect(f.table.value.values).toMatchObject([{ field: 2, aggregate: "sum" }]);
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(30);
    await f.wrapper.get('[data-pivot-source-field="2"] input[type="checkbox"]').setValue(false);
    expect(f.table.value.values).toEqual([]);
  });
  test("drops a filter and changes its selection through the real settings controls", async () => {
    const f = paneFixture();
    await f.wrapper.get('[data-pivot-source-field="0"] input[type="checkbox"]').setValue(true);
    await f.wrapper.get('[data-pivot-source-field="2"] input[type="checkbox"]').setValue(true);
    await f.wrapper.get('[data-pivot-source-field="1"]').trigger("dragstart");
    await f.wrapper.get('[data-pivot-area="filters"] ul').trigger("drop");
    expect(f.table.value.filters).toEqual([{ field: 1, values: [], all: true }]);
    await f.wrapper.get('[data-pivot-area="filters"] .pivot-area__label').trigger("click");
    await flushPromises();
    const settings = new DOMWrapper(document.querySelector(".pivot-field-settings")!);
    await settings.get('input[type="checkbox"]').setValue(false);
    await settings.get(".t-input__inner").trigger("keydown", { code: "ArrowDown" });
    await expect
      .poll(() =>
        [...document.querySelectorAll<HTMLElement>(".t-select-option")].map((item) =>
          item.textContent?.trim(),
        ),
      )
      .toContain("Q1");
    const option = [...document.querySelectorAll<HTMLElement>(".t-select-option")].find(
      (item) => item.textContent?.trim() === "Q1",
    )!;
    await new DOMWrapper(option).trigger("click");
    const dialog = settings.element.closest(".t-dialog")!;
    await new DOMWrapper(
      dialog.querySelector(".t-dialog__footer .t-button--theme-primary")!,
    ).trigger("click");
    await flushPromises();
    expect(f.table.value.filters).toEqual([{ field: 1, values: ["Q1"], all: false }]);
    expect(getCellValue(f.sheet, { row: 3, column: 1 })).toBe(10);
    expect(getCellValue(f.sheet, { row: 4, column: 1 })).toBe(40);
  });
  test("disables field edits and drag targets when editing is unavailable", async () => {
    const f = paneFixture(true);
    const before = f.execute.mock.calls.length;
    const checkbox = f.wrapper.get('[data-pivot-source-field="0"] input[type="checkbox"]');
    expect((checkbox.element as HTMLInputElement).disabled).toBe(true);
    await f.wrapper.get('[data-pivot-source-field="0"]').trigger("dragstart");
    await f.wrapper.get('[data-pivot-area="rows"] ul').trigger("drop");
    expect(f.execute).toHaveBeenCalledTimes(before);
    expect(f.table.value.rowFields).toEqual([]);
  });
});
