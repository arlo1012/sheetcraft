import { describe, expect, test } from "vitest";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import { executeWorkbookCommand } from "../../history.js";
import { getSheetChartData, type SheetChart } from "../../sheet-charts.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import type { PivotValueField } from "../../pivot-tables.js";
import { createSheetEvaluator, getCellStyle, setCellStyle } from "../../workbook.js";
import { fixture } from "./fixture.js";

const currency = { kind: "currency", currency: "USD", fractionDigits: 2 } as const;
const percent = { kind: "custom", code: "0.00%" } as const;
function linked(values: PivotValueField[]) {
  const f = fixture();
  executeWorkbookCommand(
    f.session,
    createSetPivotTableCommand(
      f.destination.id,
      { ...f.table, values },
      { chartId: "formatted-chart" },
    ),
  );
  const chart = (f.destination.drawings![0] as SheetChartDrawing).chart;
  const read = (patch: Partial<SheetChart> = {}) =>
    getSheetChartData(f.destination, { ...chart, ...patch }, createSheetEvaluator(f.destination));
  return { ...f, chart, read };
}

describe("pivot chart number formats and output visibility", () => {
  test("exposes explicit measure number formats with raw numeric series values", () => {
    const f = linked([{ field: 2, aggregate: "sum", caption: "Amount", numberFormat: currency }]);
    expect(f.read().series).toEqual([
      { name: "Q1 / Amount", values: [30, 40], numberFormat: currency },
      { name: "Q2 / Amount", values: [30, 0], numberFormat: currency },
    ]);
  });

  test("implicit percentage display formats match the output cells", () => {
    const f = linked([
      { field: 2, aggregate: "sum", caption: "Share", display: { type: "percentOfTotal" } },
    ]);
    const data = f.read();
    expect(data.series[0]!.values).toEqual([0.3, 0.4]);
    expect(data.series.map((series) => series.numberFormat)).toEqual([percent, percent]);
    expect(getCellStyle(f.destination, { row: 3, column: 3 })?.numberFormat).toEqual(percent);
  });

  test("maps repeated column series to their own measure formats", () => {
    const f = linked([
      { field: 2, aggregate: "sum", caption: "Amount", numberFormat: currency },
      {
        field: 3,
        aggregate: "sum",
        caption: "Units",
        numberFormat: { kind: "number", fractionDigits: 0 },
      },
    ]);
    const data = f.read();
    expect(data.series.map((series) => series.numberFormat)).toEqual([
      currency,
      { kind: "number", fractionDigits: 0 },
      currency,
      { kind: "number", fractionDigits: 0 },
    ]);
    expect(data.series.map((series) => series.values)).toEqual([
      [30, 40],
      [5, 5],
      [30, 0],
      [4, 0],
    ]);
  });

  test("skips hidden output axes while preserving measure formats and record alignment", () => {
    const f = linked([
      { field: 2, aggregate: "sum", caption: "Amount", numberFormat: currency },
      {
        field: 3,
        aggregate: "sum",
        caption: "Units",
        numberFormat: { kind: "number", fractionDigits: 0 },
      },
    ]);
    f.destination.hiddenRows = new Set([3]);
    f.destination.hiddenColumns = new Set([3, 6]);
    const visible = f.read({ showHidden: false });
    expect(visible.categories).toEqual(["West"]);
    expect(visible.series).toEqual([
      { name: "Q1 / Units", values: [5], numberFormat: { kind: "number", fractionDigits: 0 } },
      { name: "Q2 / Amount", values: [0], numberFormat: currency },
    ]);
    expect(visible.records).toEqual([["West", 5, 0]]);
    const all = f.read({ showHidden: true });
    expect(all.categories).toEqual(["East", "West"]);
    expect(all.series).toHaveLength(4);
    expect(all.records).toEqual([
      ["East", 30, 5, 30, 4],
      ["West", 40, 5, 0, 0],
    ]);
    expect(all.series.map((series) => series.values)).toEqual([
      [30, 40],
      [5, 5],
      [30, 0],
      [4, 0],
    ]);
  });

  test("ordinary charts omit a format for a series with conflicting numeric cell formats", () => {
    const f = fixture();
    for (const row of [1, 2, 3, 4])
      setCellStyle(f.source, { row, column: 2 }, { numberFormat: currency });
    setCellStyle(
      f.source,
      { row: 4, column: 2 },
      { numberFormat: { kind: "number", fractionDigits: 0 } },
    );
    const chart: SheetChart = {
      type: "column",
      range: { start: { row: 0, column: 1 }, end: { row: 4, column: 2 } },
      title: "Mixed",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
    };
    expect(
      getSheetChartData(f.source, chart, createSheetEvaluator(f.source)).series[0]!.numberFormat,
    ).toBeUndefined();
  });

  test.each(["columns", "rows"] as const)(
    "ordinary charts preserve a consistent %s series format from numeric cells",
    (seriesBy) => {
      const f = fixture();
      for (const row of [1, 2, 3, 4])
        setCellStyle(f.source, { row, column: 2 }, { numberFormat: currency });
      const chart: SheetChart = {
        type: "column",
        range: { start: { row: 0, column: 1 }, end: { row: 4, column: 2 } },
        title: "Ordinary",
        headerRow: true,
        headerColumn: true,
        seriesBy,
        legend: true,
        labels: false,
        stacked: false,
        showHidden: false,
      };
      const data = getSheetChartData(f.source, chart, createSheetEvaluator(f.source));
      expect(data.series.map((series) => series.numberFormat)).toEqual(
        seriesBy === "columns" ? [currency] : [currency, currency, currency, currency],
      );
    },
  );
});
