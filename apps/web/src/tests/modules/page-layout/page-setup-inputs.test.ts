import { describe, expect, test } from "vitest";
import {
  parsePageSetupRange,
  parsePageSetupTitle,
  formatPickedPageSetupReference,
} from "../../../modules/page-layout/page-setup-inputs";
describe("page setup references", () => {
  test("normalizes local cell and repeated axis ranges", () => {
    expect(parsePageSetupRange("$D$50:$A$1")).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 49, column: 3 },
    });
    expect(parsePageSetupTitle("$3:$1", "row")).toEqual({ start: 0, end: 2 });
    expect(parsePageSetupTitle("$C:$A", "column")).toEqual({ start: 0, end: 2 });
    expect(parsePageSetupTitle("A2:D4", "row")).toEqual({ start: 1, end: 3 });
    expect(
      formatPickedPageSetupReference(
        { start: { row: 1, column: 0 }, end: { row: 3, column: 4 } },
        "titleColumns",
      ),
    ).toBe("$A:$E");
  });
  test("rejects invalid, qualified, union and out-of-sheet ranges", () => {
    for (const input of ["Sheet1!A1:D4", "A1:B2,D1:E2", "A0:A2", "XFE1"]) {
      expect(parsePageSetupRange(input)).toBeUndefined();
    }
    expect(parsePageSetupTitle("0:3", "row")).toBeUndefined();
    expect(parsePageSetupTitle("1:1048577", "row")).toBeUndefined();
    expect(parsePageSetupTitle("XFD:XFE", "column")).toBeUndefined();
    expect(parsePageSetupTitle("", "row")).toBeNull();
  });
});
