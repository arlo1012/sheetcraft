import type { CellStyle } from "@idea10/core/style";
import { describe, expect, test } from "vitest";
import { paintGridLines } from "../../../../../modules/sheet-grid/canvas/grid-line-painter";

type Cell = Parameters<typeof paintGridLines>[1][number];
type Segment = [number, number, number, number];

function cell(x: number, y: number, style?: CellStyle, width = 20, height = 20): Cell {
  return { rect: { x, y, width, height }, style };
}

function lines(cells: Cell[]): Segment[] {
  const segments: Segment[] = [];
  let start = [0, 0];
  const context = {
    beginPath() {},
    moveTo(x: number, y: number) {
      start = [x, y];
    },
    lineTo(x: number, y: number) {
      segments.push([start[0]!, start[1]!, x, y]);
    },
    stroke() {},
  } as unknown as CanvasRenderingContext2D;
  paintGridLines(context, cells, "#ddd");
  return segments;
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
    expect(lines([cell(0.1, 0, undefined, 0.2), cell(0.3, 0, { fillColor: "#f00" })])).toEqual([
      [0.1, 19.5, 0.1 + 0.2, 19.5],
    ]);
  });
});
