import { describe, expect, test, vi } from "vitest";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  chartFormatTargetKey,
  chartFormatTargetLabelKeys,
  commitChartFormatNumberDraft,
  createChartFormatDraft,
  editChartFormatDraft,
  getChartFormatCapabilities,
  getChartFormatIntentSettings,
  getChartFormatSeries,
  getChartFormatTargets,
  isChartValueAxisDraftValid,
  parseChartFormatNumber,
  setChartFormatField,
  syncChartFormatDraft,
} from "../../../modules/charts/chart-format-pane";

function chart(changes: Partial<SheetChart> = {}): SheetChart {
  return {
    type: "column",
    title: "Sales",
    range: null,
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
    source: {
      kind: "series",
      categories: { kind: "generated" },
      series: [
        {
          id: "apples",
          colorIndex: 0,
          name: { kind: "literal", text: "Apples" },
          values: { kind: "literal", values: [10, 20] },
        },
        {
          id: "pears",
          colorIndex: 1,
          name: { kind: "literal", text: "Pears" },
          values: { kind: "literal", values: [30, 40] },
        },
      ],
    },
    ...changes,
  };
}
const data: ChartData = {
  categories: ["East", "North"],
  records: [],
  series: [
    { id: "apples", name: "Same name", values: [10, 20] },
    { id: "pears", name: "Same name", values: [30, 40] },
  ],
};

describe("chart format applicability and stable target identity", () => {
  test("series retain stable IDs after reorder and duplicate names", () => {
    const reordered = { ...data, series: [...data.series].reverse() };
    expect(getChartFormatSeries(chart(), reordered).map((entry) => entry.id)).toEqual([
      "pears",
      "apples",
    ]);
    expect(getChartFormatTargets(chart(), reordered).slice(-2).map(chartFormatTargetKey)).toEqual([
      "series:pears",
      "series:apples",
    ]);
    expect(
      getChartFormatSeries(chart(), {
        ...data,
        series: [{ id: "foreign", name: "Same name", values: [1] }],
      }),
    ).toEqual([]);
  });
  test("rectangle, cache and pivot do not synthesize editable series identity", () => {
    for (const source of [
      chart({ source: undefined }),
      chart({ source: undefined, pivotTableId: "pivot" }),
      chart({ source: undefined, dataCache: data }),
    ]) {
      const targets = getChartFormatTargets(source, data).map(chartFormatTargetKey);
      expect(targets).toContain("title");
      expect(targets).toContain("plot");
      expect(targets).toContain("valueAxis");
      expect(targets.some((key) => key.startsWith("series:"))).toBe(false);
    }
  });
  test("secondary axis requires an applicable visible live source series", () => {
    const secondary = chart({
      format: {
        series: [
          { id: "apples", axis: "secondary" },
          { id: "dormant", axis: "secondary" },
        ],
      },
    });
    expect(getChartFormatTargets(secondary, data).map(chartFormatTargetKey)).toContain(
      "secondaryValueAxis",
    );
    expect(
      getChartFormatTargets(secondary, { ...data, series: [data.series[1]!] }).map(
        chartFormatTargetKey,
      ),
    ).not.toContain("secondaryValueAxis");
    expect(
      getChartFormatTargets({ ...secondary, type: "radar" }, data).map(chartFormatTargetKey),
    ).not.toContain("secondaryValueAxis");
    expect(getChartFormatCapabilities({ ...secondary, type: "radar" }, data)).toMatchObject({
      seriesAxis: false,
      seriesStroke: true,
      seriesSmooth: false,
      seriesMarkers: true,
    });
  });
  test("no source data and no visible title offer no fake element targets", () => {
    expect(
      getChartFormatTargets(
        chart({
          title: "",
          source: { kind: "series", categories: { kind: "generated" }, series: [] },
        }),
        { categories: [], series: [], records: [] },
      ),
    ).toEqual([{ kind: "chart" }]);
    expect(
      getChartFormatTargets(chart({ elements: { titlePosition: "none" } }), data).some(
        (target) => target.kind === "title",
      ),
    ).toBe(false);
    expect(
      getChartFormatCapabilities(chart({ type: "scatter", source: undefined }), data),
    ).toMatchObject({ categoryAxis: false, valueAxis: true, bar: false, series: false });
    expect(
      getChartFormatCapabilities(chart({ type: "wordCloud", source: undefined }), data),
    ).toMatchObject({ categoryAxis: false, valueAxis: false, plot: false, title: true });
  });
});

