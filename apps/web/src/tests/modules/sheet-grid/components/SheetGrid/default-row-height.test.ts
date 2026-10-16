import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { setCellStyle, setCellValue, setRowHeight } from "@sheetcraft/core/workbook";
import { getCanvasLayout, mountSheetGrid } from "./fixture";

function rowHeight(
  wrapper: ReturnType<typeof mountSheetGrid>["wrapper"],
  row: number,
): number | undefined {
  return getCanvasLayout(wrapper).getCellRect({ row, column: 0 })?.height;
}

describe("SheetGrid automatic sheet row baseline", () => {
  test("keeps sparse short text at20, genuine text-fit expansion, and explicit24 authoritative", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.defaultRowHeight = 20;
        setCellValue(sheet, { row: 0, column: 0 }, "a");
        setCellStyle(sheet, { row: 0, column: 0 }, { fontSize: 10, wrapText: true });
        setCellValue(sheet, { row: 1, column: 0 }, "a");
        setCellStyle(sheet, { row: 1, column: 0 }, { fontSize: 20, wrapText: true });
      },
    });
    await nextTick();
    expect(rowHeight(wrapper, 0)).toBe(20);
    expect(rowHeight(wrapper, 1)).toBe(30);
    expect(rowHeight(wrapper, 2)).toBe(20);
    expect(sheet.rowHeights.size).toBe(0);

    setRowHeight(sheet, 0, 24);
    setRowHeight(sheet, 1, 24);
    await nextTick();
    expect(rowHeight(wrapper, 0)).toBe(24);
    expect(rowHeight(wrapper, 1)).toBe(24);
    expect(sheet.rowHeights).toEqual(
      new Map([
        [0, 24],
        [1, 24],
      ]),
    );

    setRowHeight(sheet, 0, 20);
    setRowHeight(sheet, 1, 20);
    await nextTick();
    expect(rowHeight(wrapper, 0)).toBe(20);
    expect(rowHeight(wrapper, 1)).toBe(30);
    expect(sheet.rowHeights.size).toBe(0);
    wrapper.unmount();
  });

  test("reconciles cached text and empty geometry when only the baseline changes", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        setCellValue(sheet, { row: 0, column: 0 }, "a");
        setCellStyle(sheet, { row: 0, column: 0 }, { fontSize: 10, wrapText: true });
      },
    });
    await nextTick();
    expect(rowHeight(wrapper, 0)).toBe(24);
    expect(rowHeight(wrapper, 1)).toBe(24);
    sheet.defaultRowHeight = 20;
    await nextTick();
    expect(rowHeight(wrapper, 0)).toBe(20);
    expect(rowHeight(wrapper, 1)).toBe(20);
    sheet.defaultRowHeight = 40;
    await nextTick();
    expect(rowHeight(wrapper, 0)).toBe(40);
    expect(rowHeight(wrapper, 1)).toBe(40);
    delete sheet.defaultRowHeight;
    await nextTick();
    expect(rowHeight(wrapper, 0)).toBe(24);
    expect(rowHeight(wrapper, 1)).toBe(24);
    expect(sheet.rowHeights.size).toBe(0);
    wrapper.unmount();
  });
});
