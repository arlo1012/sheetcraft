import { describe, expect, test } from "vitest";
import type { CellTextLayout } from "../../../../../shared/cell-text/text-presentation";
import { paintCellText } from "../../../../../modules/sheet-grid/canvas/cell-text-painter";

function context() {
  const calls: string[] = [];
  const ctx = {
    calls,
    save: () => calls.push("save"), restore: () => calls.push("restore"),
    translate: (x: number, y: number) => calls.push(`translate:${x},${y}`),
    rotate: (angle: number) => calls.push(`rotate:${angle}`),
    fillText: (text: string, x: number, y: number) => calls.push(`text:${text}@${x},${y}`),
    measureText: (text: string) => ({ width: text.length * 10 }),
    beginPath: () => calls.push("begin"), moveTo: (x: number, y: number) => calls.push(`move:${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`line:${x},${y}`), stroke: () => calls.push("stroke"),
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

const layout: CellTextLayout = {
  direction: "ltr", horizontal: "left", font: { family: "Arial", size: 16, weight: 700, italic: false },
  lineHeight: 20, lines: [{ text: "AB", x: 0, y: 4, width: 80, align: "left" }],
  x: 5, y: 2, width: 80, height: 20, angle: -90, rotationX: 3, rotationY: 7,
};

describe("paintCellText", () => {
  test("uses text layout placement, rotation, direction, and script offset", () => {
    const ctx = context();
    paintCellText(ctx, layout, { fontScript: "superscript" }, "#123456");
    expect(ctx.font).toContain("700 16px");
    expect(ctx.fillStyle).toBe("#123456");
    expect(ctx.direction).toBe("ltr");
    expect(ctx.calls).toContain("translate:8,9");
    expect(ctx.calls).toContain(`rotate:${-Math.PI / 2}`);
    expect(ctx.calls).toContain("translate:0,-5.6");
    expect(ctx.calls).toContain("text:AB@0,4");
  });

  test("spreads justified glyphs and draws double accounting underline with strikethrough", () => {
    const ctx = context();
    paintCellText(ctx, { ...layout, angle: 0, rotationX: 0, rotationY: 0, lines: [{ text: "AB", x: 0, y: 0, width: 40, align: "justify" }] }, { underline: "doubleAccounting", strikethrough: true }, "#000");
    expect(ctx.calls).toContain("text:A@0,0");
    expect(ctx.calls).toContain("text:B@30,0");
    expect(ctx.calls.filter((call) => call === "stroke")).toHaveLength(3);
  });
});
