export type HeaderFooterFormat = {
  fontFamily: string;
  /** OOXML stores the font size in points. */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean | "double";
  strikethrough?: boolean;
  fontScript?: "superscript" | "subscript";
  /** Six-digit RGB without a leading hash. */
  color: string;
};

export type HeaderFooterField =
  | "pageNumber"
  | "pageCount"
  | "sheetName"
  | "fileName"
  | "date"
  | "time";
export type HeaderFooterFieldLabels = Record<HeaderFooterField, string>;
export type HeaderFooterPreviewContext = {
  pageNumber?: number;
  pageCount?: number;
  sheetName: string;
  fileName: string;
  now: Date;
  locale?: string;
};

export type HeaderFooterRun = {
  text: string;
  format: HeaderFooterFormat;
  field?: HeaderFooterField;
};

export const DEFAULT_HEADER_FOOTER_FORMAT: HeaderFooterFormat = {
  fontFamily: "Arial",
  fontSize: 10,
  bold: false,
  italic: false,
  underline: false,
  color: "000000",
};

const FIELD_CODES: Record<string, HeaderFooterField> = {
  P: "pageNumber",
  N: "pageCount",
  A: "sheetName",
  F: "fileName",
  D: "date",
  T: "time",
};

function copyFormat(format: HeaderFooterFormat): HeaderFooterFormat {
  return { ...format };
}

function normalizeColor(value: string): string {
  const color = value.replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : DEFAULT_HEADER_FOOTER_FORMAT.color;
}

function normalizeFormat(format: HeaderFooterFormat): HeaderFooterFormat {
  return {
    fontFamily: format.fontFamily.trim() || DEFAULT_HEADER_FOOTER_FORMAT.fontFamily,
    fontSize: Math.max(
      1,
      Math.min(409, Math.round(format.fontSize) || DEFAULT_HEADER_FOOTER_FORMAT.fontSize),
    ),
    bold: Boolean(format.bold),
    italic: Boolean(format.italic),
    underline: format.underline === "double" ? "double" : Boolean(format.underline),
    ...(format.strikethrough ? { strikethrough: true } : {}),
    ...(format.fontScript ? { fontScript: format.fontScript } : {}),
    color: normalizeColor(format.color),
  };
}

function appendText(runs: HeaderFooterRun[], text: string, format: HeaderFooterFormat): void {
  if (!text) return;
  const previous = runs.at(-1);
  if (
    previous &&
    !previous.field &&
    previous.format.fontFamily === format.fontFamily &&
    previous.format.fontSize === format.fontSize &&
    previous.format.bold === format.bold &&
    previous.format.italic === format.italic &&
    previous.format.underline === format.underline &&
    previous.format.strikethrough === format.strikethrough &&
    previous.format.fontScript === format.fontScript &&
    previous.format.color === format.color
  ) {
    previous.text += text;
  } else {
    runs.push({ text, format: copyFormat(format) });
  }
}

function parseFont(value: string, current: HeaderFooterFormat): HeaderFooterFormat {
  const separator = value.lastIndexOf(",");
  const family = (separator < 0 ? value : value.slice(0, separator)).trim();
  const style = (separator < 0 ? "" : value.slice(separator + 1)).toLowerCase();
  return {
    ...current,
    fontFamily: family || current.fontFamily,
    bold: /bold/.test(style),
    italic: /italic|oblique/.test(style),
  };
}

/** Parses OOXML header/footer text into text and field runs. Unknown controls remain text. */
export function parseHeaderFooterRuns(
  value: string,
  initialFormat: HeaderFooterFormat = DEFAULT_HEADER_FOOTER_FORMAT,
): HeaderFooterRun[] {
  const runs: HeaderFooterRun[] = [];
  let format = normalizeFormat(initialFormat);
  let text = "";
  const flush = () => {
    appendText(runs, text, format);
    text = "";
  };
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "&" || index === value.length - 1) {
      text += value[index]!;
      continue;
    }
    const next = value[index + 1]!;
    if (next === "&") {
      text += "&";
      index += 1;
      continue;
    }
    if (next === '"') {
      const closing = value.indexOf('"', index + 2);
      if (closing < 0) {
        text += "&";
        continue;
      }
      flush();
      format = parseFont(value.slice(index + 2, closing), format);
      index = closing;
      continue;
    }
    if (/\d/.test(next)) {
      const match = value.slice(index + 1).match(/^\d{1,3}/)?.[0];
      if (match) {
        flush();
        format = { ...format, fontSize: Math.max(1, Math.min(409, Number(match))) };
        index += match.length;
        continue;
      }
    }
    if (next === "K" && /^[0-9a-f]{6}$/i.test(value.slice(index + 2, index + 8))) {
      flush();
      format = { ...format, color: value.slice(index + 2, index + 8).toUpperCase() };
      index += 7;
      continue;
    }
    if (next === "B" || next === "I") {
      flush();
      format = {
        ...format,
        ...(next === "B" ? { bold: !format.bold } : { italic: !format.italic }),
      };
      index += 1;
      continue;
    }
    if (next === "U" || next === "E") {
      flush();
      const underline = next === "U" ? true : "double";
      format = { ...format, underline: format.underline === underline ? false : underline };
      index += 1;
      continue;
    }
    if (next === "S") {
      flush();
      format = { ...format, strikethrough: !format.strikethrough || undefined };
      index += 1;
      continue;
    }
    if (next === "X" || next === "Y") {
      flush();
      const script = next === "X" ? "superscript" : "subscript";
      // OOXML ignores the other script while the current script remains enabled.
      if (!format.fontScript || format.fontScript === script) {
        format = { ...format, fontScript: format.fontScript === script ? undefined : script };
      }
      index += 1;
      continue;
    }
    const field = FIELD_CODES[next];
    if (field) {
      flush();
      runs.push({ text: `&${next}`, field, format: copyFormat(format) });
      index += 1;
      continue;
    }
    // Unsupported controls must round-trip as visible text rather than disappearing.
    text += `&${next}`;
    index += 1;
  }
  flush();
  return runs;
}

