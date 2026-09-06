import { describe, expect, test } from "vitest";
import { formatStatusBarNumber } from "../../../modules/workbook/status-bar-number-format";

describe("formatStatusBarNumber", () => {
  test("uses the selected grouping mode", () => {
    expect(formatStatusBarNumber(123_456_789.6, "en-US", "chinese-unit")).toBe("1亿2345万6789.6");
    expect(formatStatusBarNumber(12_345.6, "en-US", "thousands")).toBe("12,345.6");
    expect(formatStatusBarNumber(123_456_789.6, "en-US", "ten-thousands")).toBe("1,2345,6789.6");
    expect(formatStatusBarNumber(12_345.6, "en-US", "none")).toBe("12345.6");
  });

  test("retains small values and normalizes negative zero", () => {
    expect(formatStatusBarNumber(-0, "en-US", "chinese-unit")).toBe("0");
    expect(formatStatusBarNumber(-12_345.6, "en-US", "chinese-unit")).toBe("-1万2345.6");
    expect(formatStatusBarNumber(Number.POSITIVE_INFINITY, "en-US", "chinese-unit")).toBe("∞");
    expect(formatStatusBarNumber(Number.NaN, "en-US", "ten-thousands")).toBe("NaN");
  });
});
