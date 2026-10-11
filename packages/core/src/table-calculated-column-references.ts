import {
  getTableDataRows,
  type CellAddress,
  type Sheet,
  type SheetTable,
  type Workbook,
} from "./workbook.js";
import { collectFormulaReferences, collectFormulaAxisRanges } from "./formula/references.js";
import { translateFormulaForCopy } from "./formula/references.js";
import { MAX_FILL_CELLS } from "./commands/fill-common.js";
import { getFormulaAst } from "./formula/parser.js";
import {
  renameQualifiedFormulaSource,
  rewriteQualifiedFormulaSource,
} from "./formula/workbook-references.js";
import { invalidCommandPayload } from "./commands/helpers.js";

export type TableCalculatedColumnFormulaSource = {
  sheetId: string;
  tableId: string;
  columnId: string;
  source: string;
};

export function getTableCalculatedColumnFormulaSources(
  workbook: Workbook,
  excludedSheetId?: string,
): TableCalculatedColumnFormulaSource[] {
  return [...workbook.sheets.values()].flatMap((sheet) =>
    sheet.id === excludedSheetId
      ? []
      : (sheet.tables ?? []).flatMap((table) =>
          table.columns.flatMap((column) =>
            column.calculatedColumnFormula === undefined
              ? []
              : [
                  {
                    sheetId: sheet.id,
                    tableId: table.id,
                    columnId: column.id,
                    source: column.calculatedColumnFormula,
                  },
                ],
          ),
        ),
  );
}

export function restoreTableCalculatedColumnFormulaSources(
  workbook: Workbook,
  sources: readonly TableCalculatedColumnFormulaSource[],
): boolean {
  if (
    !Array.isArray(sources) ||
    sources.some(
      (entry) =>
        !entry ||
        typeof entry.sheetId !== "string" ||
        typeof entry.tableId !== "string" ||
        typeof entry.columnId !== "string" ||
        typeof entry.source !== "string" ||
        !getFormulaAst(entry.source),
    )
  )
    throw invalidCommandPayload("tableCalculatedColumnFormulaSources", sources);
  let changed = false;
  for (const entry of sources) {
    const column = workbook.sheets
      .get(entry.sheetId)
      ?.tables?.find((table) => table.id === entry.tableId)
      ?.columns.find((column) => column.id === entry.columnId);
    if (!column || column.calculatedColumnFormula === entry.source) continue;
    column.calculatedColumnFormula = entry.source;
    changed = true;
  }
  return changed;
}

export function mapTableCalculatedColumnFormulas(
  workbook: Workbook,
  transform: (source: string, sheet: Sheet, table: SheetTable, index: number) => string,
  excludedSheetId?: string,
): boolean {
  let changed = false;
  for (const sheet of workbook.sheets.values()) {
    if (sheet.id === excludedSheetId) continue;
    for (const table of sheet.tables ?? [])
      for (const [index, column] of table.columns.entries()) {
        if (column.calculatedColumnFormula === undefined) continue;
        const source = transform(column.calculatedColumnFormula, sheet, table, index);
        if (source === column.calculatedColumnFormula) continue;
        column.calculatedColumnFormula = source;
        changed = true;
      }
  }
  return changed;
}

export function renameTableCalculatedColumnSheetReferences(
  workbook: Workbook,
  previousName: string,
  nextName: string,
): TableCalculatedColumnFormulaSource[] {
  const previous = getTableCalculatedColumnFormulaSources(workbook);
  mapTableCalculatedColumnFormulas(workbook, (source) =>
    renameQualifiedFormulaSource(source, previousName, nextName),
  );
  return previous.filter(
    (entry) =>
      workbook.sheets
        .get(entry.sheetId)
        ?.tables?.find((table) => table.id === entry.tableId)
        ?.columns.find((column) => column.id === entry.columnId)?.calculatedColumnFormula !==
      entry.source,
  );
}

export function rewriteTableCalculatedColumnSheetReferences(
  workbook: Workbook,
  targetSheetId: string,
  transform: ((address: CellAddress) => CellAddress | null) | null,
  excludedSheetId?: string,
): boolean {
  const targetName = workbook.sheets.get(targetSheetId)?.name;
  return targetName
    ? mapTableCalculatedColumnFormulas(
        workbook,
        (source) => rewriteQualifiedFormulaSource(source, targetName, transform),
        excludedSheetId,
      )
    : false;
}

