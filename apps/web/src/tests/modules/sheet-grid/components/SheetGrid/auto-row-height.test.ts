import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import {
  DEFAULT_ROW_HEIGHT,
  setCellStyle,
  setCellValue,
  setColumnWidth,
  setRowHeight,
} from "@idea10/core/workbook";
import { mountSheetGrid } from "./fixture";

function renderedRowHeight(
  wrapper: ReturnType<typeof mountSheetGrid>["wrapper"],
  row: number,
): number {
  return Number.parseFloat(
    wrapper.get(`[data-resize-row="${row}"]`).attributes("aria-valuenow") ?? "0",
  );
}

describe("SheetGrid automatic row height", () => {
  test("reflows wrapped rows for content, column width, and font changes", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    const text = "A long sentence with enough words to wrap in the default spreadsheet column.";
    setCellValue(sheet, { row: 0, column: 0 }, text);
    setCellStyle(sheet, { row: 0, column: 0 }, { wrapText: true });
    await nextTick();
    const wrappedHeight = renderedRowHeight(wrapper, 0);
    expect(wrappedHeight).toBeGreaterThan(DEFAULT_ROW_HEIGHT);
    expect(wrapper.get('[aria-label="Row 1 height"]').attributes("aria-valuenow")).toBe(
      String(wrappedHeight),
    );

    setColumnWidth(sheet, 0, 640);
    await nextTick();
    expect(renderedRowHeight(wrapper, 0)).toBe(DEFAULT_ROW_HEIGHT);

    setColumnWidth(sheet, 0, 96);
    setCellStyle(sheet, { row: 0, column: 0 }, { wrapText: true, fontSize: 24 });
    await nextTick();
    expect(renderedRowHeight(wrapper, 0)).toBeGreaterThan(wrappedHeight);

    setCellValue(sheet, { row: 0, column: 0 }, "short");
    await nextTick();
    expect(renderedRowHeight(wrapper, 0)).toBeGreaterThanOrEqual(DEFAULT_ROW_HEIGHT);

    setCellStyle(sheet, { row: 0, column: 0 }, { fontSize: 24 });
    await nextTick();
    expect(renderedRowHeight(wrapper, 0)).toBe(DEFAULT_ROW_HEIGHT);
  });

  test("keeps manual row height authoritative until it is reset", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "wrapped ".repeat(20));
    setCellStyle(sheet, { row: 0, column: 0 }, { wrapText: true });
    await nextTick();
    const automaticHeight = renderedRowHeight(wrapper, 0);
    expect(automaticHeight).toBeGreaterThan(DEFAULT_ROW_HEIGHT);

    setRowHeight(sheet, 0, 20);
    await nextTick();
    expect(renderedRowHeight(wrapper, 0)).toBe(20);

    setRowHeight(sheet, 0, DEFAULT_ROW_HEIGHT);
    await nextTick();
    expect(renderedRowHeight(wrapper, 0)).toBe(automaticHeight);
  });

  test("keeps row geometry stable until a wrapped edit is committed", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellStyle(sheet, { row: 0, column: 0 }, { wrapText: true });
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");

    await editor.trigger("keydown", { key: "F2" });
    await editor.setValue("A long wrapped draft that changes row geometry before it is committed.");

    expect(renderedRowHeight(wrapper, 0)).toBe(DEFAULT_ROW_HEIGHT);
    expect(editor.attributes("wrap")).toBe("soft");
    expect(editor.attributes("aria-keyshortcuts")).toBe("Alt+Enter Control+F2 F2 F4");
    expect(session.history.undoStack).toHaveLength(0);

    await editor.trigger("keydown", { key: "Enter" });
    expect(renderedRowHeight(wrapper, 0)).toBeGreaterThan(DEFAULT_ROW_HEIGHT);
    expect(session.history.undoStack).toHaveLength(1);
  });
});
