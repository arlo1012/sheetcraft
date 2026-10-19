import { describe, expect, test } from "vitest";
import { normalizeChartFormat } from "../../chart-format.js";

const axes = ["categoryAxis", "valueAxis", "secondaryValueAxis"] as const;

describe("independent chart axis title formats", () => {
  test.each(axes)("preserves independent empty state and deep clones %s typography", (axis) => {
    const titleText = {
      fontSize: 40 / 3,
      bold: true,
      italic: false,
      color: "#ABCDEF",
      scriptFonts: { eastAsia: { kind: "family", family: "Title Font" } },
    } as const;
    const input = { [axis]: { titleText, titleRotation: -90, text: { bold: false } } };
    const normalized = normalizeChartFormat(input);
    expect(normalized[axis]).toEqual({
      titleText: { ...titleText, color: "#abcdef" },
      titleRotation: -90,
      text: { bold: false },
    });
    expect(normalized[axis]!.titleText).not.toBe(titleText);
    expect(normalized[axis]!.titleText!.scriptFonts).not.toBe(titleText.scriptFonts);
    expect(normalized[axis]!.titleText!.scriptFonts!.eastAsia).not.toBe(
      titleText.scriptFonts.eastAsia,
    );
    expect(normalizeChartFormat({ [axis]: { titleText: {}, titleRotation: -0 } })[axis]).toEqual({
      titleText: {},
      titleRotation: 0,
    });
    expect(normalizeChartFormat({ [axis]: { text: { bold: false } } })[axis]).not.toHaveProperty(
      "titleText",
    );
    for (const titleRotation of [-90, -22.5, 0, 90])
      expect(normalizeChartFormat({ [axis]: { titleRotation } })[axis]!.titleRotation).toBe(
        titleRotation,
      );
  });

  test.each(axes)("rejects malformed %s title fields without invoking accessors", (axis) => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("read");
      },
    };
    for (const value of [undefined, null, "0", NaN, Infinity, -Infinity, -91, 91])
      expect(() => normalizeChartFormat({ [axis]: { titleRotation: value } })).toThrow();
    for (const value of [
      undefined,
      null,
      [],
      { unknown: true },
      { fontSize: 0 },
      { fontFamily: "Arial", scriptFonts: { latin: { kind: "automatic" } } },
      Object.defineProperty({}, "bold", getter),
      Object.create({ bold: true }),
    ])
      expect(() => normalizeChartFormat({ [axis]: { titleText: value } })).toThrow();
    for (const key of ["titleText", "titleRotation"])
      for (const value of [Object.defineProperty({}, key, getter), Object.create({ [key]: {} })])
        expect(() => normalizeChartFormat({ [axis]: value })).toThrow();
    expect(reads).toBe(0);
  });
});
