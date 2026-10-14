import { describe, expect, test } from "vitest";
import { normalizeChartPresentation } from "../../chart-presentation.js";
import { normalizeSheetChart, type ChartType } from "../../sheet-charts.js";
import { normalizeSheetDrawings } from "../../sheet-drawings.js";
import { chartPresentation, presentationDrawing } from "./chart-presentation-fixture.js";

const chartTypes: ChartType[] = [
  "column",
  "bar",
  "line",
  "area",
  "pie",
  "doughnut",
  "scatter",
  "radar",
  "treemap",
  "sankey",
  "river",
  "wordCloud",
];

describe("bounded descriptor-safe chart presentation", () => {
  test("detaches palette and canonicalizes choices without adding defaults", () => {
    const input = chartPresentation(),
      output = normalizeChartPresentation(input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(output.palette).not.toBe(input.palette);
    input.palette![0] = "#ffffff";
    expect(output.palette![0]).toBe("#123456");
    const reordered = {
      background: "#FEFEFE",
      palette: ["#123456", "#ABC"],
      lineMarkers: false,
      percentStacked: true,
    };
    expect(JSON.stringify(normalizeChartPresentation(reordered))).toBe(JSON.stringify(output));
    expect(normalizeChartPresentation({})).toEqual({});
    expect(normalizeChartPresentation(Object.create(null))).toEqual({});
    expect(normalizeChartPresentation({ palette: Array(16).fill("#ABC") }).palette).toEqual(
      Array(16).fill("#abc"),
    );
    expect("presentation" in normalizeSheetChart(presentationDrawing().chart)).toBe(false);
  });

  test.each([
    null,
    [],
    new Date(),
    "plain",
    1,
    false,
    { percentStacked: false },
    { percentStacked: 1 },
    { percentStacked: "true" },
    { lineMarkers: 0 },
    { lineMarkers: null },
    { lineMarkers: "false" },
    { palette: [] },
    { palette: Array(17).fill("#000") },
    { palette: "#000" },
    { palette: ["red"] },
    { palette: ["transparent"] },
    { palette: ["#abcd"] },
    { palette: ["#11223344"] },
    { palette: ["#12345"] },
    { palette: [" #fff"] },
    { palette: [undefined] },
    { palette: [null] },
    { palette: [1] },
    { background: "transparent" },
    { background: "#abcd" },
    { background: "#11223344" },
    { background: "url(unsafe)" },
    { background: "red" },
    { background: "#12345" },
    { percentStacked: undefined },
    { lineMarkers: undefined },
    { palette: undefined },
    { background: undefined },
    { presetId: "colorful" },
    { subtype: "percentStacked" },
    { unknown: true },
    { [Symbol("bad")]: true },
  ])("rejects malformed or out-of-budget settings %j", (value) =>
    expect(() => normalizeChartPresentation(value)).toThrow(),
  );

  test("rejects accessors, prototypes and malformed arrays without reading a getter", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected getter read");
      },
    };
    for (const key of ["percentStacked", "lineMarkers", "palette", "background", "unknown"])
      expect(() => normalizeChartPresentation(Object.defineProperty({}, key, getter))).toThrow();
    const sparse: unknown[] = [];
    sparse.length = 1;
    const subclass = class extends Array<string> {};
    const inputs = [
      Object.create({ lineMarkers: false }),
      Object.assign(Object.create(Object.defineProperty({}, "palette", getter)), {
        background: "#fff",
      }),
      { palette: sparse },
      { palette: new subclass("#fff") },
      { palette: Object.defineProperty(["#fff"], "0", getter) },
      { palette: Object.assign(["#fff"], { unknown: true }) },
      { palette: Object.assign(["#fff"], { [Symbol("bad")]: true }) },
      { palette: Object.defineProperty(["#fff"], "extra", getter) },
    ];
    for (const value of inputs) expect(() => normalizeChartPresentation(value)).toThrow();
    for (const chart of [
      Object.defineProperty(presentationDrawing().chart, "presentation", getter),
      Object.assign(
        Object.create(Object.defineProperty({}, "presentation", getter)),
        presentationDrawing().chart,
      ),
      { ...presentationDrawing().chart, presentation: undefined },
    ])
      expect(() => normalizeSheetChart(chart)).toThrow();
    expect(reads).toBe(0);
  });

  test("colors apply to all twelve chart types while flags have explicit applicability", () => {
    const colors = { palette: ["#ABC", "#123456"], background: "#FEDCBA" };
    for (const type of chartTypes) {
      const chart = { ...presentationDrawing().chart, type, presentation: colors };
      expect(normalizeSheetChart(chart).presentation).toEqual({
        palette: ["#abc", "#123456"],
        background: "#fedcba",
      });
      const percent = { ...chart, presentation: { percentStacked: true } as const };
      if (["column", "bar", "line", "area"].includes(type)) {
        expect(normalizeSheetChart(percent).presentation).toEqual({ percentStacked: true });
        expect(() => normalizeSheetChart({ ...percent, stacked: false })).toThrow(/stacked/);
      } else expect(() => normalizeSheetChart(percent)).toThrow(/stacked/);
      for (const lineMarkers of [true, false]) {
        const markers = { ...chart, presentation: { lineMarkers } };
        if (type === "line")
          expect(normalizeSheetChart(markers).presentation).toEqual({ lineMarkers });
        else expect(() => normalizeSheetChart(markers)).toThrow(/line chart/);
      }
    }
  });

  test("canonical drawing normalization preserves and isolates every presentation branch", () => {
    const input = presentationDrawing(chartPresentation());
    const [output] = normalizeSheetDrawings([input]);
    expect(output).toEqual(input);
    if (output!.kind !== "chart") throw Error("Expected chart");
    expect(output!.chart.presentation).not.toBe(input.chart.presentation);
    expect(output!.chart.presentation!.palette).not.toBe(input.chart.presentation!.palette);
    output!.chart.presentation!.palette![0] = "#fff";
    expect(input.chart.presentation).toEqual(chartPresentation());
  });
});
