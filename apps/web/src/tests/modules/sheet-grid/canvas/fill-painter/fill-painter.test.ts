import { describe, expect, test } from "vitest";
import { paintCellFill } from "../../../../../modules/sheet-grid/canvas/cell-fill-painter";

function context() {
  const calls: string[] = [];
  const gradient = { addColorStop: (offset: number, color: string) => calls.push(`stop:${offset},${color}`) };
  const ctx = {
    calls, save: () => calls.push("save"), restore: () => calls.push("restore"), beginPath: () => calls.push("begin"),
    rect: () => calls.push("rect"), clip: () => calls.push("clip"), moveTo: () => undefined, lineTo: () => undefined,
    stroke: () => calls.push("stroke"), fillRect: (x: number, y: number, width: number, height: number) => calls.push(`fill:${x},${y},${width},${height}`),
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

describe("paintCellFill", () => {
  test("paints solid surfaces before a repeating workbook pattern", () => {
    const ctx = context();
    paintCellFill(ctx, { x: 2, y: 3, width: 20, height: 20 }, { fillColor: "#fff", fillPattern: "lightGrid", fillPatternColor: "#f00" });
    expect(ctx.calls[0]).toBe("fill:2,3,20,20");
    expect(ctx.calls).toContain("clip");
    expect(ctx.calls).toContain("stroke");
  });

  test("maps linear and path gradients to canvas gradients with bounded stops", () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 };
    const linear = context();
    paintCellFill(linear, rect, { fillGradient: { type: "linear", angle: 0, stops: [{ position: -1, color: "#000" }, { position: 2, color: "#fff" }] } });
    expect(linear.calls).toEqual(expect.arrayContaining(["stop:0,#000", "stop:1,#fff", "fill:0,0,100,50"]));
    const path = context();
    paintCellFill(path, rect, { fillGradient: { type: "path", left: 0.2, right: 0.8, top: 0.2, bottom: 0.8, stops: [{ position: 0, color: "#000" }] } });
    expect(path.calls).toContain("stop:0,#000");
  });
});
