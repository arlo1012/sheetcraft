import { describe, expect, test } from "vitest";
import { getCellValue } from "@idea10/core/workbook";
import { mountSheetGrid, triggerCell } from "./fixture";

describe("protected sheet editing", () => {
  test("edits unlocked and allowed-range cells while preventing locked-cell keyboard edits", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.properties.protected = true;
        sheet.cells.set("0:0", { style: { unlocked: true } });
        sheet.protection = {
          editableRanges: [
            { name: "Input", range: { start: { row: 0, column: 2 }, end: { row: 0, column: 2 } } },
          ],
        };
      },
    });
    await wrapper.setProps({ readOnly: true });
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("keydown", { key: "4" });
    await editor.setValue("42");
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe(42);
    await triggerCell(wrapper, { row: 0, column: 1 }, "mousedown", { button: 0 });
    await editor.trigger("keydown", { key: "F2" });
    expect(editor.classes()).not.toContain("is-editing");
    await triggerCell(wrapper, { row: 0, column: 2 }, "mousedown", { button: 0 });
    await editor.trigger("keydown", { key: "F2" });
    expect(editor.classes()).toContain("is-editing");
    await editor.setValue("Allowed");
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 0, column: 2 })).toBe("Allowed");
    wrapper.unmount();
  });
});
