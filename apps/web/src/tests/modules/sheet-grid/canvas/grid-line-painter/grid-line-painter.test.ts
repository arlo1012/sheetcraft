import type { CellStyle } from "@idea10/core/style";
import { describe, expect, test } from "vitest";
import { paintGridLines } from "../../../../../modules/sheet-grid/canvas/grid-line-painter";

type Cell = Parameters<typeof paintGridLines>[1][number];
type Segment = [number, number, number, number];

function cell(x: number, y: number, style?: CellStyle, width = 20, height = 20): Cell {
  return { rect: { x, y, width, height }, style };
}

function drawing(cells: Cell[], zoom = 1, dpr = 1) {
  const segments: Segment[] = [];
  let start = [0, 0];
  const context = {
    getTransform: () => ({
      a: zoom * dpr,
      d: zoom * dpr,
      e: zoom === 1 ? 0 : 0.3,
      f: zoom === 1 ? 0 : -0.65,
    }),
    beginPath() {},
    moveTo(x: number, y: number) {
      start = [x, y];
    },
    lineTo(x: number, y: number) {
      segments.push([start[0]!, start[1]!, x, y]);
    },
    stroke() {},
  } as unknown as CanvasRenderingContext2D;
  paintGridLines(context, cells, "#ddd", zoom);
  return { segments, width: context.lineWidth };
}

function lines(cells: Cell[]): Segment[] {
  return drawing(cells).segments;
}

describe("filled cell gridlines", () => {
  test("keeps default gridlines for cells with only text or border formatting", () => {
    expect(
      lines([cell(0, 0, { textColor: "#f00", borderBottom: { style: "thin", color: "#000" } })]),
    ).toEqual([
      [0, 19.5, 20, 19.5],
      [19.5, 0, 19.5, 20],
    ]);
  });

  test("removes all four edges of a filled cell, including edges drawn by unfilled neighbors", () => {
    const cells = Array.from({ length: 9 }, (_, i) =>
      cell((i % 3) * 20, Math.floor(i / 3) * 20, i === 4 ? { fillColor: "#FEE2E2" } : undefined),
    );
    const result = lines(cells);
    expect(result).not.toContainEqual([20, 19.5, 40, 19.5]);
    expect(result).not.toContainEqual([19.5, 20, 19.5, 40]);
    expect(result).not.toContainEqual([20, 39.5, 40, 39.5]);
    expect(result).not.toContainEqual([39.5, 20, 39.5, 40]);
    expect(result).toHaveLength(14);
  });

  test.each<CellStyle>([
    { fillColor: "#FFFFFF" },
    { fillPattern: "lightGrid" },
    {
      fillGradient: {
        type: "linear",
        angle: 0,
        stops: [
          { position: 0, color: "#fff" },
          { position: 1, color: "#f00" },
        ],
      },
    },
  ])("treats white, pattern and gradient fills as filled surfaces: %o", (style) => {
    expect(lines([cell(0, 0, style)])).toEqual([]);
  });

  test("clips only the covered portion of a merged neighbor's edge", () => {
    expect(
      lines([
        cell(0, 0, undefined, 60, 60),
        cell(20, 60, { fillColor: "#f00" }),
        cell(60, 20, { fillColor: "#f00" }),
      ]),
    ).toEqual([
      [0, 59.5, 20, 59.5],
      [40, 59.5, 60, 59.5],
      [59.5, 0, 59.5, 20],
      [59.5, 40, 59.5, 60],
    ]);
  });

  test("joins masks from adjacent filled cells and restores lines after removing their fills", () => {
    const cells = [
      cell(0, 0, undefined, 60),
      cell(0, 20, { fillColor: "#f00" }),
      cell(20, 20, { fillColor: "#fff" }),
    ];
    expect(lines(cells)).toEqual([
      [40, 19.5, 60, 19.5],
      [59.5, 0, 59.5, 20],
    ]);
    cells[1]!.style = undefined;
    cells[2]!.style = undefined;
    expect(lines(cells)).toContainEqual([0, 19.5, 60, 19.5]);
  });

  test("matches adjacent fractional edges despite floating-point rounding", () => {
    expect(lines([cell(10.1, 0, undefined, 20.2), cell(30.3, 0, { fillColor: "#f00" })])).toEqual([
      [10, 19.5, 30, 19.5],
    ]);
  });

  test.each([
    [1.25, 1, 1],
    [1.5, 1, 1],
    [2, 1, 1],
    [4, 1, 1],
    [1.25, 2, 2],
    [0.8, 1.25, 1],
  ])("keeps grid strokes crisp and thin at zoom %s, DPR %s", (zoom, dpr, physicalWidth) => {
    const { segments, width } = drawing([cell(0.15, 0.3, undefined, 37.25, 19.5)], zoom, dpr);
    const density = zoom * dpr;
    expect(width * density).toBeCloseTo(physicalWidth);
    expect(segments).toHaveLength(2);
    for (const [x1, y1, x2, y2] of segments) {
      const horizontal = y1 === y2;
      const center = horizontal ? y1 * density - 0.65 : x1 * density + 0.3;
      for (const edge of [center - physicalWidth / 2, center + physicalWidth / 2])
        expect(edge).toBeCloseTo(Math.round(edge), 9);
      const ends = horizontal
        ? [x1 * density + 0.3, x2 * density + 0.3]
        : [y1 * density - 0.65, y2 * density - 0.65];
      for (const end of ends) expect(end).toBeCloseTo(Math.round(end), 9);
    }
  });
});
