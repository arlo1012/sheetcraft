import { flushPromises } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { getCellContent } from "@sheetcraft/core/workbook";
import FormulaEditorDialog from "../../../../modules/formula-tools/components/FormulaEditorDialog.vue";
import SheetGrid from "../../../../modules/sheet-grid/components/SheetGrid.vue";
import WorkbookFormulaBar from "../../../../modules/workbook/components/WorkbookFormulaBar.vue";
import {
  createFormulaToolsStore,
  mountFormulaToolsWorkspace,
  registerFormulaToolsCleanup,
} from "./fixture";

registerFormulaToolsCleanup();

describe("SpreadsheetWorkspace formula editor", () => {
  test("hands an unfinished formula-bar draft to fx without committing it on blur", async () => {
    const memory = createFormulaToolsStore();
    const wrapper = await mountFormulaToolsWorkspace(memory.store);
    const formulaBar = wrapper.getComponent(WorkbookFormulaBar);
    const input = formulaBar.get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.setValue("=SUM(");
    formulaBar.vm.$emit("openFormulaEditor");
    await flushPromises();

    const editor = wrapper.getComponent(FormulaEditorDialog);
    expect(editor.props("visible")).toBe(true);
    expect(editor.props("value")).toBe("=SUM(");
    expect(memory.store.save).not.toHaveBeenCalled();
    expect(
      getCellContent(wrapper.getComponent(SheetGrid).props("sheet"), {
        row: 0,
        column: 0,
      }),
    ).toBeNull();
  });

  test("commits the editor confirmation once and can undo it", async () => {
    const wrapper = await mountFormulaToolsWorkspace(createFormulaToolsStore().store);
    const formulaBar = wrapper.getComponent(WorkbookFormulaBar);

    formulaBar.vm.$emit("openFormulaEditor");
    await flushPromises();
    const editor = wrapper.getComponent(FormulaEditorDialog);
    editor.vm.$emit("change", "=SUM(B1:C1)");
    await flushPromises();
    editor.vm.$emit("confirm");
    await flushPromises();

    const grid = wrapper.getComponent(SheetGrid);
    expect(getCellContent(grid.props("sheet"), { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(B1:C1)" },
    });

    grid.vm.$emit("undo");
    await flushPromises();
    expect(getCellContent(grid.props("sheet"), { row: 0, column: 0 })).toBeNull();
  });

  test("closes the editor without committing its changed draft", async () => {
    const memory = createFormulaToolsStore();
    const wrapper = await mountFormulaToolsWorkspace(memory.store);
    const formulaBar = wrapper.getComponent(WorkbookFormulaBar);

    formulaBar.vm.$emit("openFormulaEditor");
    await flushPromises();
    const editor = wrapper.getComponent(FormulaEditorDialog);
    editor.vm.$emit("change", "=SUM(B1:C1)");
    await flushPromises();
    editor.vm.$emit("close");
    await flushPromises();

    expect(editor.props("visible")).toBe(false);
    expect(memory.store.save).not.toHaveBeenCalled();
    expect(
      getCellContent(wrapper.getComponent(SheetGrid).props("sheet"), {
        row: 0,
        column: 0,
      }),
    ).toBeNull();
  });
});
