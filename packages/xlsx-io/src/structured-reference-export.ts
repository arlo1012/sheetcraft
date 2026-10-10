import { resolveTableReferenceBounds } from "@sheetcraft/core/commands";
import {
  getFormulaAst,
  MAX_FORMULA_COLUMNS,
  MAX_FORMULA_ROWS,
  parseA1FormulaReference,
  type FormulaExpression,
  type StructuredFormulaReference,
} from "@sheetcraft/core/formula";
import type { CellAddress, SheetTable, Workbook } from "@sheetcraft/core/workbook";

const THIS_ROW_SHORTHAND_DEPTH = new Map([
  ["[@", 1],
  ["[@[", 2],
  ["[[@", 2],
  ["[[@[", 3],
]);

function validTableName(workbook: Workbook, table: SheetTable): boolean {
  // Mirror Core's validateTableName constraints without normalizing an imported
  // name: export must preserve invalid sources rather than repair/rebind them.
  return (
    /^[\p{L}_][\p{L}\p{N}_]*$/u.test(table.name) &&
    !parseA1FormulaReference(table.name) &&
    !/^R\d+C\d+$/i.test(table.name) &&
    !/^(TRUE|FALSE)$/i.test(table.name) &&
    ![...workbook.definedNames.values()].some(
      (definition) => definition.name.toLowerCase() === table.name.toLowerCase(),
    )
  );
}

/** Expand only a parser-confirmed single-column @ shorthand, not arbitrary text. */
function explicitThisRow(
  source: string,
  reference: StructuredFormulaReference,
  bracketStart: number,
): string | null {
  if (reference.scope !== "this-row" || reference.columns.length !== 1) return null;
  const column = reference.columns[0]!;
  const prefix = source.slice(bracketStart, column.start).replace(/\s/g, "");
  const suffix = source.slice(column.end, reference.end).replace(/\s/g, "");
  const depth = THIS_ROW_SHORTHAND_DEPTH.get(prefix);
  const name = source.slice(column.start, column.end);
  // Escaped/special header spellings unsupported by Core are not an opportunity
  // to guess at an Excel header or emit a different binding.
  if (!depth || suffix !== "]".repeat(depth) || /['[\]#@]/.test(name)) return null;
  return `[[#This Row],[${name}]]`;
}

/**
 * Write table names and OOXML's explicit #This Row selector without changing
 * Core source. Calc does not support omitted names or Excel's @ display syntax.
 * Each replacement is parser-confirmed and resolves to exactly the same target.
 * https://help.libreoffice.org/latest/en-US/text/scalc/01/database_table_reference.html
 * https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/089fbdef-ed49-4a14-9509-794c95651b17
 */
export function qualifyXlsxStructuredReferences(
  source: string,
  workbook: Workbook,
  sheetId: string,
  address: CellAddress,
): string {
  if (
    !source.includes("[") ||
    !workbook.sheets.has(sheetId) ||
    !Number.isInteger(address.row) ||
    !Number.isInteger(address.column) ||
    address.row < 0 ||
    address.row >= MAX_FORMULA_ROWS ||
    address.column < 0 ||
    address.column >= MAX_FORMULA_COLUMNS
  )
    return source;
  const ast = getFormulaAst(source);
  // The Core parser intentionally does not support every Excel grammar form,
  // including escaped literal brackets in headers. Do not guess at such tokens.
  if (!ast) return source;
  const allTables = [...workbook.sheets.values()].flatMap((sheet) => sheet.tables ?? []);
  const containingTables = (workbook.sheets.get(sheetId)?.tables ?? []).filter(
    (table) =>
      address.row >= table.range.start.row &&
      address.row <= table.range.end.row &&
      address.column >= table.range.start.column &&
      address.column <= table.range.end.column,
  );
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const pending: FormulaExpression[] = [ast.expression];
  while (pending.length) {
    const expression = pending.pop()!;
    if (expression.kind === "structured-reference") {
      const reference = expression.reference;
      const table =
        reference.tableName === undefined
          ? containingTables.length === 1
            ? containingTables[0]
            : undefined
          : allTables.find(
              (candidate) => candidate.name.toLowerCase() === reference.tableName!.toLowerCase(),
            );
      if (
        !table ||
        !validTableName(workbook, table) ||
        allTables.filter((candidate) => candidate.name.toLowerCase() === table.name.toLowerCase())
          .length !== 1
      )
        continue;
      const bracketStart = reference.tableNameEnd ?? reference.start;
      if (source[bracketStart] !== "[") continue;
      const bracketSource = source.slice(bracketStart, reference.end);
      const explicitRow = explicitThisRow(source, reference, bracketStart);
      // Core currently parses @ column ranges as data scope with an @-prefixed
      // first column name. Expanding those would change its target and scope.
      if (
        !explicitRow &&
        (/^\[\s*(?:\[\s*)?@/.test(bracketSource) ||
          (reference.scope === "this-row" && bracketSource.includes("@")))
      )
        continue;
      const bracket = explicitRow ?? bracketSource;
      const text = `${reference.tableName ?? table.name}${bracket}`;
      if (text === source.slice(reference.start, reference.end)) continue;
      const candidate = getFormulaAst(`=${text}`)?.expression;
      if (candidate?.kind !== "structured-reference") continue;
      const original = resolveTableReferenceBounds(workbook, sheetId, reference, address);
      const serialized = resolveTableReferenceBounds(
        workbook,
        sheetId,
        candidate.reference,
        address,
      );
      if (
        candidate.reference.scope === reference.scope &&
        original &&
        serialized &&
        original.sheetId === serialized.sheetId &&
        original.start.row === serialized.start.row &&
        original.start.column === serialized.start.column &&
        original.end.row === serialized.end.row &&
        original.end.column === serialized.end.column
      )
        replacements.push({ start: reference.start, end: reference.end, text });
    } else if (expression.kind === "unary") pending.push(expression.operand);
    else if (expression.kind === "binary") pending.push(expression.left, expression.right);
    else if (expression.kind === "function") pending.push(...expression.args);
    else if (expression.kind === "array") for (const row of expression.rows) pending.push(...row);
  }
  if (!replacements.length) return source;
  const parts: string[] = [];
  let start = 0;
  for (const replacement of replacements.sort((left, right) => left.start - right.start)) {
    parts.push(source.slice(start, replacement.start), replacement.text);
    start = replacement.end;
  }
  parts.push(source.slice(start));
  return parts.join("");
}
