import { flushPromises } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { PrimaryTable } from "tdesign-vue-next/es/table";
import SheetGrid from "../../../../modules/sheet-grid/components/SheetGrid.vue";
import { deserializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetRibbon from "../../../../app/SpreadsheetRibbon.vue";
import NamedRangesDialog from "../../../../modules/formula-tools/components/NamedRangesDialog.vue";
import NamedRangeEditorDialog from "../../../../modules/formula-tools/components/NamedRangeEditorDialog.vue";
import WorkbookFormulaBar from "../../../../modules/workbook/components/WorkbookFormulaBar.vue";
import {
  createFormulaToolsStore,
  mountFormulaToolsWorkspace,
  registerFormulaToolsCleanup,
} from "./fixture";

registerFormulaToolsCleanup();

describe("SpreadsheetWorkspace defined names", () => {
  test("creates, updates, deletes, and restores named ranges through the workspace command path", async () => {
    const memory = createFormulaToolsStore();
    const wrapper = await mountFormulaToolsWorkspace(memory.store);
    const ribbon = wrapper.findComponent(SpreadsheetRibbon);
    const dialog = wrapper.findComponent(NamedRangesDialog);

    ribbon.vm.$emit("openNames");
    await flushPromises();
    expect(dialog.props("visible")).toBe(true);
    dialog.vm.$emit("save", {
      name: "Revenue",
      scopeSheetId: undefined,
      reference: "=Summary!$B$1:$C$1",
    });
    await flushPromises();
    expect(dialog.props("visible")).toBe(true);
    const created = (dialog.props("ranges") as readonly { id: string; name: string }[])[0]!;
    expect(created.name).toBe("Revenue");
    dialog.vm.$emit("save", {
      id: created.id,
      name: "Revenue",
      scopeSheetId: undefined,
      reference: "=Details!$A$1",
    });
    await flushPromises();

    expect(dialog.props("visible")).toBe(true);
    const updated = (dialog.props("ranges") as readonly { id: string; reference: string }[])[0]!;
    expect(updated.reference).toBe("=Details!$A$1");
    dialog.vm.$emit("delete", updated.id);
    await flushPromises();
    expect(dialog.props("ranges")).toEqual([]);

    dialog.vm.$emit("close");
    await flushPromises();

    const input = wrapper
      .findComponent(WorkbookFormulaBar)
      .get<HTMLTextAreaElement>("[data-formula-input]");
    await input.trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();
    expect(deserializeWorkbook(memory.record().snapshot).definedNames.size).toBe(0);
  });

  test("persists dragged name order through workspace history and storage", async () => {
    const memory = createFormulaToolsStore();
    const wrapper = await mountFormulaToolsWorkspace(memory.store);
    wrapper.findComponent(SpreadsheetRibbon).vm.$emit("openNames");
    await flushPromises();
    const manager = wrapper.getComponent(NamedRangesDialog);
    for (const name of ["Revenue", "Costs", "Profit"]) {
      manager.vm.$emit("save", { name, reference: "=Summary!$B$1" });
      await flushPromises();
    }
    const table = manager.getComponent(PrimaryTable);
    const data = table.props("data") ?? [];
    table.vm.$emit("drag-sort", {
      currentIndex: 0,
      targetIndex: 2,
      current: data[0],
      target: data[2],
      data,
      newData: [data[1], data[2], data[0]],
      sort: "row",
    });
    await flushPromises();
    const names = () => manager.props("ranges").map((row) => row.name);
    expect(names()).toEqual(["Costs", "Profit", "Revenue"]);
    manager.vm.$emit("close");
    await flushPromises();
    wrapper.findComponent(SheetGrid).vm.$emit("undo");
    await flushPromises();
    expect(names()).toEqual(["Revenue", "Costs", "Profit"]);
    wrapper.findComponent(SheetGrid).vm.$emit("redo");
    await flushPromises();
    expect(names()).toEqual(["Costs", "Profit", "Revenue"]);
    await wrapper
      .findComponent(WorkbookFormulaBar)
      .get("[data-formula-input]")
      .trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();
    expect(
      [...deserializeWorkbook(memory.record().snapshot).definedNames.values()].map(
        (name) => name.name,
      ),
    ).toEqual(["Costs", "Profit", "Revenue"]);
  });

  test("returns to the manager after saving and retains the editor when saving fails", async () => {
    const wrapper = await mountFormulaToolsWorkspace(createFormulaToolsStore().store);
    wrapper.findComponent(SpreadsheetRibbon).vm.$emit("openNames");
    await flushPromises();
    const manager = wrapper.getComponent(NamedRangesDialog);
    await manager.get("[data-name-search] input").setValue("unrelated");
    await manager.get('[data-name-action="new"]').trigger("click");
    const editor = manager.getComponent(NamedRangeEditorDialog);
    await editor.get("[data-formula-name] input").setValue("Revenue");
    await editor.get("[data-formula-reference] input").setValue("invalid");
    await editor.get("form").trigger("submit");
    await flushPromises();
    expect(manager.props("visible")).toBe(true);
    expect(manager.findComponent(NamedRangeEditorDialog).exists()).toBe(true);
    expect(editor.get<HTMLInputElement>("[data-formula-name] input").element.value).toBe("Revenue");

    await editor.get("[data-formula-reference] input").setValue("=Summary!$B$1:$C$1");
    await editor.get("form").trigger("submit");
    await flushPromises();
    expect(manager.props("visible")).toBe(true);
    expect(manager.findComponent(NamedRangeEditorDialog).exists()).toBe(false);
    expect(manager.get('[data-named-range][aria-selected="true"]').text()).toContain("Revenue");

    await manager.get('[data-name-action="edit"]').trigger("click");
    const reopenedEditor = manager.getComponent(NamedRangeEditorDialog);
    await reopenedEditor.get("[data-formula-name] input").setValue("RevenueUpdated");
    await reopenedEditor.get("form").trigger("submit");
    await flushPromises();
    expect(manager.props("visible")).toBe(true);
    expect(manager.findComponent(NamedRangeEditorDialog).exists()).toBe(false);
    expect(manager.get('[data-named-range][aria-selected="true"]').text()).toContain(
      "RevenueUpdated",
    );
  });

  test("keeps an unfinished formula-bar draft while opening and closing the name manager", async () => {
    const wrapper = await mountFormulaToolsWorkspace(createFormulaToolsStore().store);
    const ribbon = wrapper.findComponent(SpreadsheetRibbon);
    const dialog = wrapper.findComponent(NamedRangesDialog);
    const input = wrapper
      .findComponent(WorkbookFormulaBar)
      .get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.setValue("=SUM(");
    await ribbon.get('[data-ribbon-category="formulas"]').trigger("click");
    await input.trigger("blur", {
      relatedTarget: wrapper.get(".formula-toolbar").element,
    });
    ribbon.vm.$emit("openNames");
    await flushPromises();

    expect(dialog.props("visible")).toBe(true);
    expect(input.element.value).toBe("=SUM(");
    dialog.vm.$emit("close");
    await flushPromises();

    expect(dialog.props("visible")).toBe(false);
    expect(input.element.value).toBe("=SUM(");
  });
});
