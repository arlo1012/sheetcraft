import { describe, expect, test } from "vitest";
import { createCanvasPixelGrid } from "../../../shared/canvas/pixel-grid";

function context(density: number, x = 0, y = 0): CanvasRenderingContext2D {
  return {
    getTransform: () => ({ a: density, d: density, e: x, f: y }),
  } as unknown as CanvasRenderingContext2D;
}
const isPixelEdge = (value: number) => expect(value).toBeCloseTo(Math.round(value), 9);

describe("canvas pixel grid", () => {
  test.each([
    [1, 1, 1],
    [1.25, 1, 1],
    [2, 1, 1],
    [4, 1, 1],
    [1.25, 2, 2],
    [0.8, 1.25, 1],
    [1.75, 1.5, 2],
  ])("keeps screen hairlines stable at zoom %s and DPR %s", (zoom, dpr, physicalWidth) => {
    const density = zoom * dpr;
    const grid = createCanvasPixelGrid(context(density, 0.3, -0.65), zoom);
    const width = grid.screenStrokeWidth(1);
    expect(width * density).toBeCloseTo(physicalWidth);
    for (const center of [0, 19.25, 37.9]) {
      const x = grid.strokeX(center, width) * density + 0.3;
      const y = grid.strokeY(center, width) * density - 0.65;
      isPixelEdge(x - (width * density) / 2);
      isPixelEdge(x + (width * density) / 2);
      isPixelEdge(y - (width * density) / 2);
      isPixelEdge(y + (width * density) / 2);
    }
  });

  test("preserves document weight while quantizing hair, thin and thick strokes", () => {
    const grid = createCanvasPixelGrid(context(2), 2);
    expect(grid.strokeWidth(0.5) * 2).toBe(1);
    expect(grid.strokeWidth(1) * 2).toBe(2);
    expect(grid.strokeWidth(3) * 2).toBe(6);
    expect(grid.screenStrokeWidth(1) * 2).toBe(1);
    expect(createCanvasPixelGrid(context(0.1), 0.1).strokeWidth(0.5) * 0.1).toBe(1);
  });

  test("gives adjacent pane clips exactly the same physical boundary", () => {
    const density = 1.25;
    const grid = createCanvasPixelGrid(context(density, 0.3, -0.65), 1.25);
    const frozen = grid.snapRect({ x: 0, y: 0, width: 37.25, height: 19.5 });
    const body = grid.snapRect({ x: 37.25, y: 19.5, width: 80.4, height: 60.2 });
    expect(frozen.x + frozen.width).toBeCloseTo(body.x);
    expect(frozen.y + frozen.height).toBeCloseTo(body.y);
    for (const rect of [frozen, body]) {
      isPixelEdge(rect.x * density + 0.3);
      isPixelEdge((rect.x + rect.width) * density + 0.3);
      isPixelEdge(rect.y * density - 0.65);
      isPixelEdge((rect.y + rect.height) * density - 0.65);
    }
  });
});
