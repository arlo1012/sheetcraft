import { describe, expect, test } from "vitest";
import { formatCellNumberValue, toCellNumberFormatCode } from "@sheetcraft/core/number-format";
import { normalizeCellNumberFormat } from "@sheetcraft/core/style";
import {
  getCurrencyChoiceValue,
  getCurrencySymbolOptions,
} from "../../../../modules/cell-format/number-format/currency-options";

describe("currency symbol options", () => {
  test("pins common symbols and localizes the language and region labels", () => {
    const chinese = getCurrencySymbolOptions("zh-CN", "无", { currency: "CNY" });
    const english = getCurrencySymbolOptions("en-US", "None", { currency: "USD" });
    expect(chinese.slice(0, 5).map(({ label }) => label)).toEqual(["无", "¥", "€", "$", "US$"]);
    expect(english[0]?.label).toBe("None");
    expect(chinese.find(({ choice }) => choice.locale === "en-CA")?.label).toBe("$ 英语（加拿大）");
    expect(english.find(({ choice }) => choice.locale === "en-CA")?.label).toBe(
      "$ English (Canada)",
    );
    expect(chinese.find(({ choice }) => choice.locale === "quz-EC")?.label).toContain("克丘亚语");
    expect(chinese.find(({ choice }) => choice.locale === "chr-Cher-US")?.label).toContain(
      "切罗基",
    );
    expect(chinese.find(({ choice }) => choice.locale === "iu-Cans-CA")?.label).toContain("因纽特");
  });

  test("every offered regional option is distinct, saveable, and renders its selected symbol", () => {
    const options = getCurrencySymbolOptions("en-US", "None", { currency: "USD" });
    expect(new Set(options.map(({ value }) => value)).size).toBe(options.length);
    for (const option of options) {
      const format = normalizeCellNumberFormat({
        kind: "currency",
        ...option.choice,
        fractionDigits: 2,
      });
      const preview = formatCellNumberValue(1234.5, format);
      expect(preview.text, option.label).not.toContain("####");
      if (option.choice.currency) expect(preview.text, option.label).toContain(option.symbol);
      if (option.choice.locale)
        expect(toCellNumberFormatCode(format), option.label).toMatch(/\[\$.*-[0-9A-F]+\]/);
    }
  });

  test("retains an existing symbol outside the catalog without changing its formatting metadata", () => {
    const current = { currency: "USD", currencySymbol: "USD$", locale: "en-US" };
    const options = getCurrencySymbolOptions("en-US", "None", current);
    const option = options.find(({ value }) => value === getCurrencyChoiceValue(current));
    expect(option?.symbol).toBe("USD$");
    expect(option?.choice).toEqual(current);
  });
});
