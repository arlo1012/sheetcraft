import { describe, expect, test } from "vitest";
import { layoutCellText } from "../../../../../shared/cell-text/text-presentation";
import { paintCellText } from "../../../../../modules/sheet-grid/canvas/cell-text-painter";

type Draw = { text: string; x: number; y: number; font: string };
function context() {
  const draws: Draw[] = [];
  const strokes: number[][] = [];
  const ctx = {
    font: "",
    draws,
    strokes,
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    fillText(text: string, x: number, y: number) {
      draws.push({ text, x, y, font: this.font });
    },
    measureText(text: string) {
      return {
        width: text.length * (this.font.includes("Symbols") ? 10 : 5),
        fontBoundingBoxAscent: 8,
        fontBoundingBoxDescent: 2,
      };
    },
    beginPath() {
      strokes.push([]);
    },
    moveTo(x: number, y: number) {
      strokes.at(-1)!.push(x, y);
    },
    lineTo(x: number, y: number) {
      strokes.at(-1)!.push(x, y);
    },
    stroke() {},
  };
  return ctx as unknown as CanvasRenderingContext2D & { draws: Draw[]; strokes: number[][] };
}
const measurer = {
  measure: (text: string, font: { family: string }) =>
    text.length * (font.family === "Symbols" ? 10 : 5),
  measureMetrics: (text: string, font: { family: string }) => ({
    width: text.length * (font.family === "Symbols" ? 10 : 5),
    ascent: font.family === "Symbols" ? 14 : 8,
    descent: font.family === "Symbols" ? 4 : 2,
  }),
};
const options = {
  text: "A☀B",
  fontRuns: [{ start: 1, end: 2, fontFamily: "Symbols" }],
  style: { fontFamily: "Base", fontSize: 10, bold: true as const, italic: true as const },
  width: 100,
  height: 100,
  measurer,
};

describe("attributed canvas text", () => {
  test("paints complete family spans on one actual-extents baseline with inherited size, weight, italic", () => {
    const ctx = context();
    const layout = layoutCellText(options);
    paintCellText(ctx, layout, undefined, "#000");
    expect(ctx.draws.map((draw) => [draw.text, draw.x, draw.y])).toEqual([
      ["A", 0, 14],
      ["☀", 5, 14],
      ["B", 15, 14],
    ]);
    expect(ctx.draws.map((draw) => draw.font)).toEqual([
      'italic 700 10px "Base"',
      'italic 700 10px "Symbols"',
      'italic 700 10px "Base"',
    ]);
  });

  test("centers and decorates the total measured line, without font-boundary gaps", () => {
    const ctx = context();
    const layout = layoutCellText(options);
    paintCellText(
      ctx,
      { ...layout, lines: [{ ...layout.lines[0]!, width: 80, align: "center" }] },
      { underline: true, strikethrough: true },
      "#000",
    );
    expect(ctx.draws.map((draw) => draw.x)).toEqual([30, 35, 45]);
    expect(ctx.strokes[0]).toEqual([30, 15, 50, 15]);
    expect(ctx.strokes[1]?.filter((_, index) => index % 2 === 0)).toEqual([30, 50]);
  });

  test("justifies by whole-word spacing even when a word crosses a font boundary", () => {
    const ctx = context();
    const layout = layoutCellText({
      ...options,
      text: "AB CD",
      fontRuns: [{ start: 1, end: 2, fontFamily: "Symbols" }],
    });
    paintCellText(
      ctx,
      { ...layout, lines: [{ ...layout.lines[0]!, width: 70, align: "justify" }] },
      { underline: true },
      "#000",
    );
    expect(ctx.draws.map((draw) => [draw.text, draw.x])).toEqual([
      ["A", 0],
      ["B", 5],
      [" ", 15],
      ["CD", 60],
    ]);
    expect(ctx.strokes[0]?.filter((_, index) => index % 2 === 0)).toEqual([0, 70]);
  });

  test("distributed CJK gaps are between graphemes, preserving the grapheme's family", () => {
    const ctx = context();
    const layout = layoutCellText({
      ...options,
      text: "你好世界",
      fontRuns: [{ start: 1, end: 2, fontFamily: "Symbols" }],
    });
    paintCellText(
      ctx,
      { ...layout, lines: [{ ...layout.lines[0]!, width: 55, align: "justify" }] },
      undefined,
      "#000",
    );
    expect(ctx.draws.map((draw) => [draw.text, draw.x])).toEqual([
      ["你", 0],
      ["好", 15],
      ["世", 35],
      ["界", 50],
    ]);
  });

  test("same effective family stays a single Canvas call, including bidi", () => {
    const ctx = context();
    const layout = layoutCellText({
      ...options,
      text: "AאבB",
      fontRuns: [{ start: 0, end: 4, fontFamily: "Symbols" }],
    });
    paintCellText(ctx, layout, undefined, "#000");
    expect(ctx.draws.map((draw) => draw.text)).toEqual(["AאבB"]);
    expect(ctx.draws[0]?.font).toContain('"Symbols"');
  });

  test("mixed bidi leaves the entire paragraph to the native overlay without drawing reordered fragments", () => {
    const ctx = context();
    const layout = layoutCellText({
      ...options,
      text: "AאבB",
      fontRuns: [{ start: 1, end: 3, fontFamily: "Symbols" }],
    });
    paintCellText(ctx, layout, { underline: true }, "#000", { attributedBidiMode: "dom" });
    expect(layout.canvasBidiRequired).toBe(true);
    expect(ctx.draws).toEqual([]);
    expect(ctx.strokes).toEqual([]);
  });
  test("Canvas-only consumers retain the whole mixed-bidi text instead of omitting it", () => {
    const ctx = context();
    const layout = layoutCellText({
      ...options,
      text: "AאבB",
      fontRuns: [{ start: 1, end: 3, fontFamily: "Symbols" }],
    });
    paintCellText(ctx, layout, undefined, "#000");
    expect(ctx.draws.map((draw) => draw.text)).toEqual(["AאבB"]);
    expect(ctx.draws[0]?.font).toContain('"Base"');
  });
});
