import { describe, expect, test } from "vitest";
import {
  CELL_FONT_FAMILY_PRESETS,
  createFontFamilyOptions,
  getFontFamilyLabel,
  resolveFontFamilyName,
} from "../../../shared/cell-text/font-catalog";

describe("font catalog", () => {
  test("offers common spreadsheet fonts with localized labels and canonical values", () => {
    expect(CELL_FONT_FAMILY_PRESETS).toEqual(
      expect.arrayContaining([
        "Microsoft YaHei",
        "SimSun",
        "SimHei",
        "KaiTi",
        "FangSong",
        "Calibri",
        "Cambria",
      ]),
    );
    expect(getFontFamilyLabel("Microsoft YaHei", "zh-CN")).toBe("微软雅黑");
    expect(getFontFamilyLabel("Microsoft YaHei", "en-US")).toBe("Microsoft YaHei");
    expect(getFontFamilyLabel("Custom Imported Font", "zh-CN")).toBe("Custom Imported Font");
    expect(createFontFamilyOptions("zh-CN")).toContainEqual({
      label: "微软雅黑",
      value: "Microsoft YaHei",
    });
  });

  test("resolves known aliases while preserving unfamiliar imported names", () => {
    expect(resolveFontFamilyName(" 微软雅黑 ")).toBe("Microsoft YaHei");
    expect(resolveFontFamilyName(" microsoft yahei ")).toBe("Microsoft YaHei");
    expect(resolveFontFamilyName(" 宋体 ")).toBe("SimSun");
    expect(resolveFontFamilyName(" aRiAl ")).toBe("Arial");
    expect(resolveFontFamilyName(" Custom Imported Font ")).toBe("Custom Imported Font");
  });

  test("deduplicates local families and aliases without rewriting custom family values", () => {
    const options = createFontFamilyOptions("zh-CN", [
      "微软雅黑",
      "microsoft yahei",
      "ARIAL",
      "Custom Imported Font",
      "custom imported font",
      "",
      "   ",
    ]);
    expect(
      options.filter((option) => resolveFontFamilyName(option.value) === "Microsoft YaHei"),
    ).toEqual([{ label: "微软雅黑", value: "微软雅黑" }]);
    expect(options.filter((option) => option.value.toLowerCase() === "arial")).toHaveLength(1);
    expect(
      options.filter((option) => option.value.toLowerCase() === "custom imported font"),
    ).toEqual([{ label: "Custom Imported Font", value: "Custom Imported Font" }]);
    expect(options.every((option) => option.value.trim().length > 0)).toBe(true);
  });

  test("preserves the exact imported spelling of a known family", () => {
    const options = createFontFamilyOptions("en-US", ["microsoft yahei", "微软雅黑"]);
    expect(
      options.filter((option) => resolveFontFamilyName(option.value) === "Microsoft YaHei"),
    ).toEqual([{ label: "Microsoft YaHei", value: "microsoft yahei" }]);
  });
});
