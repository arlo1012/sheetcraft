import { strToU8 } from "fflate/browser";
import { parseFormula } from "@sheetcraft/core/formula";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import { getCellContent, type Sheet, type SheetTable } from "@sheetcraft/core/workbook";
import { attr, child, nodes, parseXml, xml, type XmlNode } from "./pivot-xml.js";
import { xlsxText } from "./native/writer-text.js";
import type { CompatibilityReportBuilder } from "./report.js";
import { XlsxCompatibilityError } from "./types.js";

type TotalsCell = { formula?: string; array: boolean };

/** Numeric literal totals caused repair in Excel, including a WPS-produced file. */
export function assertSupportedXlsxTableTotals(
  sheets: readonly Sheet[],
  report: CompatibilityReportBuilder,
): void {
  let blocked = false;
  for (const sheet of sheets)
    for (const table of sheet.tables ?? []) {
      if (!table.totalRow) continue;
      for (const [index, column] of table.columns.entries()) {
        const address = { row: table.range.end.row, column: table.range.start.column + index };
        const content = getCellContent(sheet, address);
        if (content?.kind !== "literal" || typeof content.value !== "number") continue;
        blocked = true;
        report.add(
          "table-totals-numeric-constant",
          "block",
          `${sheet.name}!${formatCellAddress(address)} (${table.name}[${column.name}])`,
        );
      }
    }
  if (blocked)
    throw new XlsxCompatibilityError(
      "Numeric constants in table total rows cannot be safely exported to XLSX. The workbook is unchanged.",
      report.build(),
    );
}

/** Inspect only generated worksheet rows, preserving the formula actually written. */
export function readGeneratedTableTotalsCells(
  worksheet: string,
  tables: readonly SheetTable[],
): Map<string, TotalsCell> {
  const rows = new Set(
    tables.filter((table) => table.totalRow).map((table) => table.range.end.row + 1),
  );
  const result = new Map<string, TotalsCell>();
  if (!rows.size) return result;
  for (const row of worksheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const index = /\br="(\d+)"/.exec(row[1]!)?.[1];
    if (!index || !rows.has(Number(index))) continue;
    const parsed = child(parseXml(strToU8(`<row>${row[2]!}</row>`)), "row");
    for (const cell of nodes(parsed.c)) {
      const reference = attr(cell, "r");
      const formula = cell.f;
      const text =
        typeof formula === "string"
          ? formula
          : formula && typeof formula === "object"
            ? String((formula as XmlNode)["#text"] ?? "")
            : undefined;
      result.set(reference, { formula: text, array: attr(child(cell, "f"), "t") === "array" });
    }
  }
  return result;
}

function isOwnColumnSum(source: string, sheet: Sheet, table: SheetTable, index: number): boolean {
  const parsed = parseFormula(`=${source}`);
  if (!parsed.ok) return false;
  const expression = parsed.ast.expression;
  if (
    expression.kind !== "function" ||
    expression.name.toUpperCase() !== "SUBTOTAL" ||
    expression.args.length !== 2 ||
    expression.args[0]?.kind !== "number" ||
    expression.args[0].value !== 109
  )
    return false;
  const reference = expression.args[1]!;
  const column = table.range.start.column + index;
  const start = table.range.start.row + (table.headerRow ? 1 : 0);
  const end = table.range.end.row - 1;
  const sameSheet = (name: string | undefined) =>
    name === undefined || name.toLowerCase() === sheet.name.toLowerCase();
  if (reference.kind === "range")
    return (
      reference.range.start.column === column &&
      reference.range.end.column === column &&
      reference.range.start.row === start &&
      reference.range.end.row === end &&
      sameSheet(reference.range.start.sheetName) &&
      sameSheet(reference.range.end.sheetName)
    );
  if (reference.kind === "reference")
    return (
      start === end &&
      reference.reference.row === start &&
      reference.reference.column === column &&
      sameSheet(reference.reference.sheetName)
    );
  // Structured export qualifies names but does not prove a unique native
  // table binding. Preserve its exact custom formula instead of guessing
  // workbook-wide identity from matching table/column names alone.
  return false;
}

/** Totals describe existing cells; they never create, replace or fill formulas. */
export function xlsxTableTotalsColumn(
  sheet: Sheet,
  table: SheetTable,
  index: number,
  cells: ReadonlyMap<string, TotalsCell>,
): { attributes: string; body: string } {
  if (!table.totalRow) return { attributes: "", body: "" };
  const address = { row: table.range.end.row, column: table.range.start.column + index };
  const content = getCellContent(sheet, address);
  const cell = cells.get(formatCellAddress(address));
  if (cell?.formula !== undefined) {
    if (!cell.array && isOwnColumnSum(cell.formula, sheet, table, index))
      return { attributes: ' totalsRowFunction="sum"', body: "" };
    return {
      attributes: ' totalsRowFunction="custom"',
      body: `<totalsRowFormula${cell.array ? ' array="1"' : ""}>${xml(cell.formula)}</totalsRowFormula>`,
    };
  }
  return content?.kind === "literal" && typeof content.value === "string"
    ? { attributes: ` totalsRowLabel="${xlsxText(content.value)}"`, body: "" }
    : { attributes: "", body: "" };
}
