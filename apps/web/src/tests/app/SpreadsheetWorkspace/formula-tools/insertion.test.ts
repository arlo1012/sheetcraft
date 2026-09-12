import { flushPromises } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { deserializeWorkbook } from "@idea10/core/serialization";
import { getActiveSheet, getCellComputedValue, getCellContent } from "@idea10/core/workbook";
import SpreadsheetRibbon from "../../../../app/SpreadsheetRibbon.vue";
import WorkbookFormulaBar from "../../../../modules/workbook/components/WorkbookFormulaBar.vue";
import SheetGrid from "../../../../modules/sheet-grid/components/SheetGrid.vue";
import {
  createFormulaToolsStore,
  mountFormulaToolsWorkspace,
  registerFormulaToolsCleanup,
} from "./fixture";

registerFormulaToolsCleanup();

describe("SpreadsheetWorkspace formula tools insertion", () => {
  test("keeps a Home AutoSum click from committing an unfinished formula-bar draft", async () => {
    const wrapper = await mountFormulaToolsWorkspace(createFormulaToolsStore().store);
    const formula = wrapper.findComponent(WorkbookFormulaBar);
    const input = formula.get<HTMLTextAreaElement>("[data-formula-input]");
    const autoSum = wrapper.get('[data-ribbon-action="auto-sum"]');

    await input.trigger("focus");
    await input.setValue("draft");
    await input.trigger("blur", { relatedTarget: autoSum.element });
    await autoSum.trigger("click");
    await flushPromises();

    expect(input.element.value).toBe("draft");
    expect(
      getCellContent(wrapper.findComponent(SheetGrid).props("sheet"), {
        row: 0,
        column: 0,
      }),
    ).toBeNull();
  });

  test("opens the Formula tab and inserts through the shared draft without an early commit", async () => {
    const memory = createFormulaToolsStore();
    const wrapper = await mountFormulaToolsWorkspace(memory.store);
    const ribbon = wrapper.findComponent(SpreadsheetRibbon);
    const formula = wrapper.findComponent(WorkbookFormulaBar);

    await ribbon.get('[data-ribbon-category="formulas"]').trigger("click");
    expect(ribbon.get('[data-ribbon-category="formulas"]').attributes("aria-selected")).toBe(
      "true",
    );
    ribbon.vm.$emit("insertFunction", "SUM");
    await flushPromises();

    expect(formula.get<HTMLTextAreaElement>("[data-formula-input]").element.value).toBe("=SUM(");
    expect(
      getCellContent(wrapper.findComponent(SheetGrid).props("sheet"), {
        row: 0,
        column: 0,
      }),
    ).toBeNull();

    expect(
      (formula.vm as unknown as { pickReference: Function }).pickReference(
        { start: { row: 0, column: 1 }, end: { row: 0, column: 2 } },
        "start",
      ),
    ).toBe(true);
    await flushPromises();
    const input = formula.get<HTMLTextAreaElement>("[data-formula-input]");
    expect(input.element.value).toBe("=SUM(B1:C1");
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();

    const sheet = wrapper.findComponent(SheetGrid).props("sheet");
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(B1:C1)" },
    });
    expect(getCellComputedValue(sheet, { row: 0, column: 0 })).toBe(5);

    await wrapper.findComponent(SheetGrid).vm.$emit("undo");
    await flushPromises();
    expect(getCellContent(sheet, { row: 0, column: 0 })).toBeNull();

    await wrapper.findComponent(SheetGrid).vm.$emit("redo");
    await flushPromises();
    await input.trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();
    expect(
      getCellContent(getActiveSheet(deserializeWorkbook(memory.record().snapshot)), {
        row: 0,
        column: 0,
      }),
    ).toEqual({
      kind: "formula",
      formula: { source: "=SUM(B1:C1)" },
    });
  });
});
