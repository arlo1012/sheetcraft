import { describe, expect, test } from "vitest";
import type { CellTextLayout } from "../../../../../shared/cell-text/text-presentation";
import {
  clearCanvasTextMetrics,
  paintCellText,
} from "../../../../../modules/sheet-grid/canvas/cell-text-painter";

function context() {
  const calls: string[] = [];
  const ctx = {
    calls,
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate: (x: number, y: number) => calls.push(`translate:${x},${y}`),
    rotate: (angle: number) => calls.push(`rotate:${angle}`),
    fillText: (text: string, x: number, y: number) => calls.push(`text:${text}@${x},${y}`),
    measureText: (text: string) => {
      calls.push(`measure:${text}`);
      return { width: text.length * 10 };
    },
    beginPath: () => calls.push("begin"),
    moveTo: (x: number, y: number) => calls.push(`move:${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`line:${x},${y}`),
    stroke: () => calls.push("stroke"),
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

const layout: CellTextLayout = {
  direction: "ltr",
  horizontal: "left",
  font: { family: "Arial", size: 16, weight: 700, italic: false },
  lineHeight: 20,
  lines: [{ text: "AB", x: 0, y: 4, width: 80, align: "left" }],
  x: 5,
  y: 2,
  width: 80,
  height: 20,
  angle: -90,
  rotationX: 3,
  rotationY: 7,
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
    expect(ctx.calls).toContain("text:AB@0,18.8");
  });

  test("spreads justified CJK glyphs and draws double accounting underline with strikethrough", () => {
    const ctx = context();
    paintCellText(
      ctx,
      {
        ...layout,
        angle: 0,
        rotationX: 0,
        rotationY: 0,
        lines: [{ text: "你好", x: 0, y: 0, width: 40, align: "justify" }],
      },
      { underline: "doubleAccounting", strikethrough: true },
      "#000",
    );
    expect(ctx.calls).toContain("text:你@0,14.8");
    expect(ctx.calls).toContain("text:好@30,14.8");
    expect(ctx.calls.filter((call) => call === "stroke")).toHaveLength(3);
  });

  test("keeps RTL justified words anchored from the right edge", () => {
    const ctx = context();
    paintCellText(
      ctx,
      {
        ...layout,
        direction: "rtl",
        angle: 0,
        rotationX: 0,
        rotationY: 0,
        lines: [{ text: "אב גד", x: 0, y: 0, width: 80, align: "justify" }],
      },
      undefined,
      "#000",
    );
    expect(ctx.textAlign).toBe("right");
    expect(ctx.calls).toContain("text:אב@80,14.8");
  });

  test("uses the workbook text color and each line container's center or right anchor", () => {
    const ctx = context();
    paintCellText(
      ctx,
      {
        ...layout,
        angle: 0,
        rotationX: 0,
        rotationY: 0,
        lines: [
          { text: "center", x: 10, y: 0, width: 80, align: "center" },
          { text: "right", x: 10, y: 20, width: 80, align: "right" },
        ],
      },
      { textColor: "#c00" },
      "#123456",
    );
    expect(ctx.fillStyle).toBe("#c00");
    expect(ctx.calls).toEqual(
      expect.arrayContaining(["text:center@50,14.8", "text:right@90,34.8"]),
    );
  });

  test("measures font box metrics once for all lines sharing a new font", () => {
    const ctx = context();
    paintCellText(
      ctx,
      {
        ...layout,
        font: { ...layout.font, family: "CachedMetrics" },
        angle: 0,
        rotationX: 0,
        rotationY: 0,
        lines: [
          { text: "one", x: 0, y: 0, width: 80, align: "left" },
          { text: "two", x: 0, y: 20, width: 80, align: "left" },
        ],
      },
      undefined,
      "#000",
    );
    expect(ctx.calls.filter((call) => call === "measure:Mg")).toHaveLength(1);
  });

  test("remeasures a fallback font after its browser font face has loaded", () => {
    const current = {
      ...layout,
      font: { ...layout.font, family: "LateLoadingFont" },
      angle: 0,
      rotationX: 0,
      rotationY: 0,
    };
    const fallback = context();
    paintCellText(fallback, current, undefined, "#000");
    clearCanvasTextMetrics();
    const loaded = context();
    paintCellText(loaded, current, undefined, "#000");
    expect(loaded.calls.filter((call) => call === "measure:Mg")).toHaveLength(1);
  });
});
