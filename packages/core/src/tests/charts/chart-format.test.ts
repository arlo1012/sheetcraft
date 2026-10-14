import { describe, expect, test } from "vitest";
import { normalizeChartFormat } from "../../chart-format.js";
import { normalizeSheetChart } from "../../sheet-charts.js";
import { normalizeSheetDrawings } from "../../sheet-drawings.js";
import { chartFormat, formatDrawing } from "./chart-format-fixture.js";
import { sourceDrawing } from "./chart-source-fixture.js";

const normalize = (value: unknown) => normalizeChartFormat(value);

describe("sparse descriptor-safe chart common format", () => {
  test("detaches every branch, preserves explicit transparent and canonicalizes field order", () => {
    const input = chartFormat(),
      output = normalize(input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    for (const key of [
      "title",
      "plot",
      "categoryAxis",
      "valueAxis",
      "secondaryValueAxis",
      "bar",
      "series",
    ] as const)
      expect(output[key]).not.toBe(input[key]);
    expect(output.categoryAxis!.text).not.toBe(input.categoryAxis!.text);
    expect(output.categoryAxis!.line).not.toBe(input.categoryAxis!.line);
    expect(output.valueAxis!.text).not.toBe(input.valueAxis!.text);
    expect(output.valueAxis!.line).not.toBe(input.valueAxis!.line);
    expect(output.valueAxis!.numberFormat).not.toBe(input.valueAxis!.numberFormat);
    expect(output.series![0]).not.toBe(input.series![0]);
    input.valueAxis!.min = 40;
    input.series![0]!.color = "#abcdef";
    expect(output.valueAxis!.min).toBe(20);
    expect(output.series![0]!.color).toBe("#112233");
    expect(
      normalize({
        title: { italic: false, bold: true, color: "#ABCDEF", fontSize: 24, fontFamily: "Arial" },
      }),
    ).toEqual({
      title: { fontFamily: "Arial", fontSize: 24, color: "#abcdef", bold: true, italic: false },
    });
    expect(JSON.stringify(normalize({ bar: { overlap: 50, gapWidth: 50 } }))).toBe(
      JSON.stringify(normalize({ bar: { gapWidth: 50, overlap: 50 } })),
    );
    expect(
      normalize({ plot: { fill: "transparent", stroke: "#ABCDEF80", strokeWidth: -0 } }),
    ).toEqual({ plot: { fill: "transparent", stroke: "#abcdef80", strokeWidth: 0 } });
    expect(normalize(Object.assign(Object.create(null), { title: Object.create(null) }))).toEqual({
      title: {},
    });
    expect(normalize({})).toEqual({});
  });

  test.each([
    { title: { fontSize: 1 } },
    { title: { fontSize: 256 } },
    { plot: { strokeWidth: 0 } },
    { plot: { strokeWidth: 32 } },
    { categoryAxis: { labelAngle: -90 } },
    { categoryAxis: { labelAngle: 90 } },
    { bar: { gapWidth: 0, overlap: -100 } },
    { bar: { gapWidth: 500, overlap: 100 } },
    { valueAxis: { min: -10, max: 10, majorUnit: 2, minorUnit: 0.02 } },
    { valueAxis: { min: 0, max: 2047, majorUnit: 1 } },
    { valueAxis: { min: 0, max: 1, majorUnit: 0.3, minorUnit: 0.1 } },
    { secondaryValueAxis: { min: 0, max: 1, minorUnit: 1 / 2047 } },
  ])("accepts numeric boundaries %j", (input) => expect(() => normalize(input)).not.toThrow());

  test.each([
    { title: { fontSize: 0 } },
    { title: { fontSize: 257 } },
    { title: { fontSize: NaN } },
    { title: { fontFamily: "" } },
    { title: { fontFamily: "x".repeat(257) } },
    { title: { color: "red" } },
    { title: { color: "url(unsafe)" } },
    { title: { color: "#12345" } },
    { plot: { strokeWidth: -1 } },
    { plot: { strokeWidth: 33 } },
    { categoryAxis: { labelAngle: 91 } },
    { categoryAxis: { labelAngle: -91 } },
    { categoryAxis: { show: "false" } },
    { categoryAxis: { title: "x".repeat(1001) } },
    { categoryAxis: { line: { fill: "#112233" } } },
    { valueAxis: { line: { fill: "transparent" } } },
    { valueAxis: { min: 1, max: 1 } },
    { valueAxis: { min: 2, max: 1 } },
    { valueAxis: { min: Infinity } },
    { valueAxis: { max: -Infinity } },
    { valueAxis: { majorUnit: 0 } },
    { valueAxis: { minorUnit: -1 } },
    { valueAxis: { majorUnit: 2, minorUnit: 3 } },
    { valueAxis: { majorUnit: 1, minorUnit: 0.3 } },
    { valueAxis: { majorUnit: 101, minorUnit: 1 } },
    { valueAxis: { min: 0, max: 2048, majorUnit: 1 } },
    { valueAxis: { min: 0, max: 2048, minorUnit: 1 } },
    { valueAxis: { min: -Number.MAX_VALUE, max: Number.MAX_VALUE, majorUnit: 1 } },
    { valueAxis: { min: -Number.MAX_VALUE, max: Number.MAX_VALUE } },
    { secondaryValueAxis: { min: -Number.MAX_VALUE, max: Number.MAX_VALUE } },
    { valueAxis: { linkedToSource: 0 } },
    { bar: { gapWidth: -1 } },
    { bar: { gapWidth: 501 } },
    { bar: { overlap: -101 } },
    { bar: { overlap: 101 } },
    { series: [{ id: "a", strokeWidth: 33 }] },
    { series: [{ id: "a", axis: "tertiary" }] },
    { series: [{ id: "a", markers: 1 }] },
    { series: [{ id: "a", smooth: "yes" }] },
  ])("rejects invalid fields and unsafe fixed tick counts %j", (input) =>
    expect(() => normalize(input)).toThrow(),
  );

  test("reuses all shared number formats while rejecting variant-unknown fields", () => {
    for (const numberFormat of [
      {
        kind: "number",
        fractionDigits: 1,
        useGrouping: true,
        negativeStyle: "red",
        locale: "en-US",
      },
      { kind: "percent", fractionDigits: 0 },
      { kind: "currency", currency: " usd ", currencySymbol: "$", fractionDigits: 2 },
      { kind: "accounting", currency: "", fractionDigits: 2 },
      { kind: "date", code: "yyyy-mm-dd" },
      { kind: "time", code: "hh:mm:ss" },
      { kind: "fraction", code: "# ?/?" },
      { kind: "scientific", fractionDigits: 2 },
      { kind: "special", code: "[DBNum2][$-804]General", chineseUpperStyle: "compact" },
      { kind: "custom", code: "0.000" },
      { kind: "text" },
    ])
      expect(() => normalize({ valueAxis: { numberFormat } })).not.toThrow();
    expect(
      normalize({
        valueAxis: { numberFormat: { kind: "currency", currency: "usd", fractionDigits: 2 } },
      }).valueAxis!.numberFormat,
    ).toEqual({ kind: "currency", currency: "USD", fractionDigits: 2 });
    for (const numberFormat of [
      { kind: "general" },
      { kind: "number", fractionDigits: 100 },
      { kind: "text", locale: "en-US" },
      { kind: "number", fractionDigits: 2, code: "0.00" },
      { kind: "date", code: "yyyy-mm-dd", fractionDigits: 2 },
      { kind: "number", fractionDigits: 2, unknown: true },
    ])
      expect(() => normalize({ valueAxis: { numberFormat } })).toThrow();
  });

  test("rejects accessors, symbols, unknown/inherited/prototype fields at every branch without getter reads", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected getter read");
      },
    };
    const wrappers = [
      (entry: unknown) => entry,
      (entry: unknown) => ({ title: entry }),
      (entry: unknown) => ({ plot: entry }),
      (entry: unknown) => ({ categoryAxis: entry }),
      (entry: unknown) => ({ valueAxis: entry }),
      (entry: unknown) => ({ secondaryValueAxis: entry }),
      (entry: unknown) => ({ categoryAxis: { text: entry } }),
      (entry: unknown) => ({ valueAxis: { line: entry } }),
      (entry: unknown) => ({ valueAxis: { numberFormat: entry } }),
      (entry: unknown) => ({ bar: entry }),
      (entry: unknown) => ({ series: [entry] }),
    ];
    for (const wrap of wrappers)
      for (const invalid of [
        null,
        [],
        new Date(),
        Object.create({ unknown: true }),
        { [Symbol("bad")]: true },
        { unknown: true },
        Object.defineProperty({}, "unknown", getter),
        Object.defineProperty({}, "hidden", { value: true }),
      ])
        expect(() => normalize(wrap(invalid))).toThrow();
    for (const input of [
      Object.defineProperty({}, "title", getter),
      { title: Object.defineProperty({}, "fontSize", getter) },
      { plot: Object.defineProperty({}, "fill", getter) },
      { categoryAxis: Object.defineProperty({}, "reverse", getter) },
      {
        valueAxis: {
          numberFormat: Object.defineProperty({ kind: "number" }, "fractionDigits", getter),
        },
      },
      { valueAxis: { numberFormat: Object.defineProperty({}, "kind", getter) } },
      { valueAxis: { line: Object.defineProperty({}, "stroke", getter) } },
      { bar: Object.defineProperty({}, "gapWidth", getter) },
      { series: [Object.defineProperty({ id: "a" }, "axis", getter)] },
      { title: { fontSize: undefined } },
      { valueAxis: { numberFormat: { kind: "text", locale: undefined } } },
      { series: undefined },
      { valueAxis: undefined },
    ])
      expect(() => normalize(input)).toThrow();
    expect(reads).toBe(0);
  });

  test("bounds the dense own series array and permits dormant stable IDs across source reordering and chart types", () => {
    const entries = Array.from({ length: 256 }, (_, index) => ({ id: `series-${index}` }));
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(normalize({ series: entries }).series).toHaveLength(256);
    for (const series of [
      [...entries, { id: "overflow" }],
      [{ id: "a" }, { id: "a" }],
      [{ id: " " }],
      [{ id: "x".repeat(129) }],
      sparse,
      Object.assign([], { unknown: true }),
      Object.assign([], { [Symbol("bad")]: true }),
      Object.assign(Object.create(Array.prototype), { length: 0 }),
    ])
      expect(() => normalize({ series })).toThrow();
    let reads = 0;
    const accessor = Object.defineProperty([{}], "0", {
      get() {
        reads++;
        return { id: "a" };
      },
    });
    expect(() => normalize({ series: accessor })).toThrow();
    expect(reads).toBe(0);
    const drawing = sourceDrawing();
    drawing.chart.format = chartFormat();
    const format = normalizeSheetChart(drawing.chart).format;
    drawing.chart.source!.series.reverse();
    expect(normalizeSheetChart(drawing.chart).format).toEqual(format);
    drawing.chart.source!.series.pop();
    expect(normalizeSheetChart(drawing.chart).format).toEqual(format);
    drawing.chart.type = "radar";
    expect(normalizeSheetChart(drawing.chart).format).toEqual(format);
    const rectangle = formatDrawing(chartFormat());
    rectangle.chart.type = "pie";
    expect(normalizeSheetChart(rectangle.chart).format).toEqual(format);
  });

  test("drawing and chart boundaries detach sparse format and reject inherited/accessor ownership", () => {
    const input = formatDrawing(chartFormat());
    const output = normalizeSheetDrawings([input]);
    expect(output).toEqual([input]);
    if (output[0]!.kind !== "chart") throw Error("Expected chart");
    expect(output[0]!.chart.format).not.toBe(input.chart.format);
    expect("format" in normalizeSheetChart(formatDrawing().chart)).toBe(false);
    let reads = 0;
    const getter = {
      get() {
        reads++;
        throw Error("Unexpected getter read");
      },
    };
    for (const chart of [
      Object.defineProperty(formatDrawing().chart, "format", getter),
      Object.assign(
        Object.create(Object.defineProperty({}, "format", getter)),
        formatDrawing().chart,
      ),
      { ...formatDrawing().chart, format: undefined },
    ])
      expect(() => normalizeSheetChart(chart)).toThrow();
    expect(reads).toBe(0);
  });
});
