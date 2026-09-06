import { describe, expect, test } from "vitest";
import { getCellContent, setCellContent } from "@idea10/core/workbook";
import { activeCell, mountSheetGrid } from "./fixture";

describe("SheetGrid read-only mode", () => {
  test("keeps navigation while preventing keyboard cell edits and clears", async () => {
    const { wrapper, sheet } = mountSheetGrid({
      beforeMount: (currentSheet) =>
        setCellContent(currentSheet, { row: 0, column: 0 }, { kind: "literal", value: "locked" }),
    });
    await wrapper.setProps({ readOnly: true });
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("keydown", { key: "Delete" });
    await editor.trigger("keydown", { key: "x" });
    await editor.trigger("keydown", { key: "ArrowRight" });

    expect(wrapper.get('[role="grid"]').attributes("aria-readonly")).toBe("true");
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "locked",
    });
    expect(wrapper.emitted("commitCell")).toBeUndefined();
    expect(activeCell(wrapper)).toBe("B1");
    wrapper.unmount();
  });

  test("disables write actions but leaves copy available in the cell menu", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.setProps({ readOnly: true });
    await wrapper.get('[data-row="0"][data-column="0"]').trigger("contextmenu", {
      clientX: 20,
      clientY: 20,
    });
    const copy = document.querySelector<HTMLElement>('[data-cell-action="copy"]');
    const cut = document.querySelector<HTMLElement>('[data-cell-action="cut"]');
    const paste = document.querySelector<HTMLElement>('[data-cell-action="paste"]');
    const clear = document.querySelector<HTMLElement>('[data-cell-action="clear"]');
    expect(copy?.getAttribute("aria-disabled")).not.toBe("true");
    expect(cut?.getAttribute("aria-disabled")).toBe("true");
    expect(paste?.getAttribute("aria-disabled")).toBe("true");
    expect(clear?.getAttribute("aria-disabled")).toBe("true");
    wrapper.unmount();
  });
});
