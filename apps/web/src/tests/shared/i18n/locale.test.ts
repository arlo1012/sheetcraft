import { cellTextFontRevision } from "../../../shared/cell-text/text-metrics";
import { describe, expect, test } from "vitest";
import { createAppI18n, resolveInitialLocale } from "../../../shared/i18n";

describe("application locale resolution", () => {
  test("language changes invalidate native font metrics without repeating identical initialization", () => {
    const previous = document.documentElement.lang;
    const revision = cellTextFontRevision.value;
    try {
      document.documentElement.lang = "en-US";
      createAppI18n("zh-CN");
      expect(document.documentElement.lang).toBe("zh-CN");
      expect(cellTextFontRevision.value).toBe(revision + 1);
      createAppI18n("zh-CN");
      expect(cellTextFontRevision.value).toBe(revision + 1);
      createAppI18n("en-US");
      expect(cellTextFontRevision.value).toBe(revision + 2);
    } finally {
      document.documentElement.lang = previous;
    }
  });
  test("prefers a supported stored locale over browser languages", () => {
    expect(resolveInitialLocale({ storedLocale: "zh-CN", browserLocales: ["en-US"] })).toBe(
      "zh-CN",
    );
  });

  test("maps the first supported browser language when storage is invalid", () => {
    expect(
      resolveInitialLocale({ storedLocale: "invalid", browserLocales: ["fr-FR", "zh-Hans"] }),
    ).toBe("zh-CN");
  });

  test("falls back to English when no configured locale matches", () => {
    expect(resolveInitialLocale({ storedLocale: null, browserLocales: ["fr-FR"] })).toBe("en-US");
  });
});
