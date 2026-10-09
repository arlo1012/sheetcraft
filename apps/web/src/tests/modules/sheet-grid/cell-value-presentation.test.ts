import { describe, expect, test } from "vitest";
import { formatCellNumberValue } from "@sheetcraft/core/number-format";
import {
  formatCellValueForGrid,
  getCellValuePresentationForGrid,
} from "../../../modules/sheet-grid/cell-value-presentation";

describe("cell value presentation", () => {
  test("uses the shared formatter for stored numeric formats", () => {
    const style = { numberFormat: { kind: "number" as const, fractionDigits: 2 } };
    expect(getCellValuePresentationForGrid(1234.5, style, "en-US", "1900")).toEqual(
      formatCellNumberValue(1234.5, style.numberFormat, { locale: "en-US", dateSystem: "1900" }),
    );
  });

  test("forwards the workbook date system and format color without mutating the style", () => {
    const dateStyle = { numberFormat: { kind: "date" as const, code: "yyyy-mm-dd" } };
    const from1900 = getCellValuePresentationForGrid(0, dateStyle, "en-US", "1900");
    const from1904 = getCellValuePresentationForGrid(0, dateStyle, "en-US", "1904");
    expect(from1904).toEqual(
      formatCellNumberValue(0, dateStyle.numberFormat, { locale: "en-US", dateSystem: "1904" }),
    );
    expect(from1904.text).not.toBe(from1900.text);

    const colorStyle = { numberFormat: { kind: "custom" as const, code: "[Red]0" } };
    expect(getCellValuePresentationForGrid(12, colorStyle, "en-US", "1900").color).toBeTruthy();
    expect(colorStyle).toEqual({ numberFormat: { kind: "custom", code: "[Red]0" } });

    expect(
      getCellValuePresentationForGrid(
        -123,
        { numberFormat: { kind: "custom", code: "0;*x0;*y0;*@" } },
        "en-US",
        "1900",
      ).fill,
    ).toEqual({ before: "", after: "123", character: "x" });
  });

  test("preserves General and text display semantics", () => {
    expect(formatCellValueForGrid(12.5, undefined, "zh-CN")).toBe("12.5");
    expect(formatCellValueForGrid("0012", { numberFormat: { kind: "text" } }, "en-US")).toBe(
      "0012",
    );
  });
});
