// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test, vi } from "vitest";
import type { CellSparkline, SparklineScale } from "@sheetcraft/core/sparklines";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import { paintSparkline } from "../../../modules/sparklines/sparkline-painter";

const cell = { x: 10, y: 20, width: 106, height: 46 };

// Model the ordinary canvas intersection of rectangular clips so tests can
// distinguish submitted bar rectangles from the portions visible in the plot.
function intersection(rect: Rect, clip: Rect): Rect {
  const x = Math.max(rect.x, clip.x),
    y = Math.max(rect.y, clip.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(rect.x + rect.width, clip.x + clip.width) - x),
    height: Math.max(0, Math.min(rect.y + rect.height, clip.y + clip.height) - y),
  };
}

function paint(
  values: readonly (number | null)[],
  patch: Partial<CellSparkline> = {},
  scale?: SparklineScale,
) {
  const clips: Rect[] = [];
  const visibleBars: Rect[] = [];
  const pointColors: string[] = [],
    barColors: string[] = [];
  let fillStyle = "#000000";
  let pending: Rect | undefined;
  let activeClip: Rect | undefined;
  const context = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(() => {
      pending = undefined;
    }),
    rect: vi.fn((x: number, y: number, width: number, height: number) => {
      pending = { x, y, width, height };
    }),
    clip: vi.fn(() => {
      if (!pending) return;
      activeClip = activeClip ? intersection(pending, activeClip) : { ...pending };
      clips.push({ ...activeClip });
    }),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(() => {
      pointColors.push(fillStyle);
    }),
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      barColors.push(fillStyle);
      const raw = { x, y, width, height };
      const visible = activeClip ? intersection(raw, activeClip) : raw;
      if (visible.width > 0 && visible.height > 0) visibleBars.push(visible);
    }),
  };
  const definition: CellSparkline = {
    type: "line",
    source: null,
    color: "#2563eb",
    negativeColor: "#ef4444",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
    ...patch,
  };
  paintSparkline(context as unknown as CanvasRenderingContext2D, cell, definition, values, scale);
  return { context, clips, visibleBars, pointColors, barColors };
}

