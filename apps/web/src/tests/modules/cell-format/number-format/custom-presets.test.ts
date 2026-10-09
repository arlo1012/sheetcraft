import { validateCellNumberFormatCode } from "@sheetcraft/core/number-format";
import { describe, expect, test } from "vitest";
import { getCustomFormatPresets } from "../../../../modules/cell-format/number-format/custom-presets";

describe("custom number-format presets", () => {
  test("offers complete editable numeric starting points", () => {
    const presets = getCustomFormatPresets("en-US");

    expect(presets).toEqual(
      expect.arrayContaining([
        "General",
        "0.000",
        "#,##0.000",
        "#,##0;[Red]-#,##0",
        "#,##0;(#,##0)",
        '#,##0;[Red]-#,##0;"-"',
        '0.00;[Red](0.00);"-";@',
        "0.00%",
        "0.00E+00",
        "@",
      ]),
    );
    expect(presets.every(validateCellNumberFormatCode)).toBe(true);
  });

  test("uses regional date codes and accepts typed catalog codes without duplication", () => {
    const presets = getCustomFormatPresets("zh-CN", [
      "h:mm:ss",
      "# ?/?",
      "[DBNum1][$-804]General",
      "h:mm:ss",
    ]);

    expect(presets).toEqual(
      expect.arrayContaining([
        '[$-804][DBNum1]yyyy"年"m"月"d"日"',
        "h:mm:ss",
        "# ?/?",
        "[DBNum1][$-804]General",
      ]),
    );
    expect(presets.filter((code) => code === "h:mm:ss")).toHaveLength(1);
  });

  test("starts currency and accounting formats from the region's common currency", () => {
    expect(getCustomFormatPresets("zh-CN")).toEqual(
      expect.arrayContaining(["[$¥-804]#,##0", "[$¥-804]#,##0.00"]),
    );
    expect(getCustomFormatPresets("en-US")).toEqual(
      expect.arrayContaining(["[$$-409]#,##0", "[$$-409]#,##0.00"]),
    );
    expect(getCustomFormatPresets("fr-FR")).toEqual(
      expect.arrayContaining(["[$€-407]#,##0", "[$€-407]#,##0.00"]),
    );
  });
});