function previewField(field: HeaderFooterField, context: HeaderFooterPreviewContext): string {
  switch (field) {
    case "pageNumber":
      return String(context.pageNumber ?? 1);
    case "pageCount":
      return String(context.pageCount ?? 1);
    case "sheetName":
      return context.sheetName;
    case "fileName":
      return context.fileName;
    case "date":
      return new Intl.DateTimeFormat(context.locale).format(context.now);
    case "time":
      return new Intl.DateTimeFormat(context.locale, { timeStyle: "short" }).format(context.now);
  }
}

/** Resolves fields while preserving their surrounding OOXML run styles. */
export function previewHeaderFooterRuns(
  value: string,
  context: HeaderFooterPreviewContext,
  initialFormat: HeaderFooterFormat = DEFAULT_HEADER_FOOTER_FORMAT,
): HeaderFooterRun[] {
  return parseHeaderFooterRuns(value, initialFormat).map((run) => ({
    text: run.field ? previewField(run.field, context) : run.text,
    format: copyFormat(run.format),
  }));
}

/** Converts OOXML to friendly editor text such as `&[Page]`, retaining unsupported controls. */
export function decodeHeaderFooterText(value: string, labels: HeaderFooterFieldLabels): string {
  return parseHeaderFooterRuns(value)
    .map((run) => (run.field ? `&[${labels[run.field]}]` : run.text))
    .join("");
}

/** Converts editor text back to OOXML, escaping ordinary ampersands. */
export function encodeHeaderFooterText(
  editorText: string,
  labels: HeaderFooterFieldLabels,
  format: HeaderFooterFormat = DEFAULT_HEADER_FOOTER_FORMAT,
): string {
  const labelsByMarker = Object.entries(labels)
    .map(([field, label]) => ({ field: field as HeaderFooterField, marker: `&[${label}]` }))
    .sort((left, right) => right.marker.length - left.marker.length);
  let encoded = "";
  for (let index = 0; index < editorText.length;) {
    const field = labelsByMarker.find(({ marker }) => editorText.startsWith(marker, index));
    if (field) {
      const code = Object.entries(FIELD_CODES).find(([, value]) => value === field.field)![0];
      encoded += `&${code}`;
      index += field.marker.length;
    } else {
      const character = editorText[index]!;
      encoded += character === "&" ? "&&" : character;
      index += 1;
    }
  }
  return applyHeaderFooterSectionFormat(encoded, format);
}

/** Applies one format to a whole section, retaining fields, line breaks and unknown controls. */
export function applyHeaderFooterSectionFormat(value: string, format: HeaderFooterFormat): string {
  const normalized = normalizeFormat(format);
  let body = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "&" || index === value.length - 1) {
      body += value[index]!;
      continue;
    }
    const next = value[index + 1]!;
    if (next === '"') {
      const closing = value.indexOf('"', index + 2);
      if (closing >= 0) {
        index = closing;
        continue;
      }
    }
    const size = /\d/.test(next) ? value.slice(index + 1).match(/^\d{1,3}/)?.[0] : undefined;
    if (size) {
      index += size.length;
      continue;
    }
    if (next === "K" && /^[0-9a-f]{6}$/i.test(value.slice(index + 2, index + 8))) {
      index += 7;
      continue;
    }
    if (["B", "I", "U", "E", "S", "X", "Y"].includes(next)) {
      index += 1;
      continue;
    }
    body += `&${next}`;
    index += 1;
  }
  const style =
    `${normalized.bold ? "Bold" : ""}${normalized.bold && normalized.italic ? " " : ""}${normalized.italic ? "Italic" : ""}` ||
    "Regular";
  const underline = normalized.underline === "double" ? "&E" : normalized.underline ? "&U" : "";
  const script =
    normalized.fontScript === "superscript"
      ? "&X"
      : normalized.fontScript === "subscript"
        ? "&Y"
        : "";
  return `&"${normalized.fontFamily},${style}"&${normalized.fontSize}&K${normalized.color}${underline}${normalized.strikethrough ? "&S" : ""}${script}${body}`;
}
