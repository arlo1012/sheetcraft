import {
  DEFAULT_CELL_FONT_FAMILY,
  DEFAULT_CELL_FONT_SIZE,
  type CellStyle,
  type CellTextDirection,
  type HorizontalCellAlignment,
} from "@idea10/core/style";
import type { FormulaValue } from "@idea10/core/formula";
import type { CellNumberFormatPresentation } from "@idea10/core/number-format";
import {
  getCellTextGraphemes,
  splitCellTextLines,
  MAX_CELL_TEXT_LAYOUT_LINES,
} from "@idea10/sheet-engine/text-layout";
import {
  WRAPPED_CELL_LINE_HEIGHT,
  type AutoRowHeightFont,
  type TextMeasurer,
} from "@idea10/sheet-engine/row-height";
import { getCellTextRenderFontSize } from "./font-presentation";

export type ResolvedCellTextAlignment =
  | "left"
  | "center"
  | "right"
  | "fill"
  | "justify"
  | "distributed";
export type CellTextLine = Readonly<{
  text: string;
  x: number;
  y: number;
  width: number;
  align: "left" | "right" | "center" | "justify";
}>;
export type CellTextLayout = Readonly<{
  direction: "ltr" | "rtl";
  horizontal: ResolvedCellTextAlignment;
  font: AutoRowHeightFont;
  lineHeight: number;
  lines: readonly CellTextLine[];
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  rotationX: number;
  rotationY: number;
}>;

export function resolveCellTextDirection(
  text: string,
  direction?: CellTextDirection,
): "ltr" | "rtl" {
  if (direction === "ltr" || direction === "rtl") return direction;
  // OOXML context checks the first non-whitespace character, including numbers.
  const first = text.trimStart()[Symbol.iterator]().next().value ?? "";
  const code = first.codePointAt(0) ?? 0;
  const rtlBlock =
    (code >= 0x590 && code <= 0x8ff) ||
    (code >= 0xfb1d && code <= 0xfdff) ||
    (code >= 0xfe70 && code <= 0xfefc) ||
    (code >= 0x10800 && code <= 0x10fff) ||
    (code >= 0x1e800 && code <= 0x1efff);
  return first === "\u200f" || (rtlBlock && /\p{Letter}/u.test(first)) ? "rtl" : "ltr";
}

export function resolveCellHorizontalAlignment(
  alignment: HorizontalCellAlignment | undefined,
  value: FormulaValue | undefined,
  direction: "ltr" | "rtl",
): ResolvedCellTextAlignment {
  if (alignment === "centerContinuous") return "center";
  if (alignment && alignment !== "general") return alignment;
  if (typeof value === "number") return "right";
  if (typeof value === "boolean" || (value !== null && typeof value === "object")) return "center";
  return direction === "rtl" ? "right" : "left";
}

export function isCellTextWrapped(style?: Readonly<CellStyle>): boolean {
  return (
    Boolean(style?.wrapText) ||
    style?.horizontalAlign === "justify" ||
    style?.horizontalAlign === "distributed"
  );
}

export function getCellTextFont(style?: Readonly<CellStyle>): AutoRowHeightFont {
  return {
    family: style?.fontFamily ?? DEFAULT_CELL_FONT_FAMILY,
    size: style?.fontSize ?? DEFAULT_CELL_FONT_SIZE,
    weight: style?.bold ? 700 : 400,
    italic: Boolean(style?.italic),
  };
}

/** The measurement font mirrors rendered scripts without mutating workbook style data. */
export function getCellTextRenderFont(style?: Readonly<CellStyle>): AutoRowHeightFont {
  return { ...getCellTextFont(style), size: getCellTextRenderFontSize(style) };
}

export function getCellIndentPixels(
  style: Readonly<CellStyle> | undefined,
  measurer: TextMeasurer,
): number {
  if (
    !style?.indent ||
    !["left", "right", "distributed"].includes(style.horizontalAlign ?? "general")
  )
    return 0;
  // Indent units are three spaces in the workbook's normal font, not the cell's font.
  return style.indent * measurer.measure("   ", getCellTextFont());
}

function expandedNumberFill(
  text: string,
  fill: CellNumberFormatPresentation["fill"],
  width: number,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
): string {
  if (!fill) return text;
  const characterWidth = measurer.measure(fill.character, font);
  const remaining = width - measurer.measure(fill.before + fill.after, font);
  const repetitions =
    characterWidth > 0 ? Math.min(10000, Math.max(0, Math.floor(remaining / characterWidth))) : 0;
  return fill.before + fill.character.repeat(repetitions) + fill.after;
}

