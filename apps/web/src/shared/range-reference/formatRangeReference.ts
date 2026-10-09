import { formatFormulaAddress, parseFormulaReference } from "@sheetcraft/core/formula";
import type { CellAddress, CellRange, Workbook } from "@sheetcraft/core/workbook";
import { quoteFormulaSheetName } from "../formula-editing/formula-input-lexical";

export type ResolvedRangeReference = Readonly<{ sheetId: string; range: CellRange }>;

/** Formats a range as an absolute, sheet-qualified formula reference. */
export function formatRangeReference(sheetName: string, range: CellRange): string {
  const absolute = (address: CellAddress) =>
    formatFormulaAddress(address).replace(
      /^([A-Z]+)(\d+)$/,
      (_match, column: string, row: string) => `$${column}$${row}`,
    );
  const start = absolute(range.start);
  const end = absolute(range.end);
  return `=${quoteFormulaSheetName(sheetName)}!${start}${start === end ? "" : `:${end}`}`;
}

/** Resolves exactly one A1 range or a visible defined name; expressions and unions are rejected. */
export function resolveRangeReference(
  workbook: Workbook,
  source: string,
  defaultSheetId: string,
): ResolvedRangeReference | undefined {
  if (!workbook.sheets.has(defaultSheetId)) return undefined;
  const text = source.trim().replace(/^=/, "");
  if (!text) return undefined;
  const reference = parseFormulaReference(text, {
    currentSheetId: defaultSheetId,
    resolveSheetId: (name) =>
      [...workbook.sheets.values()].find(
        (sheet) => sheet.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )?.id,
  });
  if (reference) return reference.target;

  const name = text.toLocaleLowerCase();
  const definition =
    [...workbook.definedNames.values()].find(
      (entry) => entry.name.toLocaleLowerCase() === name && entry.scopeSheetId === defaultSheetId,
    ) ??
    [...workbook.definedNames.values()].find(
      (entry) => entry.name.toLocaleLowerCase() === name && entry.scopeSheetId === undefined,
    );
  if (!definition || !workbook.sheets.has(definition.reference.sheetId)) return undefined;
  return {
    sheetId: definition.reference.sheetId,
    range: {
      start: { ...definition.reference.start },
      end: { ...definition.reference.end },
    },
  };
}
