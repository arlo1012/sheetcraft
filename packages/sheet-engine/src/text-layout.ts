/**
 * Runtime-neutral primitives for matching the cell grid's line breaking in
 * DOM, canvas, and non-browser renderers.
 */
export type AutoRowHeightFont = {
  family: string;
  size: number;
  weight: 400 | 700;
  italic: boolean;
};

export type TextMeasurer = {
  measure: (text: string, font: AutoRowHeightFont) => number;
};

export type CellTextLine = {
  text: string;
  width: number;
  /** True only for the last visual line of an explicit newline paragraph. */
  paragraphEnd: boolean;
};

/** Bounds layout work for malformed or exceptionally large pasted text. */
export const MAX_CELL_TEXT_LAYOUT_LINES = 4_096;

const CJK_GRAPHEME_PATTERN =
  /[\u2e80-\u2fff\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

export function getCellTextGraphemes(text: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    const graphemes: string[] = [];
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      text,
    )) {
      graphemes.push(segment);
    }
    return graphemes;
  }
  return Array.from(text);
}

function getWrapTokens(text: string): string[] {
  const tokens: string[] = [];
  let buffered = "";
  let bufferKind: "space" | "word" | undefined;

  const flush = () => {
    if (!buffered) return;
    tokens.push(buffered);
    buffered = "";
    bufferKind = undefined;
  };

  for (const grapheme of getCellTextGraphemes(text)) {
    if (/\s/u.test(grapheme)) {
      if (bufferKind !== "space") {
        flush();
        bufferKind = "space";
      }
      buffered += grapheme;
    } else if (CJK_GRAPHEME_PATTERN.test(grapheme)) {
      flush();
      tokens.push(grapheme);
    } else {
      if (bufferKind !== "word") {
        flush();
        bufferKind = "word";
      }
      buffered += grapheme;
    }
  }
  flush();
  return tokens;
}

/**
 * Splits text at explicit newlines and, when requested, at the same word,
 * CJK, and long-word boundaries used by automatic row-height measurement.
 */
export function splitCellTextLines(
  text: string,
  availableWidth: number,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
  wrapText: boolean,
): CellTextLine[] {
  const lines: CellTextLine[] = [];
  const normalizedWidth = Math.max(1, availableWidth);
  const append = (line: CellTextLine): boolean => {
    if (lines.length >= MAX_CELL_TEXT_LAYOUT_LINES) return false;
    lines.push(line);
    return lines.length < MAX_CELL_TEXT_LAYOUT_LINES;
  };

  for (const paragraph of text.replace(/\r\n?/gu, "\n").split("\n")) {
    if (!wrapText) {
      if (
        !append({ text: paragraph, width: measurer.measure(paragraph, font), paragraphEnd: true })
      ) {
        break;
      }
      continue;
    }

    let lineText = "";
    let lineWidth = 0;
    const flush = (paragraphEnd: boolean): boolean =>
      append({ text: lineText, width: lineWidth, paragraphEnd });

    for (const token of getWrapTokens(paragraph)) {
      const tokenWidth = measurer.measure(token, font);
      if (lineWidth > 0 && lineWidth + tokenWidth <= normalizedWidth) {
        lineText += token;
        lineWidth += tokenWidth;
        continue;
      }
      if (lineWidth === 0 && tokenWidth <= normalizedWidth) {
        lineText = token;
        lineWidth = tokenWidth;
        continue;
      }
      if (lineWidth > 0) {
        if (!flush(false)) return lines;
        lineText = "";
        lineWidth = 0;
      }
      if (tokenWidth <= normalizedWidth) {
        lineText = token;
        lineWidth = tokenWidth;
        continue;
      }

      for (const grapheme of getCellTextGraphemes(token)) {
        const graphemeWidth = measurer.measure(grapheme, font);
        if (lineWidth > 0 && lineWidth + graphemeWidth > normalizedWidth) {
          if (!flush(false)) return lines;
          lineText = "";
          lineWidth = 0;
        }
        lineText += grapheme;
        lineWidth += graphemeWidth;
      }
    }

    if (!flush(true)) break;
  }
  return lines;
}

export function isCellTextCjkGrapheme(value: string): boolean {
  return CJK_GRAPHEME_PATTERN.test(value);
}
