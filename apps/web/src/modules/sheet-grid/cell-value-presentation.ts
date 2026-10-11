import {
  formatCellNumberValue,
  type CellNumberFormatPresentation,
} from "@sheetcraft/core/number-format";
import type { ExcelDateSystem, FormulaValue } from "@sheetcraft/core/formula";
import type { CellStyle } from "@sheetcraft/core/style";
import type { CellContent, CellTextFontRun } from "@sheetcraft/core/formula";
import { normalizeCellTextFontRuns } from "@sheetcraft/core/text-font-runs";

export type GridCellValuePresentation = Readonly<{
  text: string;
  color?: string;
  fill?: CellNumberFormatPresentation["fill"];
  fontRuns?: readonly CellTextFontRun[];
  fillFontRuns?: Readonly<{
    before?: readonly CellTextFontRun[];
    after?: readonly CellTextFontRun[];
  }>;
  /** Formatting could not be proven to preserve the source character positions. */
  fontProjectionUnavailable?: true;
}>;

export function getCellValuePresentationForGrid(
  value: FormulaValue,
  style: Readonly<CellStyle> | undefined,
  locale: string,
  dateSystem: ExcelDateSystem,
  content?: CellContent | null,
): GridCellValuePresentation {
  const presentation = formatCellNumberValue(value, style?.numberFormat, { locale, dateSystem });
  if (
    content?.kind !== "literal" ||
    typeof content.value !== "string" ||
    content.value !== value ||
    !content.fontRuns?.length
  )
    return presentation;
  const rawText = content.value;
  const runs = normalizeCellTextFontRuns(rawText, content.fontRuns)!;
  // Format one unique literal marker through the same string-value branch. Only
  // publish a mapping if replacing every marker reconstructs the real result.
  // This also handles repeated @ placeholders and literal text identical to the
  // cell value without searching for the raw value in the formatted result.
  let sequence = 0;
  let marker: string;
  do marker = `\uFDD0sheetcraft-text-${sequence++}\uFDD1`;
  while (
    rawText.includes(marker) ||
    presentation.text.includes(marker) ||
    (JSON.stringify(style?.numberFormat) ?? "").includes(marker)
  );
  const marked = formatCellNumberValue(marker, style?.numberFormat, { locale, dateSystem });
  function project(markedText: string, expected: string) {
    const parts = markedText.split(marker);
    const projected: CellTextFontRun[] = [];
    let text = parts[0]!;
    for (let index = 1; index < parts.length; index++) {
      const offset = text.length;
      projected.push(
        ...runs.map((run) => ({
          ...run,
          start: run.start + offset,
          end: run.end + offset,
        })),
      );
      text += rawText;
      text += parts[index]!;
    }
    if (text !== expected) return undefined;
    return { fontRuns: normalizeCellTextFontRuns(text, projected) };
  }
  const mapped = project(marked.text, presentation.text);
  const before =
    presentation.fill && marked.fill
      ? project(marked.fill.before, presentation.fill.before)
      : undefined;
  const after =
    presentation.fill && marked.fill
      ? project(marked.fill.after, presentation.fill.after)
      : undefined;
  if (
    !mapped ||
    Boolean(presentation.fill) !== Boolean(marked.fill) ||
    (presentation.fill &&
      (!before || !after || presentation.fill.character !== marked.fill?.character))
  )
    return { ...presentation, fontProjectionUnavailable: true };
  return {
    ...presentation,
    ...(mapped.fontRuns ? { fontRuns: mapped.fontRuns } : {}),
    ...(presentation.fill
      ? {
          fillFontRuns: {
            ...(before?.fontRuns ? { before: before.fontRuns } : {}),
            ...(after?.fontRuns ? { after: after.fontRuns } : {}),
          },
        }
      : {}),
  };
}

/** Kept for callers that only need the rendered cell text. */
export function formatCellValueForGrid(
  value: FormulaValue,
  style: Readonly<CellStyle> | undefined,
  locale: string,
  dateSystem: ExcelDateSystem = "1900",
): string {
  return getCellValuePresentationForGrid(value, style, locale, dateSystem).text;
}
