import { afterEach, describe, expect, test, vi } from "vitest";
import { getPivotReportColors } from "../../../modules/pivot-tables/pivot-report-colors";

afterEach(() => {
  document.documentElement.style.removeProperty("--idea-palette-brand-2");
  document.documentElement.style.removeProperty("--idea-palette-brand-3");
  vi.unstubAllGlobals();
});

describe("pivot report product colors", () => {
  test("resolves concrete product colors with surrounding whitespace", () => {
    document.documentElement.style.setProperty("--idea-palette-brand-2", " #DCE6F1 ");
    document.documentElement.style.setProperty("--idea-palette-brand-3", " #8db4e2 ");
    expect(getPivotReportColors()).toEqual({ fillColor: "#DCE6F1", borderColor: "#8db4e2" });
  });
  test("omits invalid or unresolved tokens independently", () => {
    document.documentElement.style.setProperty("--idea-palette-brand-2", "var(--missing)");
    document.documentElement.style.setProperty("--idea-palette-brand-3", "#123456");
    expect(getPivotReportColors()).toEqual({ borderColor: "#123456" });
    document.documentElement.style.setProperty("--idea-palette-brand-3", "#fff");
    expect(getPivotReportColors()).toEqual({});
  });
  test("supports environments without DOM style resolution", () => {
    vi.stubGlobal("getComputedStyle", undefined);
    expect(getPivotReportColors()).toEqual({});
  });
});
