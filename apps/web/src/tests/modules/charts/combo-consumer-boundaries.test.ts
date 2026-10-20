import { describe, expect, test } from "vitest";
import { applyChartFormatIntent } from "../../../modules/charts/chart-format-intents";
import {
  getChartFormatCapabilities,
  getChartFormatTargets,
} from "../../../modules/charts/chart-format-pane";
import { getChartElementCapabilities } from "../../../modules/charts/chart-elements";

import { comboChart, comboData } from "./combo-fixture";

describe("Combo consumers keep captured routing and actual applicable controls", () => {
  test("bar-only label positions disappear for a line-only Combo and follow private route drafts", () => {
    const chart = comboChart();
    chart.format!.series!.push({ id: "apple", drawType: "line" });
    expect(getChartElementCapabilities("combo", chart).labelPosition).toBe(false);
    expect(
      getChartElementCapabilities("combo", chart, [
        { seriesId: "apple", drawType: "column", axis: "primary", markers: false },
      ]).labelPosition,
    ).toBe(true);
    expect(chart.format!.series!.find((entry) => entry.id === "apple")?.drawType).toBe("line");
  });
  test("column gap and line stroke/markers are distinct; smooth/stacking stay unavailable", () => {
    const chart = comboChart();
    expect(
      getChartFormatCapabilities(chart, comboData, { kind: "series", seriesId: "apple" }),
    ).toMatchObject({ bar: true, seriesStroke: false, seriesMarkers: false, seriesSmooth: false });
    expect(
      getChartFormatCapabilities(chart, comboData, { kind: "series", seriesId: "pear" }),
    ).toMatchObject({ bar: false, seriesStroke: true, seriesMarkers: true, seriesSmooth: false });
    expect(getChartElementCapabilities("combo")).toMatchObject({
      labelPosition: true,
      stacked: false,
    });
    const visible = { ...comboData, series: comboData.series.slice(0, 1) };
    const targets = getChartFormatTargets(chart, comboData, visible);
    expect(targets).not.toContainEqual({ kind: "secondaryValueAxis" });
    expect(targets).toContainEqual({ kind: "series", seriesId: "pear" });
  });
  test("appearance replacement/reset preserves saved routing, axis and marker identity", () => {
    const chart = comboChart();
    Object.assign(chart.format!.series![0]!, { markerSymbol: "square", markerSizePt: 9 });
    const before = structuredClone(chart),
      target = { kind: "series" as const, seriesId: "pear" };
    const recolored = applyChartFormatIntent(chart, target, {
      kind: "series",
      seriesId: "pear",
      format: {
        color: "#ff0000",
        axis: "secondary",
        markers: false,
        markerSymbol: "square",
        markerSizePt: 9,
      },
    });
    expect(recolored.format?.series?.find((entry) => entry.id === "pear")).toMatchObject({
      drawType: "line",
      color: "#ff0000",
      markerSymbol: "square",
      markerSizePt: 9,
    });
    const reset = applyChartFormatIntent(chart, target, {
      kind: "series",
      seriesId: "pear",
      format: undefined,
    });
    expect(reset.format?.series).toEqual([
      { id: "pear", drawType: "line", axis: "secondary", markers: false },
    ]);
    expect(chart).toEqual(before);
  });
  test("pane cannot forge a type switch or give line targets bar-wide controls", () => {
    const chart = comboChart(),
      target = { kind: "series" as const, seriesId: "pear" },
      before = structuredClone(chart);
    expect(() =>
      applyChartFormatIntent(chart, target, {
        kind: "series",
        seriesId: "pear",
        format: { drawType: "column" },
      }),
    ).toThrow(/routing/);
    expect(() =>
      applyChartFormatIntent(chart, target, { kind: "chart", format: { gapWidth: 50 } }),
    ).toThrow(/another element/);
    expect(chart).toEqual(before);
  });
});
