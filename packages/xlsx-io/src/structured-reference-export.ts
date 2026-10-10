import { resolveTableReferenceBounds } from "@sheetcraft/core/commands";
import {
  getFormulaAst,
  parseA1FormulaReference,
  type FormulaExpression,
} from "@sheetcraft/core/formula";
import type { CellAddress, Workbook } from "@sheetcraft/core/workbook";

/**
 * Calc does not support omission of a table name. Qualify only parser-confirmed
 * local references with the same Core target; preserve the editable source.
 * https://help.libreoffice.org/latest/en-US/text/scalc/01/database_table_reference.html
 * https://support.microsoft.com/en-us/excel/using-structured-references-with-excel-tables
 */
export function qualifyXlsxStructuredReferences(
  source: string,
  workbook: Workbook,
  sheetId: string,
  address: CellAddress,
): string {
  if (!source.includes("[")) return source;
  const tables = (workbook.sheets.get(sheetId)?.tables ?? []).filter(
    (table) =>
      address.row >= table.range.start.row &&
      address.row <= table.range.end.row &&
      address.column >= table.range.start.column &&
      address.column <= table.range.end.column,
  );
  if (tables.length !== 1) return source;
  const table = tables[0]!;
  // Invalid imported names or duplicate names can resolve differently once
  // written explicitly. Neither case provides a safe qualification context.
  // Mirror Core's validateTableName constraints without normalizing an imported
  // name: export must preserve invalid sources rather than repair/rebind them.
  if (
    !/^[\p{L}_][\p{L}\p{N}_]*$/u.test(table.name) ||
    parseA1FormulaReference(table.name) ||
    /^R\d+C\d+$/i.test(table.name) ||
    /^(TRUE|FALSE)$/i.test(table.name) ||
    [...workbook.definedNames.values()].some(
      (definition) => definition.name.toLowerCase() === table.name.toLowerCase(),
    )
  )
    return source;
  const nameAst = getFormulaAst(`=${table.name}[#All]`);
  if (
    nameAst?.expression.kind !== "structured-reference" ||
    nameAst.expression.reference.tableName !== table.name ||
    [...workbook.sheets.values()].reduce(
      (count, sheet) =>
        count +
        (sheet.tables ?? []).filter(
          (candidate) => candidate.name.toLowerCase() === table.name.toLowerCase(),
        ).length,
      0,
    ) !== 1
  )
    return source;
  const ast = getFormulaAst(source);
  // The Core parser intentionally does not support every Excel grammar form,
  // including escaped literal brackets in headers. Do not guess at such tokens.
  if (!ast) return source;
  const offsets: number[] = [];
  const pending: FormulaExpression[] = [ast.expression];
  while (pending.length) {
    const expression = pending.pop()!;
    if (expression.kind === "structured-reference") {
      const reference = expression.reference;
      if (reference.tableName !== undefined) continue;
      const local = resolveTableReferenceBounds(workbook, sheetId, reference, address);
      const qualified = resolveTableReferenceBounds(
        workbook,
        sheetId,
        { ...reference, tableName: table.name },
        address,
      );
      if (
        local &&
        qualified &&
        local.sheetId === qualified.sheetId &&
        local.start.row === qualified.start.row &&
        local.start.column === qualified.start.column &&
        local.end.row === qualified.end.row &&
        local.end.column === qualified.end.column &&
        source[reference.start] === "["
      )
        offsets.push(reference.start);
    } else if (expression.kind === "unary") pending.push(expression.operand);
    else if (expression.kind === "binary") pending.push(expression.left, expression.right);
    else if (expression.kind === "function") pending.push(...expression.args);
    else if (expression.kind === "array") for (const row of expression.rows) pending.push(...row);
  }
  if (!offsets.length) return source;
  const parts: string[] = [];
  let start = 0;
  for (const offset of offsets.sort((left, right) => left - right)) {
    parts.push(source.slice(start, offset), table.name);
    start = offset;
  }
  parts.push(source.slice(start));
  return parts.join("");
}
