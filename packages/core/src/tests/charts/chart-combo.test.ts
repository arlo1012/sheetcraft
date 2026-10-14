import { describe, expect, test, vi } from "vitest";
import {
  MAX_CHART_COMBO_SERIES_CHANGES,
  normalizeChartComboSeriesChanges,
  planChartColumnLineCombo,
  readChartComboFeature,
  resolveChartComboSeriesSettings,
  type ChartComboSeriesChange,
} from "../../chart-combo.js";
import { normalizeSheetChart } from "../../sheet-charts.js";
import { normalizeSheetDrawing } from "../../sheet-drawings.js";
import { elementChart, elementDrawing } from "./chart-elements-fixture.js";
import { sourceDrawing } from "./chart-source-fixture.js";

const column: ChartComboSeriesChange = {
  rangeBand: { seriesBy: "columns", index: 1 },
  drawType: "column",
  axis: "primary",
  markers: false,
};
const line: ChartComboSeriesChange = {
  rangeBand: { seriesBy: "columns", index: 2 },
  drawType: "line",
  axis: "secondary",
  markers: true,
};

describe("bounded column–line combo source and routing", () => {
  test("default-only choices do not allocate IDs; nondefaults are one detached planned chart", () => {
    const input = elementChart(),
      before = structuredClone(input);
    const plain = planChartColumnLineCombo(input, [column]);
    expect(plain).toEqual({ ...input, type: "combo" });
    expect(plain.rectangleSeries).toBeUndefined();
    const combo = planChartColumnLineCombo(input, [column, line]);
    expect(combo.range).toEqual(input.range);
    expect(combo.source).toBeUndefined();
    expect(combo.rectangleSeries?.columns).toHaveLength(1);
    expect(combo.rectangleSeries?.columns[0]?.index).toBe(2);
    expect(resolveChartComboSeriesSettings(combo, { rangeBand: line.rangeBand! })).toEqual({
      drawType: "line",
      axis: "secondary",
      markers: true,
    });
    expect(input).toEqual(before);
  });
  test("persisted physical IDs and explicit IDs keep appearance/filter ownership", () => {
    const input = sourceDrawing("owner").chart;
    input.format = {
      series: [
        { id: "pear", color: "#123456", strokeWidth: 5 },
        { id: "retired", color: "#abcdef" },
      ],
    };
    input.seriesFilter = { hiddenSeriesIds: ["apple", "retired"] };
    const before = structuredClone(input);
    const result = planChartColumnLineCombo(input, [
      { seriesId: "pear", drawType: "line", axis: "secondary", markers: false },
    ]);
    expect(result.source).toEqual(input.source);
    expect(result.seriesFilter).toEqual(input.seriesFilter);
    expect(result.format?.series).toEqual([
      { id: "pear", color: "#123456", strokeWidth: 5, drawType: "line", axis: "secondary" },
      { id: "retired", color: "#abcdef" },
    ]);
    expect(input).toEqual(before);
  });
  test("preview resolves physical choices without assigning IDs or mutating saved routing", () => {
    const combo = planChartColumnLineCombo(elementChart(), [line]),
      before = structuredClone(combo);
    expect(
      resolveChartComboSeriesSettings(combo, { rangeBand: line.rangeBand! }, [
        { ...line, axis: "primary", markers: false },
      ]),
    ).toEqual({ drawType: "line", axis: "primary", markers: false });
    expect(combo).toEqual(before);
    expect(
      resolveChartComboSeriesSettings(
        { ...elementChart(), type: "line" },
        { rangeBand: column.rangeBand! },
      ).markers,
    ).toBe(true);
  });
  test("invalid later target is rejected without allocating an earlier band", () => {
    const input = elementChart(),
      before = structuredClone(input);
    expect(() =>
      planChartColumnLineCombo(input, [
        line,
        { ...column, rangeBand: { seriesBy: "columns", index: 99 } },
      ]),
    ).toThrow();
    expect(input).toEqual(before);
    expect(input.rectangleSeries).toBeUndefined();
    expect(() =>
      planChartColumnLineCombo(input, [{ ...line, rangeBand: { seriesBy: "columns", index: 0 } }]),
    ).toThrow();
    expect(() =>
      planChartColumnLineCombo(input, [{ ...line, rangeBand: { seriesBy: "rows", index: 2 } }]),
    ).toThrow();
  });
  test("physical series budget is independent of hidden/filter projection", () => {
    const input = {
      ...elementChart(),
      type: "combo" as const,
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 257 } },
    };
    expect(() => normalizeSheetChart(input)).toThrow(/budget/);
    expect(() =>
      normalizeSheetChart({ ...input, range: { ...input.range, end: { row: 1, column: 256 } } }),
    ).not.toThrow();
    expect(MAX_CHART_COMBO_SERIES_CHANGES).toBe(256);
  });
  test.each(["pivotTableId", "dataCache"])("rejects raw %s presence before its getter", (field) => {
    const input = { ...elementChart(), type: "combo" as const },
      getter = vi.fn(() => {
        throw Error("read");
      });
    Object.defineProperty(input, field, { get: getter });
    expect(() => readChartComboFeature(input)).toThrow(/source ownership/);
    expect(getter).not.toHaveBeenCalled();
  });
  test("stacked/percent combos are rejected, planner deliberately retires those switches", () => {
    expect(() =>
      normalizeSheetChart({ ...elementChart(), type: "combo", stacked: true }),
    ).toThrow();
    expect(() =>
      normalizeSheetChart({
        ...elementChart(),
        type: "combo",
        presentation: { percentStacked: true },
      }),
    ).toThrow();
    const result = planChartColumnLineCombo(
      { ...elementChart(), stacked: true, presentation: { percentStacked: true } },
      [line],
    );
    expect(result.stacked).toBe(false);
    expect(result.presentation?.percentStacked).toBeUndefined();
  });
  test("empty explicit source and no-op route resets retain an empty chart", () => {
    const input = sourceDrawing().chart;
    input.source!.series = [];
    expect(planChartColumnLineCombo(input, []).source?.series).toEqual([]);
    const combo = planChartColumnLineCombo(elementChart(), [line]);
    const reset = planChartColumnLineCombo(combo, [
      { ...line, drawType: "column", axis: "primary", markers: false },
    ]);
    expect(reset.format).toBeUndefined();
    expect(reset.rectangleSeries).toEqual(combo.rectangleSeries);
  });
});

