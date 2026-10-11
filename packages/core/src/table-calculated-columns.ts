import { getFormulaAst } from "./formula/parser.js";
import { translateFormulaForCopy } from "./formula/references.js";
import {
  createCellKey,
  createWorkbookEvaluator,
  getCellContent,
  getTableDataRows,
  createSheet,
  createSheetSparseState,
  replaceSheetSparseState,
  type CellAddress,
  type Sheet,
  type SheetTable,
  type Workbook,
} from "./workbook.js";
import { validateDuplicateEntries } from "./duplicate-values.js";
import { DataFillError, prepareFillTarget } from "./commands/fill-common.js";
import { assertFillDataValidation } from "./commands/fill-validation.js";
import { getSheetOrThrow, invalidCommandPayload } from "./commands/helpers.js";
import type { CellContentChange, SetCellContentsCommand } from "./commands/contracts.js";
import { getTableMetadataEdit } from "./commands/values.js";
import { MAX_FILL_CELLS } from "./commands/fill-common.js";

export type CalculatedColumnUpdate = {
  sheetId: string;
  tableId: string;
  columnId: string;
  source: string;
};

export function createCalculatedColumnPlanningWorkbook(workbook: Workbook): Workbook {
  return {
    ...workbook,
    definedNames: new Map(
      [...workbook.definedNames].map(([id, value]) => [
        id,
        {
          ...value,
          reference: {
            ...value.reference,
            start: { ...value.reference.start },
            end: { ...value.reference.end },
          },
        },
      ]),
    ),
    sheets: new Map(
      [...workbook.sheets].map(([id, source]) => {
        const copy = createSheet(source.name, source.id);
        copy.properties = { ...source.properties };
        replaceSheetSparseState(copy, createSheetSparseState(source));
        return [id, copy];
      }),
    ),
  };
}

/** Explicitly replaces all data members, including filtered rows, but never headers/totals. */
export function createApplyTableCalculatedColumnCommand(
  sheetId: string,
  tableId: string,
  columnId: string,
  sourceAddress: CellAddress,
  source: string,
): SetCellContentsCommand {
  return {
    type: "setCellContents",
    changes: [],
    tableColumnFill: {
      sheetId,
      tableId,
      columnId,
      sourceAddress: { ...sourceAddress },
      source,
    },
  };
}

export function translateCalculatedColumnFormula(
  source: string,
  from: CellAddress,
  to: CellAddress,
): string {
  if (!getFormulaAst(source))
    throw new DataFillError("invalidSeed", "A calculated column requires a valid formula.");
  return translateFormulaForCopy(
    source,
    { row: to.row - from.row, column: to.column - from.column },
    {
      includeSheetQualifiedReferences: true,
    },
  );
}

function dataColumn(sheet: Sheet, address: CellAddress) {
  for (const table of sheet.tables ?? []) {
    const rows = getTableDataRows(table);
    if (
      address.row < rows.start ||
      address.row > rows.end ||
      address.column < table.range.start.column ||
      address.column > table.range.end.column
    )
      continue;
    return { table, rows, column: table.columns[address.column - table.range.start.column]! };
  }
  return undefined;
}

function assertScalarResults(workbook: Workbook, command: SetCellContentsCommand): void {
  const sheets = new Map(workbook.sheets);
  for (const change of command.changes) {
    let sheet = sheets.get(change.sheetId)!;
    if (sheet === workbook.sheets.get(change.sheetId)) {
      sheet = { ...sheet, cells: new Map(sheet.cells) };
      sheets.set(sheet.id, sheet);
    }
    const key = createCellKey(change.address);
    const current = sheet.cells.get(key) ?? {};
    sheet.cells.set(
      key,
      change.content ? { ...current, content: change.content } : { ...current, content: undefined },
    );
  }
  const shadow: Workbook = { ...workbook, sheets };
  const evaluators = new Map<string, ReturnType<typeof createWorkbookEvaluator>>();
  for (const change of command.changes) {
    if (change.content?.kind !== "formula") continue;
    const evaluator =
      evaluators.get(change.sheetId) ?? createWorkbookEvaluator(shadow, change.sheetId);
    evaluators.set(change.sheetId, evaluator);
    const result = evaluator.getRuntimeValue!(change.address);
    if (
      result &&
      typeof result === "object" &&
      ((result.kind === "formula-array" &&
        (result.rows.length !== 1 || result.rows[0]!.length !== 1)) ||
        (result.kind === "formula-error" && result.code === "SPILL"))
    )
      throw new DataFillError(
        "spillCells",
        "A calculated column requires one scalar result per row.",
      );
  }
}

