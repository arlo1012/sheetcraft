import { formatFormulaAddress } from "../formula/references.js";
import { parseA1FormulaReference } from "../formula/reference-model.js";
import {
  createWorkbookEvaluator,
  type CellAddress,
  type CellRange,
  type DefinedName,
  type SheetEvaluator,
  type Workbook,
} from "../workbook.js";
import type { SetDefinedNamesCommand } from "./contracts.js";
import {
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
  parseCellKey,
} from "./helpers.js";
import { applyUpsertDefinedNameCommand, createUpsertDefinedNameCommand } from "./names.js";

export type DefinedNameLabelPosition = "top" | "left" | "bottom" | "right";
export type DefinedNamesFromSelectionOptions = {
  sheetId: string;
  range: CellRange;
  positions: readonly DefinedNameLabelPosition[];
  scopeSheetId?: string;
  /** Optional current calculation view, used by interactive callers in manual mode. */
  evaluator?: SheetEvaluator;
};

function nameFromLabel(value: string | number | boolean): string {
  let name = String(value)
    .trim()
    .replace(/[^\p{L}\p{N}_]/gu, "_");
  if (!name) return "";
  if (
    !/^[\p{L}_]/u.test(name) ||
    parseA1FormulaReference(name) ||
    /^(R\d+C\d+|TRUE|FALSE)$/i.test(name)
  )
    name = `_${name}`;
  return name;
}

/** Uses only sparse label cells; selecting entire axes does not allocate a rectangular grid. */
export function createDefinedNamesFromSelectionCommand(
  workbook: Workbook,
  options: DefinedNamesFromSelectionOptions,
): SetDefinedNamesCommand {
  const sheet = getSheetOrThrow(workbook, options.sheetId);
  const range = normalizeRange(options.range);
  assertCellRange(range);
  const positions = new Set(options.positions);
  if (
    !positions.size ||
    [...positions].some((position) => !["top", "left", "bottom", "right"].includes(position))
  ) {
    throw invalidCommandPayload("positions", options.positions);
  }
  if (options.scopeSheetId !== undefined) getSheetOrThrow(workbook, options.scopeSheetId);
  const data: CellRange = {
    start: {
      row: range.start.row + Number(positions.has("top")),
      column: range.start.column + Number(positions.has("left")),
    },
    end: {
      row: range.end.row - Number(positions.has("bottom")),
      column: range.end.column - Number(positions.has("right")),
    },
  };
  if (data.start.row > data.end.row || data.start.column > data.end.column)
    throw invalidCommandPayload("range", range);
  const evaluator = options.evaluator ?? createWorkbookEvaluator(workbook, sheet.id);
  const used = new Set(
    [...workbook.definedNames.values()]
      .filter((definition) => definition.scopeSheetId === options.scopeSheetId)
      .map((definition) => definition.name.toUpperCase()),
  );
  const labels = [...sheet.cells.keys()]
    .map(parseCellKey)
    .filter(
      (address) =>
        address.row >= range.start.row &&
        address.row <= range.end.row &&
        address.column >= range.start.column &&
        address.column <= range.end.column,
    )
    .sort((a, b) => a.row - b.row || a.column - b.column);
  const changes: SetDefinedNamesCommand["changes"] = [];
  const add = (address: CellAddress, referenceRange: CellRange): void => {
    const value = evaluator.getComputedValue(address);
    if (value === null || typeof value === "object") return;
    const name = nameFromLabel(value);
    if (!name || used.has(name.toUpperCase())) return;
    const sheetName = `'${sheet.name.replaceAll("'", "''")}'`;
    const definition = createUpsertDefinedNameCommand(workbook, {
      name,
      ...(options.scopeSheetId !== undefined ? { scopeSheetId: options.scopeSheetId } : {}),
      reference: `=${sheetName}!${formatFormulaAddress(referenceRange.start)}:${formatFormulaAddress(referenceRange.end)}`,
    }).definition;
    used.add(name.toUpperCase());
    changes.push({ id: definition.id, definition });
  };
  for (const position of ["top", "left", "bottom", "right"] as const) {
    if (!positions.has(position)) continue;
    for (const address of labels) {
      if (
        ((position === "top" && address.row === range.start.row) ||
          (position === "bottom" && address.row === range.end.row)) &&
        address.column >= data.start.column &&
        address.column <= data.end.column
      ) {
        add(address, {
          start: { row: data.start.row, column: address.column },
          end: { row: data.end.row, column: address.column },
        });
      }
      if (
        ((position === "left" && address.column === range.start.column) ||
          (position === "right" && address.column === range.end.column)) &&
        address.row >= data.start.row &&
        address.row <= data.end.row
      ) {
        add(address, {
          start: { row: address.row, column: data.start.column },
          end: { row: address.row, column: data.end.column },
        });
      }
    }
  }
  if (!changes.length)
    throw invalidCommandPayload(
      "range",
      range,
      "No new names can be created from the selected labels.",
    );
  return { type: "setDefinedNames", changes };
}

/** Validate the complete batch against a draft map before mutating workbook state. */
export function applySetDefinedNamesCommand(
  workbook: Workbook,
  command: SetDefinedNamesCommand,
): SetDefinedNamesCommand | null {
  const draft = { ...workbook, definedNames: new Map(workbook.definedNames) };
  const inverse: SetDefinedNamesCommand["changes"] = [];
  const seen = new Set<string>();
  for (const change of command.changes) {
    if (!change.id || seen.has(change.id)) throw invalidCommandPayload("changes", command.changes);
    seen.add(change.id);
    const previous = draft.definedNames.get(change.id);
    if (change.definition) {
      if (previous || change.definition.id !== change.id)
        throw invalidCommandPayload("definition", change.definition);
      assertCellRange(change.definition.reference);
      applyUpsertDefinedNameCommand(draft, {
        type: "upsertDefinedName",
        definition: change.definition,
      });
      inverse.push({ id: change.id, definition: null });
    } else if (previous) {
      draft.definedNames.delete(change.id);
      inverse.push({ id: change.id, definition: cloneDefinition(previous) });
    }
  }
  if (!inverse.length) return null;
  workbook.definedNames = draft.definedNames;
  return { type: "setDefinedNames", changes: inverse.reverse() };
}

function cloneDefinition(definition: DefinedName): DefinedName {
  return {
    ...definition,
    reference: {
      ...definition.reference,
      start: { ...definition.reference.start },
      end: { ...definition.reference.end },
    },
  };
}
