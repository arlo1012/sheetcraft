import { describe, expect, test, vi } from "vitest";
import { paintCellFill } from "../../../../../modules/sheet-grid/canvas/cell-fill-painter";

function context() {
  const calls: string[] = [];
  const gradient = {
    addColorStop: (offset: number, color: string) => calls.push(`stop:${offset},${color}`),
  };
  const ctx = {
    calls,
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("begin"),
    closePath: () => calls.push("close"),
    translate: (x: number, y: number) => calls.push(`translate:${x},${y}`),
    rect: () => calls.push("rect"),
    clip: () => calls.push("clip"),
    moveTo: (x: number, y: number) => calls.push(`move:${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`line:${x},${y}`),
    stroke: () => calls.push("stroke"),
    fillRect: (x: number, y: number, width: number, height: number) =>
      calls.push(`fill:${x},${y},${width},${height}`),
    createLinearGradient: (...points: number[]) => {
      calls.push(`linear:${points.join(",")}`);
      return gradient;
    },
    createRadialGradient: () => gradient,
    createPattern: () => {
      calls.push("pattern");
      return {} as CanvasPattern;
    },
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

function mockPatternCanvas() {
  const calls: string[] = [];
  const tileContext = {
    beginPath: () => calls.push("begin"),
    moveTo: (x: number, y: number) => calls.push(`move:${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`line:${x},${y}`),
    fillRect: (x: number, y: number, width: number, height: number) =>
      calls.push(`fill:${x},${y},${width},${height}`),
    stroke: () => calls.push("stroke"),
  };
  const tile = { width: 0, height: 0, getContext: () => tileContext };
  const create = vi
    .spyOn(document, "createElement")
    .mockImplementation(((name: string) =>
      name === "canvas" ? tile : document.createElement(name)) as typeof document.createElement);
  return { calls, restore: () => create.mockRestore() };
}

describe("paintCellFill", () => {
  test("paints solid surfaces before a repeating workbook pattern", () => {
    const tiles = mockPatternCanvas();
    const ctx = context();
    paintCellFill(
      ctx,
      { x: 2, y: 3, width: 20, height: 20 },
      { fillColor: "#fff", fillPattern: "lightGrid", fillPatternColor: "#f00" },
    );
    expect(ctx.calls[0]).toBe("fill:2,3,20,20");
    expect(ctx.calls).toEqual(expect.arrayContaining(["translate:2,3", "fill:0,0,20,20"]));
    expect(tiles.calls).toEqual(expect.arrayContaining(["move:4,0", "move:0,4", "stroke"]));
    tiles.restore();
  });

  test("anchors workbook patterns at each cell origin and preserves the SVG tile geometry", () => {
    const tiles = mockPatternCanvas();
    const grid = context();
    paintCellFill(grid, { x: 13, y: 17, width: 8, height: 8 }, { fillPattern: "darkGrid" });
    expect(grid.calls).toEqual(expect.arrayContaining(["translate:13,17", "fill:0,0,8,8"]));
    expect(tiles.calls).toEqual(
      expect.arrayContaining(["move:2,0", "move:6,0", "move:0,2", "move:0,6"]),
    );
    const gray = context();
    paintCellFill(gray, { x: 13, y: 17, width: 4, height: 4 }, { fillPattern: "darkGray" });
    expect(tiles.calls).toEqual(
      expect.arrayContaining(["fill:0,0,2,2", "fill:2,0,2,2", "fill:0,2,2,2"]),
    );
    expect(tiles.calls).not.toContain("fill:2,2,2,2");
    tiles.restore();
  });

  test("reuses a fixed tile for repeated huge cell fills", () => {
    const tiles = mockPatternCanvas();
    const ctx = context();
    const style = { fillPattern: "darkGrid" as const, fillPatternColor: "#123456" };
    paintCellFill(ctx, { x: 0, y: 0, width: 1_000_000, height: 1_000_000 }, style);
    paintCellFill(ctx, { x: 12, y: 8, width: 1_000_000, height: 1_000_000 }, style);
    expect(ctx.calls.filter((call) => call === "pattern")).toHaveLength(1);
    expect(tiles.calls.filter((call) => call.startsWith("move:"))).toHaveLength(4);
    expect(ctx.calls).toEqual(expect.arrayContaining(["fill:0,0,1000000,1000000"]));
    tiles.restore();
  });

  test("maps linear gradients to canvas gradients with bounded stops", () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 };
    const linear = context();
    paintCellFill(linear, rect, {
      fillGradient: {
        type: "linear",
        angle: 0,
        stops: [
          { position: -1, color: "#000" },
          { position: 2, color: "#fff" },
        ],
      },
    });
    expect(linear.calls).toEqual(
      expect.arrayContaining([
        "linear:0,25,100,25",
        "stop:0,#000",
        "stop:1,#fff",
        "fill:0,0,100,50",
      ]),
    );
  });

  test("paints path gradients as four trapezoid bands around the focal rectangle", () => {
    const ctx = context();
    paintCellFill(
      ctx,
      { x: 0, y: 0, width: 100, height: 50 },
      {
        fillGradient: {
          type: "path",
          left: 0.2,
          right: 0.8,
          top: 0.2,
          bottom: 0.8,
          stops: [
            { position: 0, color: "#000" },
            { position: 1, color: "#fff" },
          ],
        },
      },
    );
    expect(ctx.calls).toEqual(
      expect.arrayContaining([
        "linear:0,10,0,0",
        "linear:0,40,0,50",
        "linear:20,0,0,0",
        "linear:80,0,100,0",
        "fill:20,10,60,30",
      ]),
    );
    expect(ctx.calls.filter((call) => call === "clip")).toHaveLength(4);
  });
});
