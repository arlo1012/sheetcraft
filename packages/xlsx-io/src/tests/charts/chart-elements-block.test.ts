import { describe, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { ChartElementSettings } from "@sheetcraft/core/sheet-charts";
import { encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { unsupportedNativeChartElements } from "../../chart-capabilities.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

describe("chart element leaf export safety gate", () => {
  test.each([
    ["titlePosition", "none"],
    ["legendPosition", "diagonal"],
    ["legendOverlay", "true"],
    ["labelPosition", "outsideEnd"],
    ["dataTable", "withLegendKeys"],
    ["labelContent", "seriesAndValue"],
    ["labelScope", "lastCategory"],
  ] as const)("blocks unsupported %s before resources without mutation", async (key, value) => {
    const f = nativeColumnFixture();
    f.drawing.chart.elements = { [key]: value } as ChartElementSettings;
    // Invalid enum values cannot be serialized by Core; freeze the raw data instead.
    const before = JSON.stringify(f.drawing.chart),
      images = vi.fn(() => []);
    await expect(
      encodeXlsx(f.workbook, {
        get images() {
          return images();
        },
      }),
    ).rejects.toMatchObject({
      name: "XlsxCompatibilityError",
      report: {
        issues: [
          {
            code: "feature-omitted",
            severity: "block",
            count: 1,
            locations: [`Data.drawings["column-chart"].chart.elements.${key}`],
          },
        ],
      },
    });
    expect(images).not.toHaveBeenCalled();
    expect(JSON.stringify(f.drawing.chart)).toEqual(before);
  });

  test.each([
    { legend: false, elements: { legendPosition: "bottom" } },
    { legend: false, elements: { legendPosition: "left" } },
    { legend: false, elements: { legendOverlay: false } },
    { legend: false, elements: { legendOverlay: true } },
    { labels: false, elements: { labelPosition: "center" } },
    { labels: false, elements: { labelPosition: "outsideEnd" } },
    { type: "line", labels: true, elements: { labelPosition: "center" } },
    { type: "line", labels: true, elements: { labelPosition: "insideEnd" } },
    { title: "", elements: { titlePosition: "overlay" } },
    { title: "", elements: { titlePosition: "above" } },
  ] as const)("does not silently discard dormant choices %j", async (patch) => {
    const f = nativeColumnFixture();
    Object.assign(f.drawing.chart, patch);
    const before = serializeWorkbook(f.workbook);
    await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test.each([
    "elements",
    "titlePosition",
    "legendPosition",
    "legendOverlay",
    "labelPosition",
    "dataTable",
    "labelContent",
    "labelScope",
  ])("blocks the %s accessor without invoking it", async (field) => {
    const f = nativeColumnFixture(),
      getter = vi.fn(() => {
        throw Error("unexpected read");
      });
    if (field === "elements") Object.defineProperty(f.drawing.chart, field, { get: getter });
    else {
      f.drawing.chart.elements = {};
      Object.defineProperty(f.drawing.chart.elements, field, { get: getter });
    }
    await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
    expect(getter).not.toHaveBeenCalled();
  });

  test.each([
    null,
    [],
    undefined,
    { unknown: true },
    { [Symbol("hidden")]: true },
    Object.create({ legendPosition: "left" }),
  ])("rejects malformed settings records %#", async (elements) => {
    const f = nativeColumnFixture();
    Object.defineProperty(f.drawing.chart, "elements", { value: elements });
    await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });

  test.each(["pie", "pivot", "cache"])(
    "does not admit other chart ownership or family: %s",
    (kind) => {
      const f = nativeColumnFixture();
      f.drawing.chart.elements = {};
      if (kind === "pie") f.drawing.chart.type = "pie";
      if (kind === "pivot") f.drawing.chart.pivotTableId = "pivot";
      if (kind === "cache")
        Object.defineProperty(f.drawing.chart, "dataCache", { value: undefined });
      expect(unsupportedNativeChartElements(f.drawing.chart)).toEqual(["elements"]);
    },
  );
});
