import { describe, expect, test } from "vitest";
import { getCellValue, setCellValue } from "@sheetcraft/core/workbook";
import { mountSheetGrid } from "./fixture";

type GridSaveContract = {
  flushPendingEdit: () => boolean;
  hasPendingEdit: () => boolean;
};

function getSaveContract(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]): GridSaveContract {
  return wrapper.vm as unknown as GridSaveContract;
}

describe("SheetGrid save contract", () => {
  test("flushes an unconfirmed edit without changing the selected cell", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    const saveContract = getSaveContract(wrapper);

    await editor.trigger("keydown", { key: "d" });
    await editor.setValue("Draft");

    expect(saveContract.hasPendingEdit()).toBe(true);
    expect(saveContract.flushPendingEdit()).toBe(true);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("Draft");
    expect(wrapper.get("[data-cell-editor]").attributes("data-cell-editor")).toBe("A1");
    expect(session.history.undoStack).toHaveLength(1);
    expect(saveContract.hasPendingEdit()).toBe(false);
  });

  test("rejects an IME composition and flushes it after composition ends", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    const saveContract = getSaveContract(wrapper);

    await editor.trigger("compositionstart");
    await editor.setValue("中文");

    expect(saveContract.flushPendingEdit()).toBe(false);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
    expect(editor.element.value).toBe("中文");

    await editor.trigger("compositionend", { data: "中文" });
    expect(saveContract.flushPendingEdit()).toBe(true);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("中文");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("does not emit an edit command for an unchanged editor", async () => {
    const { session, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        setCellValue(sheet, { row: 0, column: 0 }, "Existing");
      },
    });
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    const saveContract = getSaveContract(wrapper);

    await editor.trigger("keydown", { key: "F2" });

    expect(saveContract.hasPendingEdit()).toBe(true);
    expect(saveContract.flushPendingEdit()).toBe(true);
    expect(session.history.undoStack).toHaveLength(0);
    expect(saveContract.hasPendingEdit()).toBe(false);
  });

  test("flushes a replacement edit that clears an existing cell", async () => {
    const { session, sheet, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        setCellValue(sheet, { row: 0, column: 0 }, "Existing");
      },
    });
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    const saveContract = getSaveContract(wrapper);

    await editor.trigger("keydown", { key: "x" });
    await editor.setValue("");
    expect(saveContract.flushPendingEdit()).toBe(true);

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("does not create history when a replacement returns to the existing value", async () => {
    const { session, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        setCellValue(sheet, { row: 0, column: 0 }, "Existing");
      },
    });
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    const saveContract = getSaveContract(wrapper);

    await editor.trigger("keydown", { key: "x" });
    await editor.setValue("Existing");
    expect(saveContract.flushPendingEdit()).toBe(true);

    expect(session.history.undoStack).toHaveLength(0);
  });
});