export function createCalculatedColumnNewMemberChanges(
  workbook: Workbook,
  sheetId: string,
  previous: SheetTable,
  next: SheetTable,
  excludedAddress?: CellAddress,
  insertedRows?: { start: number; end: number },
): CellContentChange[] {
  const sheet = getSheetOrThrow(workbook, sheetId);
  const oldRows = getTableDataRows(previous);
  const rows = getTableDataRows(next);
  const changes: CellContentChange[] = [];
  for (const [index, column] of next.columns.entries()) {
    if (column.calculatedColumnFormula === undefined) continue;
    const physicalColumn = next.range.start.column + index;
    const firstChange = changes.length;
    const start = insertedRows ? Math.max(rows.start, insertedRows.start) : rows.start;
    const end = insertedRows ? Math.min(rows.end, insertedRows.end) : rows.end;
    for (let row = start; row <= end; row++) {
      if (!insertedRows && row >= oldRows.start && row <= oldRows.end) continue;
      const address = { row, column: physicalColumn };
      if (excludedAddress?.row === row && excludedAddress.column === physicalColumn) continue;
      if (getCellContent(sheet, address) !== null) continue;
      if (changes.length >= MAX_FILL_CELLS)
        throw new DataFillError(
          "tooLarge",
          `A calculated column can change at most ${MAX_FILL_CELLS} cells.`,
        );
      changes.push({
        sheetId,
        address,
        content: {
          kind: "formula",
          formula: {
            source: translateCalculatedColumnFormula(
              column.calculatedColumnFormula,
              { row: rows.start, column: physicalColumn },
              address,
            ),
          },
        },
      });
    }
    if (changes.length > firstChange)
      prepareFillTarget(
        workbook,
        sheetId,
        {
          start: changes[firstChange]!.address,
          end: changes[changes.length - 1]!.address,
        },
        { includeHiddenTableMembers: true },
      );
  }
  return changes;
}

export function assertCalculatedColumnChanges(
  workbook: Workbook,
  command: SetCellContentsCommand,
): void {
  assertScalarResults(workbook, command);
  assertFillDataValidation(workbook, command, command.inputValidationWarning);
  if (!validateDuplicateEntries(workbook, command.changes).valid)
    throw new DataFillError(
      "validation",
      "Calculated column results violate duplicate-entry validation.",
    );
}

