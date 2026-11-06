// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { paintSparkline } from "../../../modules/sparklines/sparkline-painter";

const colors = {
  series: "#123456",
  negative: "#654321",
  high: "#aa0000",
  low: "#00aa00",
  first: "#0000aa",
  last: "#aaaa00",
  marker: "#aa00aa",
};
type PaintedPoint = { x: number; color: string };

function paint(
  type: CellSparkline["type"],
  values: readonly (number | null)[],
  patch: Partial<CellSparkline> = {},
) {
  const points: PaintedPoint[] = [];
  const bars: PaintedPoint[] = [];
  let markerX = 0;
  const context = {
    fillStyle: "#000000",
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc(x: number) {
      markerX = x;
    },
    fill() {
      points.push({ x: markerX, color: context.fillStyle });
    },
    fillRect(x: number, _y: number, width: number) {
      bars.push({ x: x + width / 2, color: context.fillStyle });
    },
  };
  paintSparkline(
    context as unknown as CanvasRenderingContext2D,
    { x: 0, y: 0, width: 106, height: 46 },
    {
      type,
      source: null,
      color: colors.series,
      negativeColor: colors.negative,
      markers: false,
      axis: false,
      showHidden: false,
      empty: "gap",
      ...patch,
    },
    values,
  );
  return { points, bars, painted: type === "line" ? points : bars };
}

describe.each(["line", "column", "winLoss"] as const)("%s point colors", (type) => {
  test("colors all tied actual positive extrema rather than the zero-inclusive axis domain", () => {
    const result = paint(type, [2, 5, 5, 3], {
      markers: true,
      negativePoints: false,
      highPoint: { show: true, color: colors.high },
      lowPoint: { show: true, color: colors.low },
    });
    expect(result.painted.map(({ color }) => color)).toEqual([
      colors.low,
      colors.high,
      colors.high,
      colors.series,
    ]);
  });

  test("distinguishes actual high and low values even when every value is negative", () => {
    const result = paint(type, [-5, -2, -2, -4], {
      markers: true,
      negativePoints: false,
      highPoint: { show: true, color: colors.high },
      lowPoint: { show: true, color: colors.low },
    });
    expect(result.painted.map(({ color }) => color)).toEqual([
      colors.low,
      colors.high,
      colors.high,
      colors.series,
    ]);
  });

  test("takes first and last points from non-null data indices while preserving gaps", () => {
    const result = paint(type, [null, 4, null, 2, null], {
      negativePoints: false,
      firstPoint: { show: true, color: colors.first },
      lastPoint: { show: true, color: colors.last },
    });
    expect(result.painted.map(({ color }) => color)).toEqual([colors.first, colors.last]);
    expect(result.painted.map(({ x }) => x)).toEqual(type === "line" ? [28, 78] : [33, 73]);
  });

  test.each([
    {
      label: "high over low, first, last and negative",
      patch: {
        highPoint: { show: true, color: colors.high },
        lowPoint: { show: true, color: colors.low },
        firstPoint: { show: true, color: colors.first },
        lastPoint: { show: true, color: colors.last },
      },
      expected: colors.high,
    },
    {
      label: "low over first, last and negative",
      patch: {
        highPoint: { show: false, color: colors.high },
        lowPoint: { show: true, color: colors.low },
        firstPoint: { show: true, color: colors.first },
        lastPoint: { show: true, color: colors.last },
      },
      expected: colors.low,
    },
    {
      label: "first over last and negative",
      patch: {
        firstPoint: { show: true, color: colors.first },
        lastPoint: { show: true, color: colors.last },
      },
      expected: colors.first,
    },
    {
      label: "last over negative",
      patch: { lastPoint: { show: true, color: colors.last } },
      expected: colors.last,
    },
  ])("applies $label", ({ patch, expected }) => {
    const result = paint(type, [-3], { ...patch, negativePoints: true });
    expect(result.painted.map(({ color }) => color)).toEqual([expected]);
  });

  test("retains legacy negative coloring when negativePoints is absent", () => {
    const result = paint(type, [-2, 3], { markers: true });
    expect(result.painted.map(({ color }) => color)).toEqual([colors.negative, colors.series]);
  });

  test("disables negative colors while keeping a chosen general marker color for line markers", () => {
    const result = paint(type, [-2, 3], {
      markers: true,
      negativePoints: false,
      markerColor: colors.marker,
      highPoint: { show: false, color: colors.high },
      lowPoint: { show: false, color: colors.low },
    });
    expect(result.painted.map(({ color }) => color)).toEqual(
      type === "line" ? [colors.marker, colors.marker] : [colors.series, colors.series],
    );
  });
});

describe("line point visibility", () => {
  test("does not add negative markers to a legacy unmarked line", () => {
    expect(paint("line", [-2, 3]).points).toEqual([]);
  });

  test("draws only the selected high point without enabling all markers", () => {
    const result = paint("line", [2, 7, null, 3, 4], {
      highPoint: { show: true, color: colors.high },
    });
    expect(result.points).toEqual([{ x: 28, color: colors.high }]);
  });

  test("draws only negative points when explicitly enabled without general markers", () => {
    const result = paint("line", [-2, null, 3], { negativePoints: true });
    expect(result.points).toEqual([{ x: 3, color: colors.negative }]);
  });

  test("uses negative color ahead of general marker color when negative points are enabled", () => {
    const result = paint("line", [-2, 3], {
      markers: true,
      markerColor: colors.marker,
      negativePoints: true,
    });
    expect(result.points.map(({ color }) => color)).toEqual([colors.negative, colors.marker]);
  });

  test("keeps disabled point colors without creating their markers", () => {
    const definition: Partial<CellSparkline> = {
      negativePoints: false,
      markerColor: colors.marker,
      highPoint: { show: false, color: colors.high },
      lowPoint: { show: false, color: colors.low },
      firstPoint: { show: false, color: colors.first },
      lastPoint: { show: false, color: colors.last },
    };
    const before = structuredClone(definition);
    expect(paint("line", [-2, 3], definition).points).toEqual([]);
    expect(definition).toEqual(before);
  });

  test("keeps the legacy single-data marker fallback", () => {
    expect(paint("line", [-2]).points).toEqual([{ x: 53, color: colors.negative }]);
  });
});

test.each(["column", "winLoss"] as const)(
  "does not paint zero or null %s bars even when point styles are enabled",
  (type) => {
    const result = paint(type, [0, -2, null, 3, 0], {
      highPoint: { show: true, color: colors.high },
      lowPoint: { show: true, color: colors.low },
      firstPoint: { show: true, color: colors.first },
      lastPoint: { show: true, color: colors.last },
    });
    expect(result.bars).toEqual([
      { x: 33, color: colors.low },
      { x: 73, color: colors.high },
    ]);
  },
);