describe("combo descriptor admission before legacy reads", () => {
  test.each([
    null,
    {},
    [column, column],
    Array(1),
    Array(257).fill(column),
    [{ ...column, markers: undefined }],
    [{ ...column, extra: true }],
    [{ ...column, rangeBand: { seriesBy: "columns", index: -1 } }],
  ])("rejects malformed choices %j", (value) => {
    expect(() => normalizeChartComboSeriesChanges(value)).toThrow();
  });
  test("rejects indexed and field accessors without reading either", () => {
    const getter = vi.fn(() => {
        throw Error("read");
      }),
      entries = [column];
    Object.defineProperty(entries, "0", { get: getter });
    expect(() => normalizeChartComboSeriesChanges(entries)).toThrow();
    const entry = { ...line };
    Object.defineProperty(entry, "markers", { get: getter });
    expect(() => normalizeChartComboSeriesChanges([entry])).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  test("rejects concealed malformed format before id/anchor/stacked getters", () => {
    const input = elementDrawing(),
      getter = vi.fn(() => {
        throw Error("legacy read");
      });
    input.chart.format = { series: [{ id: "dormant", drawType: "line" }] };
    Object.defineProperty(input.chart.format.series!, "0", { get: getter });
    Object.defineProperty(input, "id", { get: getter });
    Object.defineProperty(input, "anchor", { get: getter });
    Object.defineProperty(input.chart, "stacked", { get: getter });
    expect(() => normalizeSheetDrawing(input)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
});