/** Build all generated writes before the dispatcher checks protection and PivotTable results. */
export function prepareTableCalculatedColumnEdit(
  workbook: Workbook,
  original: SetCellContentsCommand,
): {
  command: SetCellContentsCommand;
  update?: CalculatedColumnUpdate;
} {
  if (!original.inputIntent && !original.tableColumnFill) return { command: original };
  if (original.inputIntent !== undefined && original.inputIntent !== "manual")
    throw invalidCommandPayload("inputIntent", original.inputIntent);
  if (
    !Array.isArray(original.changes) ||
    (original.inputIntent && original.changes.length !== 1) ||
    (original.inputIntent && original.tableColumnFill)
  )
    throw invalidCommandPayload("calculatedColumn", original);
  if (original.inputValidationWarning) {
    const confirmation = original.inputValidationWarning;
    const input = original.changes[0];
    if (
      original.inputIntent !== "manual" ||
      !input ||
      !confirmation.address ||
      confirmation.sheetId !== input.sheetId ||
      confirmation.address.row !== input.address.row ||
      confirmation.address.column !== input.address.column ||
      typeof confirmation.ruleSignature !== "string"
    )
      throw invalidCommandPayload("inputValidationWarning", confirmation);
  }
  let sheet: Sheet;
  let table: SheetTable;
  let columnId: string;
  let address: CellAddress;
  let source: string;
  let fill = false;
  if (original.tableColumnFill) {
    if (original.changes.length)
      throw invalidCommandPayload("tableColumnFill", original.tableColumnFill);
    const request = original.tableColumnFill;
    sheet = getSheetOrThrow(workbook, request.sheetId);
    const found = (sheet.tables ?? []).find((item) => item.id === request.tableId);
    if (!found) throw invalidCommandPayload("tableColumnFill.tableId", request.tableId);
    table = found;
    address = request.sourceAddress;
    const target = dataColumn(sheet, address);
    if (!target || target.table.id !== table.id || target.column.id !== request.columnId)
      throw invalidCommandPayload("tableColumnFill.sourceAddress", address);
    columnId = request.columnId;
    source = request.source;
    fill = true;
  } else {
    const change = original.changes[0]!;
    sheet = getSheetOrThrow(workbook, change.sheetId);
    const metadataEdit = getTableMetadataEdit(sheet, change);
    if (metadataEdit?.kind === "appendRow") {
      const previous = sheet.tables!.find((item) => item.id === metadataEdit.tableId)!;
      const next = {
        ...previous,
        range: {
          start: { ...previous.range.start },
          end: { ...previous.range.end, row: change.address.row },
        },
      };
      const members = createCalculatedColumnNewMemberChanges(
        workbook,
        sheet.id,
        previous,
        next,
        change.address,
      );
      if (!members.length) return { command: original };
      const command = { ...original, changes: [...original.changes, ...members] };
      const shadow: Workbook = { ...workbook, sheets: new Map(workbook.sheets) };
      shadow.sheets.set(sheet.id, {
        ...sheet,
        tables: sheet.tables!.map((table) => (table.id === next.id ? next : table)),
      });
      assertCalculatedColumnChanges(shadow, command);
      return { command };
    }
    if (change.content?.kind !== "formula") return { command: original };
    const target = dataColumn(sheet, change.address);
    if (!target || target.column.calculatedColumnFormula !== undefined)
      return { command: original };
    ({ table } = target);
    columnId = target.column.id;
    address = change.address;
    source = change.content.formula.source;
    fill = true;
    for (let row = target.rows.start; row <= target.rows.end; row++)
      if (getCellContent(sheet, { row, column: address.column }) !== null) {
        fill = false;
        break;
      }
  }
  const rows = getTableDataRows(table);
  const canonical = translateCalculatedColumnFormula(source, address, {
    row: rows.start,
    column: address.column,
  });
  const changes: CellContentChange[] = fill ? [] : original.changes;
  if (!fill)
    prepareFillTarget(
      workbook,
      sheet.id,
      { start: address, end: address },
      { includeHiddenTableMembers: true },
    );
  if (fill) {
    prepareFillTarget(
      workbook,
      sheet.id,
      {
        start: { row: rows.start, column: address.column },
        end: { row: rows.end, column: address.column },
      },
      { includeHiddenTableMembers: true },
    );
    for (let row = rows.start; row <= rows.end; row++) {
      const target = { row, column: address.column };
      const originalChange = original.changes.find(
        (item) =>
          item.sheetId === sheet.id &&
          item.address.row === row &&
          item.address.column === address.column,
      );
      changes.push({
        ...originalChange,
        sheetId: sheet.id,
        address: target,
        content: {
          kind: "formula",
          formula: {
            source: translateCalculatedColumnFormula(
              canonical,
              { row: rows.start, column: address.column },
              target,
            ),
          },
        },
      });
    }
  }
  const { tableColumnFill: _fill, ...rest } = original;
  const command: SetCellContentsCommand = { ...rest, changes };
  assertScalarResults(workbook, command);
  if (fill && (original.tableColumnFill || changes.length > 1)) {
    assertCalculatedColumnChanges(workbook, command);
  }
  return { command, update: { sheetId: sheet.id, tableId: table.id, columnId, source: canonical } };
}