/** A multi-row relative family cannot be silently represented by one non-uniform rewrite. */
export function assertExternalCalculatedColumnReferencesCanTransform(
  workbook: Workbook,
  targetSheetId: string,
  axis: "row" | "column",
): void {
  if (axis !== "row") return;
  const targetName = workbook.sheets.get(targetSheetId)?.name.toLowerCase();
  if (!targetName) return;
  for (const sheet of workbook.sheets.values()) {
    if (sheet.id === targetSheetId) continue;
    for (const table of sheet.tables ?? []) {
      const rows = getTableDataRows(table);
      if (rows.start === rows.end) continue;
      for (const column of table.columns) {
        const source = column.calculatedColumnFormula;
        if (source === undefined) continue;
        const relative =
          collectFormulaReferences(source).some(
            (reference) =>
              reference.sheetName?.toLowerCase() === targetName && !reference.rowAbsolute,
          ) ||
          collectFormulaAxisRanges(source).some(
            (range) =>
              range.sheetName?.toLowerCase() === targetName &&
              range.axis === "row" &&
              (!range.startAbsolute || !range.endAbsolute),
          );
        if (relative)
          throw invalidCommandPayload(
            "calculatedColumnFormula",
            source,
            "This structural change cannot safely rewrite a multi-row calculated column's relative reference to another sheet.",
          );
      }
    }
  }
}

export function assertExternalCalculatedColumnReferencesCanMove(
  workbook: Workbook,
  targetSheetId: string,
): void {
  const name = workbook.sheets.get(targetSheetId)?.name.toLowerCase();
  if (!name) return;
  for (const entry of getTableCalculatedColumnFormulaSources(workbook, targetSheetId))
    if (
      collectFormulaReferences(entry.source).some(
        (reference) => reference.sheetName?.toLowerCase() === name,
      ) ||
      collectFormulaAxisRanges(entry.source).some(
        (range) => range.sheetName?.toLowerCase() === name,
      )
    )
      throw invalidCommandPayload(
        "calculatedColumnFormula",
        entry.source,
        "Moving an axis referenced by another sheet's calculated column is not supported. Existing cells were not changed.",
      );
}

/** Re-anchor a family after a coordinate/reference transformation, or reject a non-affine family. */
export function transformTableCalculatedColumnFormulas(
  previous: SheetTable,
  next: SheetTable,
  mapAddress: (address: CellAddress) => CellAddress | null,
  transformSource: (source: string) => string,
): SheetTable["columns"] {
  const oldRows = getTableDataRows(previous);
  const nextRows = getTableDataRows(next);
  return next.columns.map((column, index) => {
    const oldIndex = previous.columns.findIndex((entry) => entry.id === column.id);
    const oldColumn = previous.columns[oldIndex];
    if (oldColumn?.calculatedColumnFormula === undefined) return { ...column };
    const oldAnchor = { row: oldRows.start, column: previous.range.start.column + oldIndex };
    let survivingAnchor: CellAddress | undefined;
    for (let row = oldRows.start; row <= oldRows.end; row++) {
      const candidate = { row, column: oldAnchor.column };
      if (mapAddress(candidate)) {
        survivingAnchor = candidate;
        break;
      }
    }
    if (!survivingAnchor)
      throw invalidCommandPayload(
        "calculatedColumnFormula",
        column.id,
        "A calculated column requires a surviving data row after this structural change.",
      );
    const mappedAnchor = mapAddress(survivingAnchor)!;
    const nextAnchor = { row: nextRows.start, column: next.range.start.column + index };
    const copy = (source: string, from: CellAddress, to: CellAddress) =>
      translateFormulaForCopy(
        source,
        { row: to.row - from.row, column: to.column - from.column },
        { includeSheetQualifiedReferences: true },
      );
    const source = copy(
      transformSource(copy(oldColumn.calculatedColumnFormula, oldAnchor, survivingAnchor)),
      mappedAnchor,
      nextAnchor,
    );
    if (oldRows.end - oldRows.start + 1 > MAX_FILL_CELLS)
      throw invalidCommandPayload(
        "calculatedColumnFormula",
        column.id,
        "This calculated-column structural proof exceeds the supported row limit.",
      );
    for (let row = oldRows.start; row <= oldRows.end; row++) {
      const member = { row, column: oldAnchor.column };
      const target = mapAddress(member);
      if (!target) continue;
      const expected = transformSource(copy(oldColumn.calculatedColumnFormula, oldAnchor, member));
      if (expected !== copy(source, nextAnchor, target))
        throw invalidCommandPayload(
          "calculatedColumnFormula",
          column.id,
          "This structural change cannot preserve one calculated-column formula family. Existing cells were not changed.",
        );
    }
    return { ...column, calculatedColumnFormula: source };
  });
}
