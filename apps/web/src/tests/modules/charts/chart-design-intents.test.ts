import { describe, expect, test, vi } from "vitest";
import { normalizeSheetChart, type SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  applyChartDesignIntent,
  changeChartType,
  getChartVariant,
  getChartStyleRecipe,
  matchesChartStyle,
  normalizeChartInsertIntent,
  type ChartDesignIntent,
  type ChartStyleId,
  type ChartVariant,
  type CommonChartType,
} from "../../../modules/charts/chart-design-intents";

function chart(type: SheetChart["type"] = "column"): SheetChart {
  return normalizeSheetChart({
    type,
    range: null,
    title: "Original",
    headerRow: true,
    headerColumn: true,
    seriesBy: "rows",
    legend: true,
    labels: true,
    stacked: false,
    showHidden: true,
    source: {
      kind: "series",
      categories: { kind: "generated" },
      series: [
        {
          id: "active",
          colorIndex: 5,
          name: { kind: "literal", text: "Sales" },
          values: { kind: "literal", values: [10, 20] },
        },
      ],
    },
    elements: {
      titlePosition: "overlay",
      legendPosition: "right",
      legendOverlay: false,
      labelPosition: "outsideEnd",
    },
    format: {
      title: {
        fontFamily: "Existing custom font",
        fontSize: 22,
        bold: false,
        italic: true,
        color: "#123456",
      },
      plot: { fill: "#abcdef", stroke: "#123456", strokeWidth: 3 },
      categoryAxis: {
        title: "Category",
        reverse: true,
        show: false,
        labelAngle: -30,
        text: { fontFamily: "Existing custom font" },
      },
      valueAxis: {
        title: "Amount",
        min: -10,
        max: 100,
        majorUnit: 10,
        minorUnit: 2,
        reverse: true,
        linkedToSource: false,
        numberFormat: { kind: "custom", code: "0.00" },
        line: { stroke: "#123456" },
      },
      secondaryValueAxis: {
        title: "Secondary",
        min: 0,
        max: 200,
        majorUnit: 20,
        numberFormat: { kind: "percent", fractionDigits: 1 },
      },
      bar: { gapWidth: 30, overlap: -10 },
      series: [
        {
          id: "active",
          axis: "secondary",
          color: "#123456",
          smooth: true,
          strokeWidth: 4,
          markers: false,
        },
        { id: "dormant", color: "#654321", markers: true, axis: "primary" },
      ],
    },
  });
}
const common: CommonChartType[] = ["column", "bar", "area"];
const lineVariants: ChartVariant[] = [
  "standard",
  "stacked",
  "percentStacked",
  "standardMarkers",
  "stackedMarkers",
  "percentStackedMarkers",
];
const styles: ChartStyleId[] = [
  "colorful",
  "office",
  "forest",
  "warm",
  "cool",
  "monochrome",
  "dark",
  "minimal",
];
describe("strict pure chart design intents", () => {
  test.each(common)(
    "%s standard, stacked and percentage choices preserve chart source and formatting",
    (type) => {
      const original = chart(type),
        before = structuredClone(original);
      for (const variant of ["standard", "stacked", "percentStacked"] as const) {
        const result = applyChartDesignIntent(original, { kind: "variant", variant });
        expect(getChartVariant(result)).toBe(variant);
        expect(result.stacked).toBe(variant !== "standard");
        expect(result.presentation?.percentStacked).toBe(
          variant === "percentStacked" ? true : undefined,
        );
        expect(result.format).toEqual(before.format);
        expect(result.source).toEqual(before.source);
        expect(result.elements).toEqual(before.elements);
        expect(result.title).toBe("Original");
      }
      expect(original).toEqual(before);
    },
  );
  test.each(lineVariants)(
    "line %s changes global markers and clears only defined series marker overrides",
    (variant) => {
      const original = chart("line"),
        before = structuredClone(original);
      const result = applyChartDesignIntent(original, { kind: "variant", variant });
      expect(getChartVariant(result)).toBe(variant);
      expect(result.presentation?.lineMarkers).toBe(variant.endsWith("Markers"));
      expect(result.format?.series).toEqual([
        { id: "active", axis: "secondary", color: "#123456", smooth: true, strokeWidth: 4 },
        { id: "dormant", axis: "primary", color: "#654321", markers: true },
      ]);
      expect(result.source).toEqual(before.source);
      expect(original).toEqual(before);
    },
  );
  test("existing omitted line marker setting is on; standard exits percent without losing appearance", () => {
    const existing = chart("line");
    delete existing.format!.series![0]!.markers;
    expect(getChartVariant(existing)).toBe("standardMarkers");
    const styled = applyChartDesignIntent(chart("line"), { kind: "style", style: "dark" });
    const percent = applyChartDesignIntent(styled, {
      kind: "variant",
      variant: "percentStackedMarkers",
    });
    const result = applyChartDesignIntent(percent, { kind: "variant", variant: "standard" });
    expect(result.presentation).toEqual({ ...styled.presentation, lineMarkers: false });
    expect(result.stacked).toBe(false);
  });
  test.each(styles)("owned %s recipe stores real appearance without a preset ID", (style) => {
    const original = chart("line"),
      before = structuredClone(original);
    const result = applyChartDesignIntent(original, { kind: "style", style });
    const recipe = getChartStyleRecipe(style);
    expect(result.presentation).toEqual({ palette: recipe.palette, background: recipe.background });
    expect(Object.values(result)).not.toContain(style);
    expect(matchesChartStyle(result, style)).toBe(true);
    expect(result.format?.title?.fontFamily).toBe(before.format?.title?.fontFamily);
    expect(result.format?.categoryAxis).toMatchObject({
      title: "Category",
      reverse: true,
      show: false,
      labelAngle: -30,
    });
    expect(result.format?.valueAxis).toMatchObject({
      title: "Amount",
      min: -10,
      max: 100,
      majorUnit: 10,
      minorUnit: 2,
      reverse: true,
      linkedToSource: false,
      numberFormat: { kind: "custom", code: "0.00" },
    });
    expect(result.format?.secondaryValueAxis).toMatchObject({
      title: "Secondary",
      min: 0,
      max: 200,
      majorUnit: 20,
      numberFormat: { kind: "percent", fractionDigits: 1 },
    });
    expect(result.format?.bar).toEqual(before.format?.bar);
    expect(result.format?.series).toEqual([
      { id: "active", axis: "secondary", smooth: true, strokeWidth: 4, markers: false },
      { id: "dormant", axis: "primary", color: "#654321", markers: true },
    ]);
    expect({ ...result, format: before.format, presentation: undefined }).toEqual({
      ...before,
      presentation: undefined,
    });
    expect(original).toEqual(before);
    result.source!.series[0]!.values = { kind: "literal", values: [99] };
    expect(original).toEqual(before);
    expect(recipe.palette.every((color) => /^#[\da-f]{6}$/.test(color))).toBe(true);
  });
  test("line selection uses all defined effective markers, including hidden sources, and ignores dormant formats", () => {
    const original = chart("line");
    expect(getChartVariant(original)).toBe("standard");
    original.source!.series.push({
      id: "hidden-defined",
      colorIndex: 2,
      name: { kind: "literal", text: "Hidden" },
      values: { kind: "range", sheetId: "sheet", range: null },
    });
    original.showHidden = false;
    expect(getChartVariant(original)).toBeUndefined();
    original.presentation = { lineMarkers: false };
    expect(getChartVariant(original)).toBe("standard");
    original.format!.series!.push({ id: "hidden-defined", markers: true });
    expect(getChartVariant(original)).toBeUndefined();
    original.format!.series![0]!.markers = true;
    expect(getChartVariant(original)).toBe("standardMarkers");
    delete original.source;
    expect(getChartVariant(original)).toBe("standard");
  });
  test("selection is based on controlled appearance, not a name or partial palette match", () => {
    const result = applyChartDesignIntent(chart(), { kind: "style", style: "office" });
    result.format!.valueAxis!.min = -20;
    expect(matchesChartStyle(result, "office")).toBe(true);
    result.format!.series![0]!.color = "#123456";
    expect(matchesChartStyle(result, "office")).toBe(false);
    delete result.format!.series![0]!.color;
    result.format!.title!.fontSize = 19;
    expect(matchesChartStyle(result, "office")).toBe(false);
    expect(matchesChartStyle(chart(), "office")).toBe(false);
  });
  test("type changes retire inapplicable percentage and marker fields but retain palette and background", () => {
    const styled = applyChartDesignIntent(chart("line"), { kind: "style", style: "forest" });
    const percent = applyChartDesignIntent(styled, {
      kind: "variant",
      variant: "percentStackedMarkers",
    });
    expect(changeChartType(percent, "column").presentation).toEqual({
      ...styled.presentation,
      percentStacked: true,
    });
    expect(changeChartType(percent, "radar").presentation).toEqual(styled.presentation);
    expect(() => changeChartType(percent, "pie")).toThrow(); // Existing live-source applicability gate remains authoritative.
  });
  test("rectangle, cache and PivotTable style changes retain their data ownership", () => {
    const original = chart();
    delete original.source;
    for (const data of [
      { range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } } },
      { range: null, pivotTableId: "pivot" },
      {
        range: null,
        dataCache: { categories: ["A"], series: [{ name: "S", values: [1] }], records: [["A", 1]] },
      },
    ]) {
      const next = normalizeSheetChart({ ...original, ...data });
      const result = applyChartDesignIntent(next, { kind: "style", style: "minimal" });
      expect(result.range).toEqual(next.range);
      expect(result.pivotTableId).toBe(next.pivotTableId);
      expect(result.dataCache).toEqual(next.dataCache);
      expect(result.format?.series).toEqual(next.format?.series);
    }
  });
  test.each([
    { kind: "variant", variant: "unknown" },
    { kind: "style", style: "Layout5" },
    { kind: "style", style: "__proto__" },
    { kind: "variant", variant: "standardMarkers" },
    { kind: "style", style: "office", extra: true },
    { kind: "unknown", style: "office" },
    { kind: "style" },
    null,
    [],
  ])("rejects malformed or inapplicable intent %# without mutation", (intent) => {
    const original = chart(),
      before = structuredClone(original);
    expect(() => applyChartDesignIntent(original, intent as ChartDesignIntent)).toThrow();
    expect(original).toEqual(before);
  });
  test("rejects accessor, inherited and symbol intent fields without calling getters", () => {
    const getter = vi.fn(() => "style");
    const accessor = Object.defineProperty({ style: "office" }, "kind", { get: getter });
    expect(() => applyChartDesignIntent(chart(), accessor as ChartDesignIntent)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      applyChartDesignIntent(
        chart(),
        Object.create({ kind: "style", style: "office" }) as ChartDesignIntent,
      ),
    ).toThrow();
    expect(() =>
      applyChartDesignIntent(chart(), {
        kind: "style",
        style: "office",
        [Symbol()]: true,
      } as ChartDesignIntent),
    ).toThrow();
  });
  test("insertion accepts legacy string entries and strict detached typed variants", () => {
    expect(normalizeChartInsertIntent("line")).toBe("line");
    expect(normalizeChartInsertIntent("dashboard")).toBe("dashboard");
    const input = { type: "line", variant: "percentStackedMarkers" };
    expect(normalizeChartInsertIntent(input)).toEqual(input);
    expect(normalizeChartInsertIntent(input)).not.toBe(input);
    const getter = vi.fn(() => "line");
    expect(() =>
      normalizeChartInsertIntent(
        Object.defineProperty({ variant: "standard" }, "type", { get: getter }),
      ),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
    for (const invalid of [
      "unknown",
      { type: "pie", variant: "standard" },
      { type: "bar", variant: "stackedMarkers" },
      { type: "line", variant: "standard", extra: true },
      { type: "line" },
      Object.create({ type: "line", variant: "standard" }),
    ])
      expect(() => normalizeChartInsertIntent(invalid)).toThrow();
  });
});

test("type and style changes retain independent semantic-axis title styles and angles", () => {
  const original = chart();
  original.format = {
    categoryAxis: { title: "Regions", titleText: {}, titleRotation: 0 },
    valueAxis: {
      title: "Revenue",
      titleText: { fontSize: 40 / 3, bold: true },
      titleRotation: -90,
    },
  };
  const converted = changeChartType(original, "bar");
  expect(converted.format).toEqual(original.format);
  const styled = applyChartDesignIntent(converted, { kind: "style", style: "dark" });
  expect(styled.format?.categoryAxis?.titleText).toEqual({});
  expect(styled.format?.categoryAxis?.titleRotation).toBe(0);
  expect(styled.format?.valueAxis?.titleText).toEqual(original.format.valueAxis?.titleText);
  expect(styled.format?.valueAxis?.titleRotation).toBe(-90);
});
