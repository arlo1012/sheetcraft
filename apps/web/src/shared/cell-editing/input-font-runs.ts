import type { CellContent, CellTextFontRun } from "@sheetcraft/core/formula";
import { formatCellContentForInput } from "@sheetcraft/core/input";
import { normalizeCellTextFontRuns } from "@sheetcraft/core/text-font-runs";

/** Editor offsets include the optional literal-escape apostrophe, unlike stored text. */
function literalPrefixLength(input: string, text: string): number | undefined {
  if (input === text) return 0;
  if (input === `'${text}`) return 1;
  return undefined;
}

export function getInputFontRuns(
  input: string,
  content: CellContent | null | undefined,
): CellTextFontRun[] | undefined {
  if (content?.kind !== "literal" || typeof content.value !== "string") return undefined;
  if (formatCellContentForInput(content) !== input)
    throw new TypeError("Editor text does not match the cell literal.");
  const prefix = literalPrefixLength(input, content.value);
  if (prefix === undefined) throw new TypeError("Unsupported literal input projection.");
  const runs = normalizeCellTextFontRuns(content.value, content.fontRuns);
  return runs?.map((run) => ({ ...run, start: run.start + prefix, end: run.end + prefix }));
}

/** Only a parsed string literal can own character fonts; numeric/formula results never do. */
export function applyInputFontRuns(
  input: string,
  inputFontRuns: readonly CellTextFontRun[] | undefined,
  content: CellContent | null,
): CellContent | null {
  const runs = normalizeCellTextFontRuns(input, inputFontRuns);
  if (content?.kind !== "literal" || typeof content.value !== "string" || !runs) return content;
  const prefix = literalPrefixLength(input, content.value);
  if (prefix === undefined) throw new TypeError("Editor fonts do not match the parsed literal.");
  const mapped = runs
    .filter((run) => run.end > prefix)
    .map((run) => ({ ...run, start: Math.max(prefix, run.start) - prefix, end: run.end - prefix }));
  const fontRuns = normalizeCellTextFontRuns(content.value, mapped);
  return { kind: "literal", value: content.value, ...(fontRuns ? { fontRuns } : {}) };
}
