import { describe, expect, test } from "vitest";
import {
  getSheetTabColorStyles,
  getSheetTabForeground,
} from "../../../../modules/workbook/sheet-tab-color";

describe("sheet tab text contrast", () => {
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

  test.each([
    ["#000000", "#FFFFFF"],
    ["#FFFFFF", "#000000"],
    ["#FACC15", "#000000"],
    ["#0000FF", "#FFFFFF"],
    ["#FF0000", "#000000"],
    ["#00FF00", "#000000"],
    ["#757575", "#FFFFFF"],
    ["#767676", "#000000"],
    ["#1a237e", "#FFFFFF"],
  ])("keeps text readable on %s", (background, foreground) => {
    expect(getSheetTabForeground(background)).toBe(foreground);
  });
});
