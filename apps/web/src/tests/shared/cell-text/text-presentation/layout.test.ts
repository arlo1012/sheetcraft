import { describe, expect, test } from "vitest";
import type { CellStyle } from "@idea10/core/style";
import {
  layoutCellText,
  resolveCellTextDirection,
} from "../../../../shared/cell-text/text-presentation";

const measurer = {
  measure: (text: string, font: { size: number }) => (Array.from(text).length * font.size) / 2,
};
const layout = (text: string, style?: CellStyle, height = 100) =>
  layoutCellText({ text, style, width: 100, height, measurer });

describe("cell text layout", () => {
  test("general alignment follows the value type and contextual reading direction", () => {
    expect(
      layoutCellText({ text: "123", value: 123, width: 100, height: 24, measurer }).horizontal,
    ).toBe("right");
    expect(
      layoutCellText({ text: "TRUE", value: true, width: 100, height: 24, measurer }).horizontal,
    ).toBe("center");
    expect(layout("שלום").horizontal).toBe("right");
    expect(resolveCellTextDirection(" 123 שלום")).toBe("ltr");
    expect(resolveCellTextDirection("abc", "rtl")).toBe("rtl");
  });

  test("indent uses three normal-font spaces regardless of the cell font size", () => {
    expect(layout("a", { horizontalAlign: "left", indent: 2, fontSize: 30 }).x).toBe(44);
    expect(layout("a", { horizontalAlign: "center", indent: 2 }).x).toBe(
      layout("a", { horizontalAlign: "center" }).x,
    );
    expect(layout("a", { horizontalAlign: "distributed", indent: 1 }).width).toBe(51);
  });

  test("shrink changes the rendered font only and yields to wrapped text", () => {
    const style: CellStyle = { shrinkToFit: true, fontSize: 20 };
    const shrunk = layout("12345678901234567890", style);
    expect(shrunk.font.size).toBeLessThan(20);
    expect(shrunk.width).toBeLessThanOrEqual(95);
    expect(style.fontSize).toBe(20);
    const wrapped = layout("12345678901234567890", { ...style, wrapText: true });
    expect(wrapped.font.size).toBe(20);
    expect(wrapped.lines.length).toBeGreaterThan(1);
  });

  test("measures superscript and subscript at their rendered size without changing the style", () => {
    const style: CellStyle = { fontSize: 20, fontScript: "superscript" };
    const superscript = layout("1234567890", style);
    const baseline = layout("1234567890", { fontSize: 20 });
    expect(superscript.font.size).toBe(15);
    expect(superscript.width).toBeLessThan(baseline.width);
    expect(style.fontSize).toBe(20);
    expect(layout("1234567890", { fontSize: 20, fontScript: "subscript" }).font.size).toBe(15);
  });

  test("fill repeats complete values and number-format fill keeps its suffix", () => {
    const result = layout("ab", { horizontalAlign: "fill" });
    expect(result.lines[0]?.text).toBe("ab".repeat(6));
    const number = layoutCellText({
      text: "12 kg",
      fill: { before: "12", character: ".", after: " kg" },
      width: 100,
      height: 24,
      measurer,
    });
    expect(number.lines[0]?.text).toMatch(/^12\.+ kg$/u);
  });

  test("justify preserves paragraph endings while distributed expands every line", () => {
    const justified = layout("one two three four five", { horizontalAlign: "justify" });
    expect(justified.lines[0]?.align).toBe("justify");
    expect(justified.lines.at(-1)?.align).toBe("left");
    const distributed = layout("one two\nthree four", { horizontalAlign: "distributed" });
    expect(distributed.lines.map((line) => line.align)).toEqual(["justify", "justify"]);
  });

  test("vertical justify and distributed allocate their remaining height", () => {
    const justified = layout("a\nb", { verticalAlign: "justify" });
    expect(justified.lines[0]?.y).toBe(0);
    expect(justified.lines[1]!.y + justified.lineHeight).toBe(96);
    const distributed = layout("a\nb", { verticalAlign: "distributed" });
    expect(distributed.lines[0]!.y).toBeGreaterThan(0);
    expect(distributed.lines[1]!.y + distributed.lineHeight).toBeLessThan(96);
  });

  test("positive rotation rises to the right and keeps its bounding box aligned", () => {
    const rotated = layout("ABCD", {
      textRotation: 90,
      horizontalAlign: "center",
      verticalAlign: "middle",
    });
    expect(rotated.angle).toBe(-90);
    expect(rotated.x).toBeCloseTo((100 - rotated.lineHeight) / 2);
    expect(rotated.y).toBeCloseTo((100 - rotated.width) / 2);
    expect(rotated.rotationY).toBeCloseTo(rotated.width);
  });

  test("stacked text preserves graphemes, newline columns, and bounds DOM work", () => {
    const stacked = layout("👨‍👩‍👧‍👦A\nBC", { textRotation: "vertical" });
    expect(stacked.lines.map((line) => line.text)).toEqual(["👨‍👩‍👧‍👦", "A", "B", "C"]);
    expect(stacked.height).toBe(2 * stacked.lineHeight);
    const long = layout("A".repeat(10000), { textRotation: "vertical" }, 24);
    expect(long.lines.length).toBeLessThanOrEqual(3);
    expect(long.height).toBeGreaterThan(10000);
  });
});
