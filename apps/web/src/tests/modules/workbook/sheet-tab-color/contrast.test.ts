import { describe, expect, test } from "vitest";
import { getSheetTabColorStyles } from "../../../../modules/workbook/sheet-tab-color";

describe("sheet tab color styles", () => {
  test("switches mid-gray text to white when its hover background becomes darker", () => {
    expect(getSheetTabColorStyles("#767676")).toEqual({
      "--sheet-tab-color": "#767676",
      "--sheet-tab-contrast-color": "#000000",
      "--sheet-tab-hover-color": "#616161",
      "--sheet-tab-hover-contrast-color": "#FFFFFF",
    });
    expect(getSheetTabColorStyles("#FFFF00")?.["--sheet-tab-hover-color"]).toBe("#D1D100");
    expect(getSheetTabColorStyles("#FFFF00")?.["--sheet-tab-hover-contrast-color"]).toBe("#000000");
    expect(getSheetTabColorStyles()).toBeUndefined();
  });
});
