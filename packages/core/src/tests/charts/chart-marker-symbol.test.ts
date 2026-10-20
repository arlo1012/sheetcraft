import { describe, expect, test } from "vitest";
import { normalizeChartFormat } from "../../chart-format.js";
import { normalizeSheetChart } from "../../sheet-charts.js";
import { formatDrawing } from "./chart-format-fixture.js";
import { sourceDrawing } from "./chart-source-fixture.js";

describe("explicit per-series marker symbols", () => {
  test("retains supported shapes, independent size, hidden state and detached stable IDs", () => {
    for (const markerSymbol of ["circle", "square"]) {
      const input = {
        series: [
          { id: "apple", markerSymbol, markerSizePt: 9, markers: false },
          { id: "retired", markerSymbol: "square" },
        ],
      };
      const normalized = normalizeChartFormat(input);
      expect(normalized).toEqual(input);
      expect(normalized.series).not.toBe(input.series);
      expect(normalized.series![0]).not.toBe(input.series[0]);
      input.series[0]!.markerSymbol = "triangle";
      expect(normalized.series![0]!.markerSymbol).toBe(markerSymbol);
      const chart = sourceDrawing().chart;
      chart.format = normalized;
      for (const type of ["line", "column", "bar", "area", "radar"] as const)
        expect(normalizeSheetChart({ ...chart, type }).format).toEqual(normalized);
      expect(
        normalizeSheetChart({ ...formatDrawing(normalized).chart, type: "pie" }).format,
      ).toEqual(normalized);
    }
    expect(
      normalizeChartFormat({ series: [{ id: "apple", markers: true, markerSizePt: 9 }] })
        .series![0],
    ).not.toHaveProperty("markerSymbol");
  });

  test("rejects unsupported symbols and malformed values rather than coercing or resetting", () => {
    for (const markerSymbol of [
      undefined,
      null,
      "",
      "Circle",
      "Square",
      "triangle",
      "diamond",
      "none",
      "auto",
      " circle",
      9,
      true,
      {},
      [],
      NaN,
    ])
      expect(() => normalizeChartFormat({ series: [{ id: "apple", markerSymbol }] })).toThrow();
    expect(() =>
      normalizeChartFormat({ series: [{ id: "apple", markerShape: "square" }] }),
    ).toThrow();
  });

  test("rejects own and inherited accessors without invoking getters", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected marker accessor read");
      },
    };
    for (const entry of [
      Object.defineProperty({ id: "apple" }, "markerSymbol", getter),
      Object.assign(Object.create({ markerSymbol: "square" }), { id: "apple" }),
      Object.assign(Object.create(Object.defineProperty({}, "markerSymbol", getter)), {
        id: "apple",
      }),
      Object.defineProperty({ markerSymbol: "square" }, "id", getter),
    ])
      expect(() => normalizeChartFormat({ series: [entry] })).toThrow();
    const series = Object.defineProperty([{}], "0", getter);
    expect(() => normalizeChartFormat({ series })).toThrow();
    expect(reads).toBe(0);
  });
});
