import { flushPromises } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { deserializeWorkbook } from "@idea10/core/serialization";
import SpreadsheetRibbon from "../../../../app/SpreadsheetRibbon.vue";
import NamedRangesDialog from "../../../../modules/formula-tools/components/NamedRangesDialog.vue";
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
    expect(dialog.props("visible")).toBe(false);

    ribbon.vm.$emit("openNames");
    await flushPromises();
    const created = (dialog.props("ranges") as readonly { id: string; name: string }[])[0]!;
    expect(created.name).toBe("Revenue");
    dialog.vm.$emit("save", {
      id: created.id,
      name: "Revenue",
      scopeSheetId: undefined,
      reference: "=Details!$A$1",
    });
    await flushPromises();

    ribbon.vm.$emit("openNames");
    await flushPromises();
    const updated = (dialog.props("ranges") as readonly { id: string; reference: string }[])[0]!;
    expect(updated.reference).toBe("=Details!$A$1");
    dialog.vm.$emit("delete", updated.id);
    await flushPromises();
    expect(dialog.props("ranges")).toEqual([]);

    const input = wrapper
      .findComponent(WorkbookFormulaBar)
      .get<HTMLTextAreaElement>("[data-formula-input]");
    await input.trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();
    expect(deserializeWorkbook(memory.record().snapshot).definedNames.size).toBe(0);
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
