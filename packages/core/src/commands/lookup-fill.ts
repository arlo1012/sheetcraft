import { getDuplicateValueKey } from "../duplicate-values.js";
import { isFormulaError, type CellContent, type FormulaValue } from "../formula/types.js";
import {
  createWorkbookEvaluator,
  getCellContent,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import type { SetCellContentsCommand } from "./contracts.js";
import {
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
} from "./helpers.js";
import { createBatchSetCellContentsCommand } from "./values.js";

export type LookupFillRange = { sheetId: string; range: CellRange };
export type LookupFillField = { sourceColumn: number; targetColumn: number };
export type LookupFillOptions = {
  source: LookupFillRange;
  target: LookupFillRange;
  hasHeader: boolean;
  matchFields: LookupFillField[];
  fillFields: LookupFillField[];
  matchMode: "first" | "last";
  overwrite: boolean;
};
export type LookupFillPreviewChange = {
  row: number;
  sourceRow: number;
  column: number;
  value: string;
};
export type LookupFillPreview = {
  sourceRows: number;
  targetRows: number;
  matchedRows: number;
  writeCount: number;
  skippedExistingCount: number;
  changes: LookupFillPreviewChange[];
};
type Normalized = Omit<LookupFillOptions, "source" | "target"> & {
  source: LookupFillRange;
  target: LookupFillRange;
};
type Change = Omit<LookupFillPreviewChange, "value"> & { content: CellContent };
const MAX_CELLS = 100_000;
const key = (address: CellAddress) => `${address.row}:${address.column}`;
const area = (range: CellRange) =>
  (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1);
const width = (range: CellRange) => range.end.column - range.start.column + 1;

function range(workbook: Workbook, input: unknown, field: string): LookupFillRange {
  if (!input || typeof input !== "object") throw invalidCommandPayload(field, input);
  const value = input as LookupFillRange;
  if (typeof value.sheetId !== "string" || !value.sheetId)
    throw invalidCommandPayload(`${field}.sheetId`, value.sheetId);
  const normalized = normalizeRange(value.range);
  assertCellRange(normalized);
  getSheetOrThrow(workbook, value.sheetId);
  if (area(normalized) > MAX_CELLS)
    throw invalidCommandPayload("size", value.range, "Lookup range is too large.");
  return { sheetId: value.sheetId, range: normalized };
}
function normalize(workbook: Workbook, input: LookupFillOptions): Normalized {
  if (!input || typeof input !== "object") throw invalidCommandPayload("options", input);
  const source = range(workbook, input.source, "sourceRange"),
    target = range(workbook, input.target, "targetRange");
  if (area(source.range) + area(target.range) > MAX_CELLS)
    throw invalidCommandPayload("size", input, "Lookup ranges are too large.");
  if (typeof input.hasHeader !== "boolean")
    throw invalidCommandPayload("hasHeader", input.hasHeader);
  if (input.matchMode !== "first" && input.matchMode !== "last")
    throw invalidCommandPayload("matchMode", input.matchMode);
  if (typeof input.overwrite !== "boolean")
    throw invalidCommandPayload("overwrite", input.overwrite);
  const fields = (value: unknown, name: string, sourceLimit: number, targetLimit: number) => {
    if (
      !Array.isArray(value) ||
      !value.length ||
      value.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          !Number.isInteger(item.sourceColumn) ||
          !Number.isInteger(item.targetColumn) ||
          item.sourceColumn < 0 ||
          item.sourceColumn >= sourceLimit ||
          item.targetColumn < 0 ||
          item.targetColumn >= targetLimit,
      ) ||
      new Set(value.map((item) => `${item.sourceColumn}:${item.targetColumn}`)).size !==
        value.length
    )
      throw invalidCommandPayload(name, value);
    return value.map((item) => ({
      sourceColumn: item.sourceColumn,
      targetColumn: item.targetColumn,
    }));
  };
  const matchFields = fields(
    input.matchFields,
    "matchFields",
    width(source.range),
    width(target.range),
  );
  const fillFields = fields(
    input.fillFields,
    "fillFields",
    width(source.range),
    width(target.range),
  );
  if (new Set(fillFields.map((field) => field.targetColumn)).size !== fillFields.length)
    throw invalidCommandPayload("fillFields", input.fillFields);
  return {
    source,
    target,
    hasHeader: input.hasHeader,
    matchMode: input.matchMode,
    overwrite: input.overwrite,
    matchFields,
    fillFields,
  };
}
function valueKey(value: FormulaValue | null): string | undefined {
  return getDuplicateValueKey(value) ?? undefined;
}
function output(value: FormulaValue | null): CellContent {
  if (isFormulaError(value)) return { kind: "error", error: value };
  return { kind: "literal", value: value == null || typeof value === "object" ? "" : value };
}
function getChanges(
  workbook: Workbook,
  options: Normalized,
): { preview: LookupFillPreview; changes: Change[] } {
  const sourceEval = createWorkbookEvaluator(workbook, options.source.sheetId),
    targetEval = createWorkbookEvaluator(workbook, options.target.sheetId);
  for (const [sheetId, evaluator] of [
    [options.source.sheetId, sourceEval],
    [options.target.sheetId, targetEval],
  ] as const)
    for (const [cellKey, cell] of getSheetOrThrow(workbook, sheetId).cells)
      if (cell.content?.kind === "formula") {
        const [row, column] = cellKey.split(":").map(Number) as [number, number];
        evaluator.getComputedValue({ row, column });
      }
  const sourceFirst = options.source.range.start.row + Number(options.hasHeader),
    targetFirst = options.target.range.start.row + Number(options.hasHeader);
  const rows = new Map<string, number>();
  for (let row = sourceFirst; row <= options.source.range.end.row; row++) {
    const values = options.matchFields.map((field) =>
      sourceEval.getComputedValue({
        row,
        column: options.source.range.start.column + field.sourceColumn,
      }),
    );
    if (values.some((value) => valueKey(value) === undefined)) continue;
    const k = JSON.stringify(values.map(valueKey));
    if (options.matchMode === "last" || !rows.has(k)) rows.set(k, row);
  }
  const changes: Change[] = [];
  let matchedRows = 0,
    skippedExistingCount = 0;
  for (let row = targetFirst; row <= options.target.range.end.row; row++) {
    const values = options.matchFields.map((field) =>
      targetEval.getComputedValue({
        row,
        column: options.target.range.start.column + field.targetColumn,
      }),
    );
    if (values.some((value) => valueKey(value) === undefined)) continue;
    const sourceRow = rows.get(JSON.stringify(values.map(valueKey)));
    if (sourceRow === undefined) continue;
    matchedRows++;
    for (const field of options.fillFields) {
      const address = { row, column: options.target.range.start.column + field.targetColumn };
      if (
        !options.overwrite &&
        getCellContent(getSheetOrThrow(workbook, options.target.sheetId), address) !== null
      ) {
        skippedExistingCount++;
        continue;
      }
      changes.push({
        row,
        sourceRow,
        column: address.column,
        content: output(
          sourceEval.getComputedValue({
            row: sourceRow,
            column: options.source.range.start.column + field.sourceColumn,
          }),
        ),
      });
    }
  }
  return {
    preview: {
      sourceRows: Math.max(0, options.source.range.end.row - sourceFirst + 1),
      targetRows: Math.max(0, options.target.range.end.row - targetFirst + 1),
      matchedRows,
      writeCount: changes.length,
      skippedExistingCount,
      changes: changes.slice(0, 20).map(({ row, sourceRow, column, content }) => ({
        row,
        sourceRow,
        column,
        value: content.kind === "literal" ? String(content.value) : JSON.stringify(content),
      })),
    },
    changes,
  };
}
export function analyzeLookupFill(workbook: Workbook, input: LookupFillOptions): LookupFillPreview {
  return getChanges(workbook, normalize(workbook, input)).preview;
}
export function createLookupFillCommand(
  workbook: Workbook,
  input: LookupFillOptions,
): SetCellContentsCommand {
  const options = normalize(workbook, input),
    { changes } = getChanges(workbook, options);
  const sheet = getSheetOrThrow(workbook, options.target.sheetId);
  if (sheet.properties.protected) throw invalidCommandPayload("protected", options.target.sheetId);
  const evaluator = createWorkbookEvaluator(workbook, options.target.sheetId);
  for (const [cellKey, cell] of sheet.cells)
    if (cell.content?.kind === "formula") {
      const [row, column] = cellKey.split(":").map(Number) as [number, number];
      evaluator.getComputedValue({ row, column });
    }
  const spills = new Set(
    [...(evaluator.getSpillProjections?.() ?? [])].map((item) => key(item.address)),
  );
  for (const change of changes) {
    const address = { row: change.row, column: change.column };
    if (
      sheet.mergedCells.some(
        (merged) =>
          address.row >= merged.start.row &&
          address.row <= merged.end.row &&
          address.column >= merged.start.column &&
          address.column <= merged.end.column,
      )
    )
      throw invalidCommandPayload("merged", address);
    if (spills.has(key(address))) throw invalidCommandPayload("spill", address);
  }
  return createBatchSetCellContentsCommand(
    changes.map((change) => ({
      sheetId: options.target.sheetId,
      address: { row: change.row, column: change.column },
      content: change.content,
    })),
  );
}
