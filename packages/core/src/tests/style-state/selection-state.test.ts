import { describe, expect, test } from "vitest";
import { createTestWorkbook } from "../helpers.js";
import { getSelectionBorderState, getSelectionCellStyleState } from "../../style-state.js";
import { getActiveSheet, setCellStyle } from "../../workbook.js";

describe("selection cell style state", () => {
  test("reports effective alignment defaults and newly supported alignment values", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    const defaultState = getSelectionCellStyleState(sheet, {
      start: { row: 0, column: 0 },
      end: { row: 0, column: 0 },
    });
    expect(defaultState.horizontalAlign).toEqual({ value: "general", mixed: false });
    expect(defaultState.verticalAlign).toEqual({ value: "bottom", mixed: false });
    expect(defaultState.indent).toEqual({ value: 0, mixed: false });
    expect(defaultState.shrinkToFit).toBe("off");
    expect(defaultState.textDirection).toEqual({ value: "context", mixed: false });
    expect(defaultState.textRotation).toEqual({ value: 0, mixed: false });

    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        horizontalAlign: "centerContinuous",
        verticalAlign: "distributed",
        indent: 2,
        shrinkToFit: true,
        textDirection: "rtl",
        textRotation: "vertical",
      },
    );
    const styled = getSelectionCellStyleState(sheet, {
      start: { row: 0, column: 0 },
      end: { row: 0, column: 0 },
    });
    expect(styled.horizontalAlign).toEqual({ value: "centerContinuous", mixed: false });
    expect(styled.verticalAlign).toEqual({ value: "distributed", mixed: false });
    expect(styled.indent).toEqual({ value: 2, mixed: false });
    expect(styled.shrinkToFit).toBe("on");
    expect(styled.textDirection).toEqual({ value: "rtl", mixed: false });
    expect(styled.textRotation).toEqual({ value: "vertical", mixed: false });
  });

  test("reports uniform, off, and mixed properties without scanning empty cells", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        bold: true,
        textColor: "#112233",
        verticalAlign: "top",
        wrapText: true,
        numberFormat: { kind: "number", fractionDigits: 2 },
      },
    );
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      {
        bold: true,
        textColor: "#112233",
        verticalAlign: "top",
        wrapText: true,
        numberFormat: { kind: "number", fractionDigits: 2 },
      },
    );

    const uniform = getSelectionCellStyleState(sheet, {
      start: { row: 0, column: 0 },
      end: { row: 0, column: 1 },
    });
    expect(uniform.bold).toBe("on");
    expect(uniform.italic).toBe("off");
    expect(uniform.textColor).toEqual({ value: "#112233", mixed: false });
    expect(uniform.verticalAlign).toEqual({ value: "top", mixed: false });
    expect(uniform.wrapText).toBe("on");
    expect(uniform.numberFormat).toEqual({
      value: { kind: "number", fractionDigits: 2 },
      mixed: false,
    });

    const withBlank = getSelectionCellStyleState(sheet, {
      start: { row: 0, column: 0 },
      end: { row: 0, column: 2 },
    });
    expect(withBlank.bold).toBe("mixed");
    expect(withBlank.textColor.mixed).toBe(true);
    expect(withBlank.verticalAlign).toEqual({ value: "top", mixed: true });
    expect(withBlank.wrapText).toBe("mixed");
    expect(withBlank.numberFormat.mixed).toBe(true);
  });

  test("queries a small selection directly when the sheet contains many other cells", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellStyle(sheet, { row: 1, column: 1 }, { bold: true });
    for (let row = 10; row < 30; row += 1) {
      setCellStyle(sheet, { row, column: 5 }, { italic: true });
    }

    const state = getSelectionCellStyleState(sheet, {
      start: { row: 1, column: 1 },
      end: { row: 1, column: 1 },
    });

    expect(state.bold).toBe("on");
    expect(state.italic).toBe("off");
  });

  test("summarizes visible outer, inner, and diagonal borders", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    const border = { style: "dashDot" as const, color: "#112233" };
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderTop: border,
        borderLeft: border,
        borderRight: border,
        borderBottom: border,
        borderDiagonalUp: border,
      },
    );
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      {
        borderTop: border,
        borderRight: border,
        borderBottom: border,
        borderDiagonalUp: border,
        borderDiagonalDown: { style: "double", color: "#445566" },
      },
    );
    const state = getSelectionBorderState(sheet, {
      start: { row: 0, column: 0 },
      end: { row: 0, column: 1 },
    });

    expect(state.top).toEqual({ value: border, mixed: false });
    expect(state.innerVertical).toEqual({ value: border, mixed: false });
    expect(state.diagonalUp).toEqual({ value: border, mixed: false });
    expect(state.diagonalDown).toEqual({ value: undefined, mixed: true });
  });

  test("reads a merged range's perimeter from its anchor without internal edges", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    const border = { style: "medium" as const, color: "#112233" };
    sheet.mergedCells.push({
      start: { row: 1, column: 1 },
      end: { row: 2, column: 2 },
    });
    setCellStyle(
      sheet,
      { row: 1, column: 1 },
      {
        borderTop: border,
        borderRight: border,
        borderBottom: border,
        borderLeft: border,
        borderDiagonalUp: border,
      },
    );

    const state = getSelectionBorderState(sheet, {
      start: { row: 1, column: 1 },
      end: { row: 2, column: 2 },
    });
    expect(state.top).toEqual({ value: border, mixed: false });
    expect(state.right).toEqual({ value: border, mixed: false });
    expect(state.bottom).toEqual({ value: border, mixed: false });
    expect(state.left).toEqual({ value: border, mixed: false });
    expect(state.innerHorizontal).toEqual({ value: undefined, mixed: false });
    expect(state.innerVertical).toEqual({ value: undefined, mixed: false });
    expect(state.diagonalUp).toEqual({ value: border, mixed: false });
  });
});
