import { describe, expect, test } from "vitest";
import { normalizeChartFormat } from "../../chart-format.js";
import { normalizeSheetChart } from "../../sheet-charts.js";
import { formatDrawing } from "./chart-format-fixture.js";
import { sourceDrawing } from "./chart-source-fixture.js";

describe("explicit per-series marker size in points", () => {
  test("retains exact integer boundaries, dormant state and detached stable IDs", () => {
    for (const markerSizePt of [2, 5, 9, 72]) {
      const input = {
        series: [
          { id: "apple", markerSizePt, markers: false },
          { id: "retired", markerSizePt: 72 },
        ],
      };
      const normalized = normalizeChartFormat(input);
      expect(normalized).toEqual(input);
      expect(normalized.series).not.toBe(input.series);
      expect(normalized.series![0]).not.toBe(input.series[0]);
      input.series[0]!.markerSizePt = 20;
      expect(normalized.series![0]!.markerSizePt).toBe(markerSizePt);
      const chart = sourceDrawing().chart;
      chart.format = normalized;
      for (const type of ["line", "column", "bar", "area", "radar"] as const)
        expect(normalizeSheetChart({ ...chart, type }).format).toEqual(normalized);
      expect(
        normalizeSheetChart({ ...formatDrawing(normalized).chart, type: "pie" }).format,
      ).toEqual(normalized);
    }
    expect(normalizeChartFormat({ series: [{ id: "apple" }] }).series![0]).not.toHaveProperty(
      "markerSizePt",
    );
  });

  test("rejects invalid values instead of rounding, coercing or treating them as a reset", () => {
    for (const markerSizePt of [
      undefined,
      null,
      "5",
      true,
      {},
      [],
      NaN,
      Infinity,
      -Infinity,
      -0,
      1,
      1.999,
      2.5,
      71.5,
      73,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(() => normalizeChartFormat({ series: [{ id: "apple", markerSizePt }] })).toThrow();
    expect(() =>
      normalizeChartFormat({ series: [{ id: "apple", markerSizePt: 5, markerShape: "circle" }] }),
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
      Object.defineProperty({ id: "apple" }, "markerSizePt", getter),
      Object.assign(Object.create({ markerSizePt: 5 }), { id: "apple" }),
      Object.assign(Object.create(Object.defineProperty({}, "markerSizePt", getter)), {
        id: "apple",
      }),
      Object.defineProperty({ markerSizePt: 5 }, "id", getter),
    ])
      expect(() => normalizeChartFormat({ series: [entry] })).toThrow();
    const series = Object.defineProperty([{}], "0", getter);
    expect(() => normalizeChartFormat({ series })).toThrow();
    expect(reads).toBe(0);
  });
});