describe("complete numeric drafts", () => {
  test.each(["-", "1e", "1e+", "Infinity", "NaN", "0x10", "12px", "1,000", "1e999"])(
    "%s is retained as an invalid complete draft",
    (text) => {
      const draft = createChartFormatDraft();
      editChartFormatDraft(draft, text);
      const apply = vi.fn(() => true);
      expect(commitChartFormatNumberDraft(draft, "min", apply)).toBe(false);
      expect(draft).toMatchObject({ text, dirty: true, error: "number" });
      expect(apply).not.toHaveBeenCalled();
    },
  );
  test.each([
    ["-1.2e+3", -1200],
    [".5", 0.5],
    ["", undefined],
    ["  ", undefined],
    ["-0", 0],
  ] as const)("parses %s without confusing auto and zero", (text, value) => {
    expect(parseChartFormatNumber(text, "min")).toEqual({ valid: true, value });
  });
  test.each([
    ["fontSize", "0"],
    ["fontSize", "257"],
    ["strokeWidth", "33"],
    ["labelAngle", "91"],
    ["gapWidth", "501"],
    ["overlap", "-101"],
    ["majorUnit", "0"],
    ["minorUnit", "-1"],
  ] as const)("enforces %s range", (field, value) => {
    expect(parseChartFormatNumber(value, field)).toEqual({ valid: false });
  });
  test("Enter then blur accepts exactly one edit; false apply retains the full draft", () => {
    const draft = createChartFormatDraft(10);
    editChartFormatDraft(draft, "2e1");
    const reject = vi.fn(() => false);
    expect(commitChartFormatNumberDraft(draft, "min", reject)).toBe(false);
    expect(draft).toMatchObject({ text: "2e1", dirty: true, error: "rejected" });
    syncChartFormatDraft(draft, 15);
    expect(draft.text).toBe("2e1");
    const accept = vi.fn(() => true);
    expect(commitChartFormatNumberDraft(draft, "min", accept)).toBe(true);
    expect(commitChartFormatNumberDraft(draft, "min", accept)).toBe(true);
    expect(accept).toHaveBeenCalledTimes(1);
    expect(accept).toHaveBeenCalledWith(20);
  });
  test("composition and cross-field validation never commit partial values", () => {
    const draft = createChartFormatDraft();
    editChartFormatDraft(draft, "20");
    draft.composing = true;
    const apply = vi.fn(() => true);
    expect(commitChartFormatNumberDraft(draft, "min", apply)).toBe(false);
    expect(draft.error).toBe("composition");
    draft.composing = false;
    expect(
      commitChartFormatNumberDraft(draft, "min", apply, (min) =>
        isChartValueAxisDraftValid({ min, max: 10 }),
      ),
    ).toBe(false);
    expect(draft.error).toBe("bounds");
    expect(apply).not.toHaveBeenCalled();
  });
  test("units must divide evenly and not exceed 100 minor splits", () => {
    expect(isChartValueAxisDraftValid({ min: 20, max: 180, majorUnit: 40, minorUnit: 8 })).toBe(
      true,
    );
    for (const axis of [
      { min: 20, max: 20 },
      { majorUnit: 40, minorUnit: 6 },
      { majorUnit: 40, minorUnit: 50 },
      { majorUnit: 40, minorUnit: 0.01 },
    ])
      expect(isChartValueAxisDraftValid(axis)).toBe(false);
  });
});

describe("sparse branch replacement", () => {
  test("automatic reset removes only the explicit field", () => {
    expect(setChartFormatField({ min: 20, reverse: true }, "min", undefined)).toEqual({
      reverse: true,
    });
    expect(setChartFormatField({ min: 20 }, "min", undefined)).toBeUndefined();
  });
  test("global bar layout remains chart-wide when a series is selected", () => {
    const current = { bar: { gapWidth: 50 }, series: [{ id: "apples", color: "#00FF00" }] };
    const result = getChartFormatIntentSettings(current, {
      kind: "chart",
      format: { gapWidth: 50, overlap: 50 },
    });
    expect(result).toEqual({ bar: { gapWidth: 50, overlap: 50 }, series: current.series });
    expect(current).toEqual({
      bar: { gapWidth: 50 },
      series: [{ id: "apples", color: "#00FF00" }],
    });
  });
  test("series edits preserve source order, dormant IDs, other branches and input", () => {
    const current = {
      title: { fontSize: 18 },
      series: [
        { id: "dormant", axis: "secondary" as const },
        { id: "pears", color: "#FF0000" },
      ],
    };
    const result = getChartFormatIntentSettings(current, {
      kind: "series",
      seriesId: "pears",
      format: { color: "#0000FF", markers: false },
    });
    expect(result?.series).toEqual([
      { id: "dormant", axis: "secondary" },
      { id: "pears", color: "#0000FF", markers: false },
    ]);
    expect(current.series[1]?.color).toBe("#FF0000");
    expect(
      getChartFormatIntentSettings(result, { kind: "series", seriesId: "pears", format: undefined })
        ?.series,
    ).toEqual([{ id: "dormant", axis: "secondary" }]);
    expect(
      getChartFormatIntentSettings(
        { valueAxis: { min: 20 } },
        { kind: "valueAxis", format: undefined },
      ),
    ).toBeUndefined();
  });
});

test("legend is a visible supported data-bearing target with a stable key", () => {
  expect(getChartFormatTargets(chart(), data).map(chartFormatTargetKey)).toContain("legend");
  for (const type of ["treemap", "sankey", "wordCloud"] as const)
    expect(getChartFormatTargets(chart({ type }), data).map(chartFormatTargetKey)).not.toContain(
      "legend",
    );
  expect(
    getChartFormatTargets(chart({ legend: false }), data).map(chartFormatTargetKey),
  ).not.toContain("legend");
});

test("Ribbon and pane share exhaustive, distinct labels for every non-series target", () => {
  expect(chartFormatTargetLabelKeys).toEqual({
    chart: "chart.formatChartArea",
    title: "chart.title",
    legend: "chart.legend",
    plot: "chart.formatPlotArea",
    categoryAxis: "chart.formatCategoryAxis",
    valueAxis: "chart.formatValueAxis",
    secondaryValueAxis: "chart.formatSecondaryValueAxis",
  });
  const targets = getChartFormatTargets(chart(), data);
  expect(targets[2]?.kind).toBe("legend");
  expect(
    targets
      .filter((target) => target.kind !== "series")
      .map((target) => chartFormatTargetLabelKeys[target.kind]),
  ).toContain("chart.legend");
});