export function layoutCellText(options: {
  text: string;
  value?: FormulaValue;
  style?: Readonly<CellStyle>;
  fill?: CellNumberFormatPresentation["fill"];
  width: number;
  height: number;
  measurer: TextMeasurer;
}): CellTextLayout {
  const { text, value, style, measurer } = options;
  const direction = resolveCellTextDirection(text, style?.textDirection);
  const horizontal = resolveCellHorizontalAlignment(style?.horizontalAlign, value, direction);
  const wrap = isCellTextWrapped(style);
  const multiline = wrap || /[\r\n]/u.test(text);
  const indent = getCellIndentPixels(style, measurer);
  const leftInset =
    (horizontal === "right" && !multiline ? 0 : 5) +
    (horizontal === "left" || horizontal === "distributed" ? indent : 0);
  const rightInset =
    (horizontal === "left" && !multiline ? 0 : 5) +
    (horizontal === "right" || horizontal === "distributed" ? indent : 0);
  const availableWidth = Math.max(1, options.width - leftInset - rightInset);
  const availableHeight = Math.max(0, options.height - 4);
  let font = getCellTextRenderFont(style);
  let lineHeight = font.size * WRAPPED_CELL_LINE_HEIGHT;
  const angle = typeof style?.textRotation === "number" ? -style.textRotation : 0;
  const radians = (angle * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const stacked = style?.textRotation === "vertical";
  let renderedText = expandedNumberFill(text, options.fill, availableWidth, font, measurer);
  if (style?.shrinkToFit && !multiline && !stacked && horizontal !== "fill") {
    const naturalWidth = measurer.measure(renderedText, font);
    const rotatedWidth = naturalWidth * Math.abs(cosine) + lineHeight * Math.abs(sine);
    const factor = rotatedWidth > 0 ? Math.min(1, availableWidth / rotatedWidth) : 1;
    font = { ...font, size: Math.max(1, font.size * factor) };
    lineHeight = font.size * WRAPPED_CELL_LINE_HEIGHT;
  }
  if (horizontal === "fill" && text) {
    const textWidth = measurer.measure(renderedText, font);
    const count =
      textWidth > 0 ? Math.min(10000, Math.max(1, Math.floor(availableWidth / textWidth))) : 1;
    renderedText = renderedText.repeat(count);
  }

  let lines: CellTextLine[] = [];
  let width: number;
  let naturalHeight: number;
  const vertical = style?.verticalAlign ?? "bottom";
  if (stacked) {
    const columns = renderedText.replace(/\r\n?/gu, "\n").split("\n").map(getCellTextGraphemes);
    const columnWidth = columns.reduce(
      (widest, column) =>
        column.reduce((current, char) => Math.max(current, measurer.measure(char, font)), widest),
      font.size,
    );
    width = Math.max(1, columns.length * columnWidth);
    naturalHeight =
      columns.reduce((longest, column) => Math.max(longest, column.length), 1) * lineHeight;
    const visibleRows = Math.ceil(availableHeight / lineHeight) + 1;
    const horizontalOffset =
      horizontal === "right"
        ? availableWidth - width
        : horizontal === "center"
          ? (availableWidth - width) / 2
          : 0;
    columns.forEach((column, columnIndex) => {
      const x =
        (direction === "rtl" ? columns.length - columnIndex - 1 : columnIndex) * columnWidth;
      if (x + horizontalOffset + columnWidth < 0 || x + horizontalOffset > availableWidth) return;
      for (let index = 0; index < Math.min(column.length, visibleRows); index += 1) {
        if (lines.length >= MAX_CELL_TEXT_LAYOUT_LINES) break;
        lines.push({
          text: column[index]!,
          x,
          y: index * lineHeight,
          width: columnWidth,
          align: "center",
        });
      }
    });
  } else {
    const paragraphs = splitCellTextLines(renderedText, availableWidth, font, measurer, wrap);
    width =
      wrap || options.fill || horizontal === "fill"
        ? availableWidth
        : Math.max(1, ...paragraphs.map((line) => line.width));
    naturalHeight = paragraphs.length * lineHeight;
    const spare = Math.max(0, availableHeight - naturalHeight);
    const spread =
      angle === 0 &&
      paragraphs.length > 1 &&
      (vertical === "justify" || vertical === "distributed");
    const gap = spread
      ? spare / (vertical === "distributed" ? paragraphs.length : paragraphs.length - 1)
      : 0;
    lines = paragraphs.map((line, index) => {
      const justified =
        horizontal === "distributed" || (horizontal === "justify" && !line.paragraphEnd);
      const canExpand =
        /\s/u.test(line.text.trim()) ||
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(line.text);
      const align =
        justified && canExpand
          ? "justify"
          : horizontal === "distributed"
            ? "center"
            : horizontal === "right" || horizontal === "center"
              ? horizontal
              : direction === "rtl" && horizontal === "justify"
                ? "right"
                : "left";
      return {
        text: line.text,
        x: 0,
        y: index * (lineHeight + gap) + (spread && vertical === "distributed" ? gap / 2 : 0),
        width,
        align,
      };
    });
    if (spread) naturalHeight = availableHeight;
  }
  const minimumX = Math.min(
    0,
    width * cosine,
    -naturalHeight * sine,
    width * cosine - naturalHeight * sine,
  );
  const minimumY = Math.min(
    0,
    width * sine,
    naturalHeight * cosine,
    width * sine + naturalHeight * cosine,
  );
  const rotatedWidth = width * Math.abs(cosine) + naturalHeight * Math.abs(sine);
  const rotatedHeight = width * Math.abs(sine) + naturalHeight * Math.abs(cosine);
  const x =
    leftInset +
    (horizontal === "right"
      ? availableWidth - rotatedWidth
      : horizontal === "center"
        ? (availableWidth - rotatedWidth) / 2
        : 0);
  const y =
    2 +
    Math.max(
      0,
      vertical === "bottom"
        ? availableHeight - rotatedHeight
        : vertical === "middle" || vertical === "distributed"
          ? (availableHeight - rotatedHeight) / 2
          : 0,
    );
  return {
    direction,
    horizontal,
    font,
    lineHeight,
    lines,
    x,
    y,
    width,
    height: naturalHeight,
    angle,
    rotationX: -minimumX,
    rotationY: -minimumY,
  };
}
