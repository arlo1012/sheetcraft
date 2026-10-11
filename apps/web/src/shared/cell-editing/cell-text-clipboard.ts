import { normalizeCellTextFontRuns, type CellTextDocument } from "@sheetcraft/core/text-font-runs";
import { getCellTextGraphemes } from "@sheetcraft/sheet-engine/text-layout";

export const CELL_TEXT_CLIPBOARD_TYPE = "application/x-sheetcraft-cell-text";
export const MAX_CELL_TEXT_CLIPBOARD_LENGTH = 1_000_000;
export const MAX_CELL_TEXT_CLIPBOARD_RUNS = 4096;
export const MAX_CELL_TEXT_CLIPBOARD_PAYLOAD_LENGTH = 2_000_000;

type CellTextClipboardReader = Pick<DataTransfer, "types" | "getData">;
type CellTextClipboardWriter = Pick<DataTransfer, "setData">;

/** Copy and cut use the same whole-grapheme range, with relative scalar font offsets. */
export function sliceCellTextClipboardDocument(
  document: CellTextDocument,
  start: number,
  end: number,
): CellTextDocument & { start: number; end: number } {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start > end ||
    end > document.text.length
  )
    throw new RangeError("Invalid cell text clipboard selection.");
  const runs = normalizeCellTextFontRuns(document.text, document.fontRuns);
  if (start === end) return { text: "", start, end };
  let offset = 0;
  let selectedStart = 0;
  let selectedEnd = document.text.length;
  for (const grapheme of getCellTextGraphemes(document.text)) {
    if (offset <= start) selectedStart = offset;
    offset += grapheme.length;
    if (offset >= end) {
      selectedEnd = offset;
      break;
    }
  }
  const text = document.text.slice(selectedStart, selectedEnd);
  const fontRuns = normalizeCellTextFontRuns(
    text,
    runs
      ?.filter((run) => run.start < selectedEnd && run.end > selectedStart)
      .map((run) => ({
        ...run,
        start: Math.max(selectedStart, run.start) - selectedStart,
        end: Math.min(selectedEnd, run.end) - selectedStart,
      })),
  );
  return { text, ...(fontRuns ? { fontRuns } : {}), start: selectedStart, end: selectedEnd };
}

function boundedFontRuns(document: CellTextDocument) {
  if (
    document.text.length > MAX_CELL_TEXT_CLIPBOARD_LENGTH ||
    (document.fontRuns?.length ?? 0) > MAX_CELL_TEXT_CLIPBOARD_RUNS
  )
    throw new RangeError("Cell text clipboard metadata exceeds its limit.");
  const runs = normalizeCellTextFontRuns(document.text, document.fontRuns);
  if (
    document.fontRuns?.some((run) =>
      [...run.fontFamily].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }),
    )
  )
    throw new TypeError("Cell text clipboard font families cannot contain control characters.");
  return runs;
}

function encodeCellTextClipboard(document: CellTextDocument): string | undefined {
  try {
    const fontRuns = boundedFontRuns(document);
    const payload = JSON.stringify({ version: 1, text: document.text, fontRuns: fontRuns ?? [] });
    return payload.length <= MAX_CELL_TEXT_CLIPBOARD_PAYLOAD_LENGTH ? payload : undefined;
  } catch {
    return undefined;
  }
}

/** MIME is untrusted metadata, never a text source, HTML source, or resource location. */
function decodeCellTextClipboard(payload: string, text: string): CellTextDocument | undefined {
  if (!payload || payload.length > MAX_CELL_TEXT_CLIPBOARD_PAYLOAD_LENGTH) return undefined;
  try {
    const value: unknown = JSON.parse(payload);
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !["version", "text", "fontRuns"].includes(key))
    )
      return undefined;
    const fields = value as Record<string, unknown>;
    if (fields.version !== 1 || fields.text !== text || !Array.isArray(fields.fontRuns))
      return undefined;
    const fontRuns = boundedFontRuns({ text, fontRuns: fields.fontRuns });
    return { text, ...(fontRuns ? { fontRuns } : {}) };
  } catch {
    return undefined;
  }
}

/** Missing/empty plain text leaves the draft intact; invalid metadata safely pastes plain text. */
export function readCellTextClipboard(
  data: CellTextClipboardReader | null,
): CellTextDocument | undefined {
  if (!data) return undefined;
  let text: string;
  try {
    if (!data.types.includes("text/plain")) return undefined;
    text = data.getData("text/plain");
  } catch {
    return undefined;
  }
  if (!text) return undefined;
  try {
    if (data.types.includes(CELL_TEXT_CLIPBOARD_TYPE)) {
      const document = decodeCellTextClipboard(data.getData(CELL_TEXT_CLIPBOARD_TYPE), text);
      if (document) return document;
    }
  } catch {
    /* The readable plain representation remains safe. */
  }
  return { text };
}

/** Rich cut requires both representations; a failed metadata write cannot discard its fonts. */
export function writeCellTextClipboard(
  data: CellTextClipboardWriter | null,
  document: CellTextDocument,
): boolean {
  if (!data) return false;
  try {
    data.setData("text/plain", document.text);
  } catch {
    return false;
  }
  const payload = encodeCellTextClipboard(document);
  if (!payload) return !document.fontRuns?.length;
  try {
    data.setData(CELL_TEXT_CLIPBOARD_TYPE, payload);
  } catch {
    return !document.fontRuns?.length;
  }
  return true;
}
