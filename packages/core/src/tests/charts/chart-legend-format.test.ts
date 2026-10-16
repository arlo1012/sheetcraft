import { describe, expect, test } from "vitest";
import { normalizeChartFormat } from "../../chart-format.js";

describe("sparse legend format", () => {
  test("detaches text and surface, retains sparse explicit choices and canonicalizes colors", () => {
    const input = {
      legend: {
        text: { fontFamily: "Arial", fontSize: 16, color: "#ABCDEF", bold: false, italic: true },
        surface: { fill: "transparent", stroke: "#ABC8", strokeWidth: -0 },
      },
    };
    const output = normalizeChartFormat(input);
    expect(output).toEqual({
      legend: {
        text: { ...input.legend.text, color: "#abcdef" },
        surface: { fill: "transparent", stroke: "#abc8", strokeWidth: 0 },
      },
    });
    expect(output.legend).not.toBe(input.legend);
    expect(output.legend!.text).not.toBe(input.legend.text);
    expect(output.legend!.surface).not.toBe(input.legend.surface);
    for (const legend of [
      {},
      { text: {} },
      { surface: {} },
      { text: { fontSize: 1 }, surface: { strokeWidth: 0 } },
      { text: { fontSize: 256 }, surface: { strokeWidth: 32 } },
    ])
      expect(normalizeChartFormat({ legend })).toEqual({ legend });
    expect(normalizeChartFormat({})).toEqual({});
  });

  test("rejects unknown fields, descriptors, undefined and existing out-of-bound values without reads", () => {
    let reads = 0;
    const getter = {
      get() {
        reads++;
        throw Error("Unexpected read");
      },
    };
    for (const wrap of [
      (value: unknown) => ({ legend: value }),
      (value: unknown) => ({ legend: { text: value } }),
      (value: unknown) => ({ legend: { surface: value } }),
    ]) {
      for (const invalid of [
        undefined,
        null,
        [],
        new Date(),
        { unknown: true },
        { [Symbol()]: 1 },
        Object.create({ text: {} }),
        Object.defineProperty({}, "unknown", getter),
      ])
        expect(() => normalizeChartFormat(wrap(invalid))).toThrow();
    }
    for (const input of [
      Object.defineProperty({}, "legend", getter),
      { legend: Object.defineProperty({}, "text", getter) },
      { legend: Object.defineProperty({}, "surface", getter) },
      { legend: { text: Object.defineProperty({}, "fontSize", getter) } },
      { legend: { surface: Object.defineProperty({}, "fill", getter) } },
      { legend: { text: { fontSize: undefined } } },
      { legend: { surface: { fill: undefined } } },
      ...[0, 257, NaN, Infinity].map((fontSize) => ({ legend: { text: { fontSize } } })),
      ...[-1, 33, NaN, Infinity].map((strokeWidth) => ({ legend: { surface: { strokeWidth } } })),
      { legend: { text: { bold: 1 } } },
      { legend: { text: { fontFamily: " " } } },
      { legend: { text: { color: "red" } } },
      { legend: { surface: { fill: "url(unsafe)" } } },
      { legend: { effects: {} } },
      { legend: { manualLayout: {} } },
    ])
      expect(() => normalizeChartFormat(input)).toThrow();
    expect(reads).toBe(0);
  });
});
