import { describe, expect, test } from "vitest";
import { getDateFormatRegionOptions } from "../../../../modules/cell-format/number-format/region-options";

describe("date format regions", () => {
  test("offers distinct localized choices for major language and region variants", () => {
    const options = getDateFormatRegionOptions("zh-CN", "zh-CN");
    expect(options.length).toBeGreaterThan(200);
    expect(new Set(options.map(({ value }) => value)).size).toBe(options.length);
    expect(options).toEqual(
      expect.arrayContaining([
        { value: "en-GB", label: "英语（英国）" },
        { value: "de-DE", label: "德语（德国）" },
        { value: "fr-CA", label: "法语（加拿大）" },
        { value: "ja-JP", label: "日语（日本）" },
      ]),
    );
    expect(options.some(({ value }) => value === "zh-TW")).toBe(true);
    expect(options.some(({ value }) => value === "zh-HK")).toBe(true);
    expect(options.some(({ value }) => value === "ko-KR")).toBe(true);
    expect(options.some(({ value }) => value === "ar-SA")).toBe(true);
  });

  test("translates region labels without changing their stored values", () => {
    const english = getDateFormatRegionOptions("en-US", "de-DE");
    expect(english).toContainEqual({ value: "de-DE", label: "German (Germany)" });
    expect(english.map(({ value }) => value).sort()).toEqual(
      getDateFormatRegionOptions("zh-CN", "de-DE")
        .map(({ value }) => value)
        .sort(),
    );
  });

  test("keeps a document's existing locale when it is outside the available catalog", () => {
    const options = getDateFormatRegionOptions("en-US", "en-XX");
    expect(options.filter(({ value }) => value === "en-XX")).toHaveLength(1);
    expect(options.find(({ value }) => value === "en-XX")?.label).toBeTruthy();
  });
});
