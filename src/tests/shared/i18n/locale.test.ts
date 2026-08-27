import { describe, expect, test } from "vitest";
import { resolveInitialLocale } from "../../../shared/i18n";

describe("application locale resolution", () => {
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