describe("sparkline painter axis scales", () => {
  test("places the same value differently when the caller supplies a shared group scale", () => {
    const individual = paint([10, 20]);
    const grouped = paint([10, 20], {}, { min: 0, max: 40 });

    expect(individual.context.moveTo.mock.calls).toEqual([[13, 63]]);
    expect(individual.context.lineTo.mock.calls).toEqual([[113, 23]]);
    expect(grouped.context.moveTo.mock.calls).toEqual([[13, 53]]);
    expect(grouped.context.lineTo.mock.calls).toEqual([[113, 43]]);
  });

  test("adds an inset plot clip for a custom line domain before drawing out-of-range points", () => {
    const result = paint([4.5, 10, 15.5], {
      markers: true,
      minAxis: { type: "custom", value: 5 },
      maxAxis: { type: "custom", value: 15 },
    });

    expect(result.clips).toEqual([cell, { x: 13, y: 23, width: 100, height: 40 }]);
    expect(result.context.clip).toHaveBeenCalledTimes(2);
    expect(result.context.moveTo.mock.calls).toEqual([[13, 65]]);
    expect(result.context.lineTo.mock.calls).toEqual([
      [63, 43],
      [113, 21],
    ]);
    expect(result.context.clip.mock.invocationCallOrder[1]).toBeLessThan(
      result.context.moveTo.mock.invocationCallOrder[0]!,
    );
    expect(result.context.arc.mock.calls.map(([x, y]) => [x, y])).toEqual([
      [13, 65],
      [63, 43],
      [113, 21],
    ]);
  });

  test("uses declared custom limits when no fifth-argument scale is supplied", () => {
    const result = paint([10, 20], {
      minAxis: { type: "custom", value: 0 },
      maxAxis: { type: "custom", value: 40 },
    });
    expect(result.context.moveTo.mock.calls).toEqual([[13, 53]]);
    expect(result.context.lineTo.mock.calls).toEqual([[113, 43]]);
  });

  test("centers a value equal to identical boundaries and projects smaller or greater values outside the cell", () => {
    const result = paint(
      [5, 4, 6],
      {
        markers: true,
        minAxis: { type: "custom", value: 5 },
        maxAxis: { type: "custom", value: 5 },
      },
      { min: 5, max: 5 },
    );
    const points = result.context.arc.mock.calls;

    expect(points[0]?.slice(0, 2)).toEqual([13, 43]);
    expect(points[1]?.[1]).toBeGreaterThan(cell.y + cell.height);
    expect(points[2]?.[1]).toBeLessThan(cell.y);
    expect(
      points.flat().every((value) => typeof value === "number" && Number.isFinite(value)),
    ).toBe(true);
  });

  test.each(["line", "column"] as const)(
    "never submits non-finite %s geometry for equal custom limits",
    (type) => {
      const result = paint([4, 5, 6], {
        type,
        markers: true,
        minAxis: { type: "custom", value: 5 },
        maxAxis: { type: "custom", value: 5 },
      });
      const coordinates = [
        ...result.context.moveTo.mock.calls,
        ...result.context.lineTo.mock.calls,
        ...result.context.arc.mock.calls,
        ...result.context.fillRect.mock.calls,
      ].flat();

      expect(coordinates.length).toBeGreaterThan(0);
      expect(
        coordinates.every((value) => typeof value === "number" && Number.isFinite(value)),
      ).toBe(true);
    },
  );

  test("shows only column segments inside a positive custom range and clips below-minimum bars completely", () => {
    const result = paint([5, 10, 15, 25], {
      type: "column",
      minAxis: { type: "custom", value: 10 },
      maxAxis: { type: "custom", value: 20 },
    });

    expect(result.clips.at(-1)).toEqual({ x: 13, y: 23, width: 100, height: 40 });
    expect(result.context.fillRect.mock.calls).toEqual([
      [16.5, 63, 18, 20],
      [41.5, 63, 18, 1],
      [66.5, 43, 18, 20],
      [91.5, 3, 18, 60],
    ]);
    expect(result.visibleBars).toEqual([
      { x: 66.5, y: 43, width: 18, height: 20 },
      { x: 91.5, y: 23, width: 18, height: 40 },
    ]);
  });

  test("retains the win/loss midpoint and half-height bars even when custom limits are stored", () => {
    const result = paint([5, -15], {
      type: "winLoss",
      minAxis: { type: "custom", value: 10 },
      maxAxis: { type: "custom", value: 20 },
    });

    expect(result.clips).toEqual([cell]);
    expect(result.context.fillRect.mock.calls).toEqual([
      [20, 23, 36, 20],
      [70, 43, 36, 20],
    ]);
  });
});

describe("sparkline right-to-left coordinates", () => {
  test.each(["line", "column", "winLoss"] as const)(
    "mirrors only %s horizontal placement while retaining value and color order",
    (type) => {
      const values = [2, -1, 4];
      const scale = { min: -2, max: 6 };
      const left = paint(values, { type, markers: true, rightToLeft: false }, scale);
      const right = paint(values, { type, markers: true, rightToLeft: true }, scale);
      if (type === "line") {
        expect(left.context.arc.mock.calls.map(([x]) => x)).toEqual([13, 63, 113]);
        expect(right.context.arc.mock.calls.map(([x]) => x)).toEqual([113, 63, 13]);
        expect(right.context.arc.mock.calls.map(([, y]) => y)).toEqual([43, 58, 33]);
        expect(right.context.arc.mock.calls.map(([, y]) => y)).toEqual(
          left.context.arc.mock.calls.map(([, y]) => y),
        );
        expect(right.pointColors).toEqual(left.pointColors);
      } else {
        const original = left.context.fillRect.mock.calls;
        const mirrored = right.context.fillRect.mock.calls;
        expect(mirrored).toHaveLength(3);
        for (let index = 0; index < 3; index++) {
          const source = original[index]!,
            target = mirrored[index]!;
          expect(target[0] + target[2] / 2).toBeCloseTo(126 - (source[0] + source[2] / 2));
          expect(target.slice(1)).toEqual(source.slice(1));
        }
        expect(right.barColors).toEqual(left.barColors);
      }
      expect(values).toEqual([2, -1, 4]);
    },
  );

  test("keeps first and last styling attached to the original non-null source positions", () => {
    const result = paint([null, 4, null, 2, null], {
      rightToLeft: true,
      firstPoint: { show: true, color: "#aa0000" },
      lastPoint: { show: true, color: "#0000aa" },
    });
    expect(result.context.arc.mock.calls.map(([x, y]) => [x, y])).toEqual([
      [88, 23],
      [38, 63],
    ]);
    expect(result.pointColors).toEqual(["#aa0000", "#0000aa"]);
  });
});
