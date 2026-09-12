import { formatFormulaReference, parseFormulaReference } from "./reference-model.js";
import type { FormulaAddress } from "./types.js";
import type { Workbook } from "../workbook.js";

const REFERENCE_PATTERN =
  /(?:'(?:[^']|'')*'|[A-Za-z0-9_.]+)!\$?[A-Za-z]+\$?[1-9]\d*(?::\$?[A-Za-z]+\$?[1-9]\d*)?/g;

/** Rewrites qualified references to one sheet while retaining sparse cell storage. */
export function rewriteQualifiedReferencesForSheet(
  workbook: Workbook,
  targetSheetId: string,
  transform: ((address: FormulaAddress) => FormulaAddress | null) | null,
): void {
  const sheetsByName = () =>
    [...workbook.sheets.values()].reduce(
      (result, sheet) => result.set(sheet.name.toLowerCase(), sheet.id),
      new Map<string, string>(),
    );
  for (const sheet of workbook.sheets.values()) {
    for (const [key, cell] of sheet.cells) {
      if (cell.content?.kind !== "formula") continue;
      const replacements: Array<{ start: number; end: number; value: string }> = [];
      for (const match of cell.content.formula.source.matchAll(REFERENCE_PATTERN)) {
        if (match.index === undefined) continue;
        const reference = parseFormulaReference(match[0], {
          currentSheetId: sheet.id,
          resolveSheetId: (name) => sheetsByName().get(name.toLowerCase()),
          startOffset: match.index,
        });
        if (!reference || reference.target.sheetId !== targetSheetId) continue;
        if (!transform) {
          replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            value: "#REF!",
          });
          continue;
        }
        const start = transform(reference.target.range.start);
        const end = transform(reference.target.range.end);
        if (!start || !end) {
          replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            value: "#REF!",
          });
          continue;
        }
        const value = formatFormulaReference(
          {
            ...reference,
            target: { sheetId: targetSheetId, range: { start, end } },
          },
          (id) => workbook.sheets.get(id)?.name,
        );
        if (value)
          replacements.push({ start: match.index, end: match.index + match[0].length, value });
      }
      if (!replacements.length) continue;
      let source = cell.content.formula.source;
      for (const replacement of replacements.sort((left, right) => right.start - left.start))
        source = `${source.slice(0, replacement.start)}${replacement.value}${source.slice(replacement.end)}`;
      sheet.cells.set(key, { ...cell, content: { kind: "formula", formula: { source } } });
    }
  }
}

export function renameQualifiedReferencesForSheet(
  workbook: Workbook,
  previousName: string,
  nextName: string,
): void {
  const formatted = /^[A-Za-z0-9_.]+$/.test(nextName)
    ? nextName
    : `'${nextName.replaceAll("'", "''")}'`;
  for (const sheet of workbook.sheets.values()) {
    for (const [key, cell] of sheet.cells) {
      if (cell.content?.kind !== "formula") continue;
      const source = cell.content.formula.source.replace(REFERENCE_PATTERN, (token) => {
        const bang = token.lastIndexOf("!");
        const raw = token.slice(0, bang);
        const name = raw.startsWith("'") ? raw.slice(1, -1).replaceAll("''", "'") : raw;
        return name.toLowerCase() === previousName.toLowerCase()
          ? `${formatted}!${token.slice(bang + 1)}`
          : token;
      });
      if (source !== cell.content.formula.source)
        sheet.cells.set(key, { ...cell, content: { kind: "formula", formula: { source } } });
    }
  }
}
