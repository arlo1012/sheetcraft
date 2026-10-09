import { flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { getCellContent } from "@sheetcraft/core/workbook";
import WorkbookFormulaBar from "../../../../modules/workbook/components/WorkbookFormulaBar.vue";
import WorkbookStatusBar from "../../../../modules/workbook/components/WorkbookStatusBar.vue";
import SheetGrid from "../../../../modules/sheet-grid/components/SheetGrid.vue";
import SpreadsheetRibbon from "../../../../app/SpreadsheetRibbon.vue";
import {
  createFormulaToolsStore,
  mountFormulaToolsWorkspace,
  registerFormulaToolsCleanup,
} from "./fixture";

registerFormulaToolsCleanup();

describe("SpreadsheetWorkspace cross-sheet formula authoring", () => {
  test("keeps an unfinished formula-bar draft when recalculating", async () => {
    const wrapper = await mountFormulaToolsWorkspace(createFormulaToolsStore().store);
    const formula = wrapper.findComponent(WorkbookFormulaBar);
    const ribbon = wrapper.findComponent(SpreadsheetRibbon);
    const input = formula.get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.setValue("=SUM(");
    await ribbon.get('[data-ribbon-category="formulas"]').trigger("click");
    await input.trigger("blur", {
      relatedTarget: wrapper.get(".formula-toolbar").element,
    });
    ribbon.vm.$emit("recalculate");
    await flushPromises();

    expect(input.element.value).toBe("=SUM(");
    expect(
      getCellContent(wrapper.findComponent(SheetGrid).props("sheet"), {
        row: 0,
        column: 0,
      }),
    ).toBeNull();
  });

  test("keeps the formula target while picking on another sheet, then returns to it on Enter", async () => {
    const wrapper = await mountFormulaToolsWorkspace(createFormulaToolsStore().store);
    const formula = wrapper.findComponent(WorkbookFormulaBar);
    const input = formula.get<HTMLTextAreaElement>("[data-formula-input]");

    input.element.focus();
    await nextTick();
    await input.setValue("=SUM(");
    wrapper.findComponent(WorkbookStatusBar).vm.$emit("select", "details");
    await flushPromises();

    expect(wrapper.findComponent(SheetGrid).props("sheet").id).toBe("details");
    expect(input.element.value).toBe("=SUM(");
    expect(document.activeElement).toBe(input.element);
    expect(
      (formula.vm as unknown as { pickReference: Function }).pickReference(
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        "start",
      ),
    ).toBe(true);
    await flushPromises();
    expect(input.element.value).toBe("=SUM(Details!A1");

    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    const summary = wrapper.findComponent(SheetGrid).props("sheet");
    expect(summary.name).toBe("Summary");
    expect(getCellContent(summary, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(Details!A1)" },
    });
    expect(
      (
        wrapper.findComponent(SheetGrid).props("evaluator") as {
          getComputedValue(address: { row: number; column: number }): unknown;
        }
      ).getComputedValue({ row: 0, column: 0 }),
    ).toBe(11);
  });

  test("returns to the original formula target on Escape without writing a cross-sheet draft", async () => {
    const wrapper = await mountFormulaToolsWorkspace(createFormulaToolsStore().store);
    const formula = wrapper.findComponent(WorkbookFormulaBar);
    const input = formula.get<HTMLTextAreaElement>("[data-formula-input]");

    input.element.focus();
    await nextTick();
    await input.setValue("=Details!A1");
    wrapper.findComponent(WorkbookStatusBar).vm.$emit("select", "details");
    await flushPromises();
    await input.trigger("keydown", { key: "Escape" });
    await flushPromises();

    const summary = wrapper.findComponent(SheetGrid).props("sheet");
    expect(summary.name).toBe("Summary");
    expect(getCellContent(summary, { row: 0, column: 0 })).toBeNull();
  });
});
