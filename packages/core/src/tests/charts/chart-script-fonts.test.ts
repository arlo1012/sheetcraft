import { describe, expect, test } from "vitest";
import {
  normalizeChartFormat,
  resolveChartScriptFont,
  type ChartTextFormat,
} from "../../chart-format.js";
import {
  cloneWorkbookTheme,
  DEFAULT_WORKBOOK_THEME,
  normalizeWorkbookTheme,
} from "../../workbook-theme.js";

const format: ChartTextFormat = {
  scriptFonts: {
    latin: { kind: "theme", role: "minor", slot: "latin" },
    eastAsia: { kind: "theme", role: "minor", slot: "eastAsia" },
    complexScript: { kind: "theme", role: "minor", slot: "complexScript" },
  },
};

describe("strict per-script font contract", () => {
  test("resolves live Inter/宋体/empty CS without flattening retained bindings", () => {
    const theme = cloneWorkbookTheme(DEFAULT_WORKBOOK_THEME);
    const before = structuredClone(format);
    expect(resolveChartScriptFont(format, "latin", theme)).toEqual({
      kind: "family",
      family: "Inter",
    });
    expect(resolveChartScriptFont(format, "eastAsia", theme)).toEqual({
      kind: "family",
      family: "宋体",
    });
    expect(resolveChartScriptFont(format, "complexScript", theme)).toEqual({ kind: "unresolved" });
    theme.fonts.bodyComplexScript = "";
    expect(resolveChartScriptFont(format, "complexScript", theme)).toEqual({ kind: "automatic" });
    theme.fonts.bodyComplexScript = "Amiri";
    theme.bodyFont = "Arial";
    expect(resolveChartScriptFont(format, "complexScript", theme)).toEqual({
      kind: "family",
      family: "Amiri",
    });
    expect(resolveChartScriptFont(format, "latin", theme)).toEqual({
      kind: "family",
      family: "Arial",
    });
    expect(format).toEqual(before);
    expect(resolveChartScriptFont({}, "latin", theme)).toEqual({ kind: "inherit" });
    expect(
      resolveChartScriptFont({ scriptFonts: { latin: { kind: "automatic" } } }, "latin", theme),
    ).toEqual({ kind: "automatic" });
    expect(resolveChartScriptFont({ fontFamily: "Fixed" }, "complexScript", theme)).toEqual({
      kind: "family",
      family: "Fixed",
    });
  });
  test("normalization detaches choices and preserves missing versus explicitly empty theme slots", () => {
    const normalized = normalizeChartFormat({ title: format });
    expect(normalized.title).toEqual(format);
    expect(normalized.title!.scriptFonts!.latin).not.toBe(format.scriptFonts!.latin);
    const theme = cloneWorkbookTheme(DEFAULT_WORKBOOK_THEME);
    expect(Object.hasOwn(theme.fonts, "bodyComplexScript")).toBe(false);
    theme.fonts.bodyComplexScript = "";
    expect(cloneWorkbookTheme(theme).fonts.bodyComplexScript).toBe("");
    expect(Object.hasOwn(cloneWorkbookTheme(theme).fonts, "headingComplexScript")).toBe(false);
  });
  test("rejects every malformed slot and conflicting shortcut without accessor reads", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("read");
      },
    };
    for (const scriptFonts of [
      {},
      undefined,
      null,
      [],
      { unknown: { kind: "automatic" } },
      { latin: undefined },
      { latin: null },
      { latin: { kind: "other" } },
      { latin: { kind: "family", family: "" } },
      { latin: { kind: "family", family: "x".repeat(257) } },
      { latin: { kind: "automatic", family: "Arial" } },
      { latin: { kind: "theme", role: "body", slot: "latin" } },
      { latin: { kind: "theme", role: "minor", slot: "eastAsia" } },
      { latin: Object.defineProperty({}, "kind", getter) },
      Object.defineProperty({}, "latin", getter),
      Object.create({ latin: { kind: "automatic" } }),
      { [Symbol("slot")]: { kind: "automatic" } },
    ])
      expect(() => normalizeChartFormat({ title: { scriptFonts } })).toThrow();
    expect(() => normalizeChartFormat({ title: { ...format, fontFamily: "Arial" } })).toThrow(
      /exclusive/,
    );
    for (const value of [undefined, null, 1, " ", "x".repeat(257)]) {
      const theme = cloneWorkbookTheme(DEFAULT_WORKBOOK_THEME);
      Object.assign(theme.fonts, { bodyComplexScript: value });
      expect(() => normalizeWorkbookTheme(theme)).toThrow();
    }
    const theme = cloneWorkbookTheme(DEFAULT_WORKBOOK_THEME);
    Object.defineProperty(theme.fonts, "bodyComplexScript", getter);
    expect(() => normalizeWorkbookTheme(theme)).toThrow();
    expect(reads).toBe(0);
  });
});
