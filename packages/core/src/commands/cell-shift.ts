import { mapDrawingSource } from "../sheet-drawings.js";
import { collectFormulaRanges, transformFormulaReferences } from "../formula/references.js";
import { conditionalFormatFormulaSources } from "../conditional-formatting.js";
import { rewriteQualifiedReferencesForSheet } from "../formula/workbook-references.js";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  cloneCellContent,
  createCellKey,
  createSheetSparseState,
  replaceSheetSparseState,
  type Workbook,
} from "../workbook.js";
import type {
  DeleteCellsCommand,
  InsertCellsCommand,
  RestoreCellShiftCommand,
} from "./contracts.js";
import {
  assertCellRange,
  cloneSparseState,
  getSheetOrThrow,
  invalidCommandPayload,
  parseCellKey,
  validateCommandPayload,
} from "./helpers.js";

type CellShiftCommand = InsertCellsCommand | DeleteCellsCommand;
type Range = { start: { row: number; column: number }; end: { row: number; column: number } };

export function createInsertCellsCommand(
  sheetId: string,
  range: Range,
  direction: InsertCellsCommand["direction"],
): InsertCellsCommand {
  return { type: "insertCells", sheetId, range, direction };
}

export function createDeleteCellsCommand(
  sheetId: string,
  range: Range,
  direction: DeleteCellsCommand["direction"],
): DeleteCellsCommand {
  return { type: "deleteCells", sheetId, range, direction };
}

function intersects(left: Range, right: Range): boolean {
  return !(
    left.end.row < right.start.row ||
    right.end.row < left.start.row ||
    left.end.column < right.start.column ||
    right.end.column < left.start.column
  );
}

function validate(command: CellShiftCommand): Range {
  assertCellRange(command.range);
  if (
    command.type === "insertCells"
      ? command.direction !== "right" && command.direction !== "down"
      : command.direction !== "left" && command.direction !== "up"
  )
    throw invalidCommandPayload("direction", command.direction);
  return {
    start: {
      row: Math.min(command.range.start.row, command.range.end.row),
      column: Math.min(command.range.start.column, command.range.end.column),
    },
    end: {
      row: Math.max(command.range.start.row, command.range.end.row),
      column: Math.max(command.range.start.column, command.range.end.column),
    },
  };
}

function createMap(range: Range, direction: CellShiftCommand["direction"]) {
  const width = range.end.column - range.start.column + 1;
  const height = range.end.row - range.start.row + 1;
  return (address: { row: number; column: number }): { row: number; column: number } | null => {
    if (direction === "right") {
      if (
        address.row < range.start.row ||
        address.row > range.end.row ||
        address.column < range.start.column
      )
        return { ...address };
      return address.column + width < MAX_SHEET_COLUMNS
        ? { row: address.row, column: address.column + width }
        : null;
    }
    if (direction === "down") {
      if (
        address.column < range.start.column ||
        address.column > range.end.column ||
        address.row < range.start.row
      )
        return { ...address };
      return address.row + height < MAX_SHEET_ROWS
        ? { row: address.row + height, column: address.column }
        : null;
    }
    if (direction === "left") {
      if (address.row < range.start.row || address.row > range.end.row) return { ...address };
      if (address.column >= range.start.column && address.column <= range.end.column) return null;
      return address.column > range.end.column
        ? { row: address.row, column: address.column - width }
        : { ...address };
    }
    if (address.column < range.start.column || address.column > range.end.column)
      return { ...address };
    if (address.row >= range.start.row && address.row <= range.end.row) return null;
    return address.row > range.end.row
      ? { row: address.row - height, column: address.column }
      : { ...address };
  };
}

function cloneDefinedNames(workbook: Workbook) {
  return [...workbook.definedNames.values()].map((definition) => ({
    ...definition,
    reference: {
      sheetId: definition.reference.sheetId,
      start: { ...definition.reference.start },
      end: { ...definition.reference.end },
    },
  }));
}

function getCellShiftMovement(selected: Range, direction: CellShiftCommand["direction"]): Range {
  return direction === "right" || direction === "left"
    ? {
        start: { row: selected.start.row, column: selected.start.column },
        end: { row: selected.end.row, column: MAX_SHEET_COLUMNS - 1 },
      }
    : {
        start: { row: selected.start.row, column: selected.start.column },
        end: { row: MAX_SHEET_ROWS - 1, column: selected.end.column },
      };
}

function transformDefinedNameRange(
  range: Range,
  map: ReturnType<typeof createMap>,
  selected: Range,
  direction: CellShiftCommand["direction"],
): Range | null {
  const horizontal = direction === "left" || direction === "right";
  const selectedStart = horizontal ? selected.start.row : selected.start.column;
  const selectedEnd = horizontal ? selected.end.row : selected.end.column;
  const rangeStart = horizontal ? range.start.row : range.start.column;
  const rangeEnd = horizontal ? range.end.row : range.end.column;
  const intersectsStripe = rangeStart <= selectedEnd && selectedStart <= rangeEnd;
  const movement = getCellShiftMovement(selected, direction);
  if (!intersects(range, movement)) return { start: { ...range.start }, end: { ...range.end } };
  if (
    intersectsStripe &&
    intersects(range, movement) &&
    (rangeStart < selectedStart || rangeEnd > selectedEnd)
  )
    throw invalidCommandPayload(
      "range",
      selected,
      "Cell shifts cannot split a defined name range.",
    );
  if (direction === "left" || direction === "up") {
    if (intersectsStripe) {
      const deletedStart = horizontal ? selected.start.column : selected.start.row;
      const deletedEnd = horizontal ? selected.end.column : selected.end.row;
      const start = horizontal ? range.start.column : range.start.row;
      const end = horizontal ? range.end.column : range.end.row;
      const count = deletedEnd - deletedStart + 1;
      if (end >= deletedStart && start <= deletedEnd) {
        const nextStart = start < deletedStart ? start : deletedStart;
        const nextEnd = end > deletedEnd ? end - count : deletedStart - 1;
        if (nextEnd < nextStart) return null;
        return horizontal
          ? {
              start: { row: range.start.row, column: nextStart },
              end: { row: range.end.row, column: nextEnd },
            }
          : {
              start: { row: nextStart, column: range.start.column },
              end: { row: nextEnd, column: range.end.column },
            };
      }
    }
  }
  const start = map(range.start);
  const end = map(range.end);
  return start && end ? { start, end } : null;
}

function transformFormulaRange(
  range: Range,
  map: ReturnType<typeof createMap>,
  selected: Range,
  direction: CellShiftCommand["direction"],
): Range | null {
  if (!intersects(range, getCellShiftMovement(selected, direction)))
    return { start: { ...range.start }, end: { ...range.end } };
  if (direction !== "left" && direction !== "up") {
    const horizontal = direction === "right";
    const selectedStart = horizontal ? selected.start.row : selected.start.column;
    const selectedEnd = horizontal ? selected.end.row : selected.end.column;
    const rangeStart = horizontal ? range.start.row : range.start.column;
    const rangeEnd = horizontal ? range.end.row : range.end.column;
    if (rangeStart < selectedStart || rangeEnd > selectedEnd) return null;
    const start = map(range.start),
      end = map(range.end);
    return start && end ? { start, end } : null;
  }
  const horizontal = direction === "left";
  const selectedStart = horizontal ? selected.start.row : selected.start.column;
  const selectedEnd = horizontal ? selected.end.row : selected.end.column;
  const rangeStart = horizontal ? range.start.row : range.start.column;
  const rangeEnd = horizontal ? range.end.row : range.end.column;
  if (rangeStart <= selectedEnd && selectedStart <= rangeEnd) {
    // A reference spanning only part of the shifted band becomes non-rectangular.
    if (rangeStart < selectedStart || rangeEnd > selectedEnd) return null;
    const deletedStart = horizontal ? selected.start.column : selected.start.row;
    const deletedEnd = horizontal ? selected.end.column : selected.end.row;
    const start = horizontal ? range.start.column : range.start.row;
    const end = horizontal ? range.end.column : range.end.row;
    if (end >= deletedStart && start <= deletedEnd) {
      const count = deletedEnd - deletedStart + 1;
      const nextStart = start < deletedStart ? start : deletedStart;
      const nextEnd = end > deletedEnd ? end - count : deletedStart - 1;
      if (nextEnd < nextStart) return null;
      return horizontal
        ? {
            start: { row: range.start.row, column: nextStart },
            end: { row: range.end.row, column: nextEnd },
          }
        : {
            start: { row: nextStart, column: range.start.column },
            end: { row: nextEnd, column: range.end.column },
          };
    }
  }
  const start = map(range.start),
    end = map(range.end);
  return start && end ? { start, end } : null;
}

function assertFormulaRangesAreSafe(
  workbook: Workbook,
  sheetId: string,
  range: Range,
  movement: Range,
  direction: CellShiftCommand["direction"],
): void {
  const targetName = workbook.sheets.get(sheetId)?.name.toLowerCase();
  const horizontal = direction === "right" || direction === "left";
  for (const sourceSheet of workbook.sheets.values()) {
    for (const cell of sourceSheet.cells.values()) {
      if (cell.content?.kind !== "formula") continue;
      for (const formulaRange of collectFormulaRanges(cell.content.formula.source)) {
        const qualified = formulaRange.start.sheetName;
        const targetsSheet = qualified
          ? qualified.toLowerCase() === targetName
          : sourceSheet.id === sheetId;
        if (!targetsSheet) continue;
        const reference = { start: formulaRange.start, end: formulaRange.end };
        if (!intersects(reference, movement)) continue;
        const stripeStart = horizontal ? reference.start.row : reference.start.column;
        const stripeEnd = horizontal ? reference.end.row : reference.end.column;
        const selectedStart = horizontal ? range.start.row : range.start.column;
        const selectedEnd = horizontal ? range.end.row : range.end.column;
        if (stripeStart < selectedStart || stripeEnd > selectedEnd)
          throw invalidCommandPayload("range", range, "Cell shifts cannot split a formula range.");
        if (qualified)
          throw invalidCommandPayload(
            "range",
            range,
            "Cell shifts cannot safely rewrite a qualified formula range.",
          );
      }
    }
    for (const rule of sourceSheet.conditionalFormats ?? []) {
      for (const formula of conditionalFormatFormulaSources(rule))
        for (const formulaRange of collectFormulaRanges(formula)) {
          const qualified = formulaRange.start.sheetName;
          const targetsSheet = qualified
            ? qualified.toLowerCase() === targetName
            : sourceSheet.id === sheetId;
          if (!targetsSheet) continue;
          const reference = { start: formulaRange.start, end: formulaRange.end };
          if (!intersects(reference, movement)) continue;
          throw invalidCommandPayload(
            "range",
            range,
            "Cell shifts intersecting a conditional-format formula reference are not supported.",
          );
        }
    }
  }
}

export function applyCellShiftCommand(
  workbook: Workbook,
  command: CellShiftCommand,
): RestoreCellShiftCommand | null {
  const range = validate(command);
  if (
    [...workbook.sheets.values()].some(
      (entry) => entry.filter?.advanced?.criteria?.sheetId === command.sheetId,
    )
  )
    throw invalidCommandPayload(
      "sheetId",
      command.sheetId,
      "Cell shifts on a sheet used by active advanced filter criteria are not supported.",
    );
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const movement: Range =
    command.direction === "right" || command.direction === "left"
      ? {
          start: { row: range.start.row, column: range.start.column },
          end: { row: range.end.row, column: MAX_SHEET_COLUMNS - 1 },
        }
      : {
          start: { row: range.start.row, column: range.start.column },
          end: { row: MAX_SHEET_ROWS - 1, column: range.end.column },
        };
  if (sheet.mergedCells.some((merged) => intersects(merged, movement)))
    throw invalidCommandPayload(
      "range",
      range,
      "Cell shifts cannot split or overwrite merged cells.",
    );
  if (sheet.filter && intersects(sheet.filter.range, movement))
    throw invalidCommandPayload(
      "range",
      range,
      "Cell shifts inside an active filter are not supported.",
    );
  if (
    (sheet.protection?.editableRanges ?? []).some((entry) => intersects(entry.range, movement)) ||
    (sheet.dataValidations ?? []).some((rule) => intersects(rule.range, movement)) ||
    (sheet.subtotalMetadata ?? []).some((entry) => intersects(entry.range, movement)) ||
    (sheet.duplicateRules ?? []).some((rule) => intersects(rule.range, movement)) ||
    (sheet.conditionalFormats ?? []).some((rule) =>
      rule.ranges.some((appliesTo) => intersects(appliesTo, movement)),
    )
  )
    throw invalidCommandPayload(
      "range",
      range,
      "Cell shifts intersecting data validation, conditional-format, duplicate, or subtotal ranges are not supported.",
    );
  const outlineAxis =
    command.direction === "left" || command.direction === "right" ? "column" : "row";
  const outlineStart = outlineAxis === "row" ? movement.start.row : movement.start.column;
  const outlineEnd = outlineAxis === "row" ? movement.end.row : movement.end.column;
  if (
    (sheet.outlineGroups ?? []).some(
      (group) =>
        group.axis === outlineAxis && group.start <= outlineEnd && outlineStart <= group.end,
    )
  )
    throw invalidCommandPayload(
      "range",
      range,
      "Cell shifts intersecting outline groups are not supported.",
    );
  assertFormulaRangesAreSafe(workbook, sheet.id, range, movement, command.direction);

  const map = createMap(range, command.direction);
  const previousState = createSheetSparseState(sheet);
  if (command.type === "insertCells") {
    const overflow =
      previousState.cells.some((cell) => !map(cell.address)) ||
      sheet.floatingImages.some((image) => !map(image.anchor)) ||
      (sheet.drawings ?? []).some((drawing) => !map(drawing.anchor));
    if (overflow)
      throw invalidCommandPayload(
        "range",
        range,
        "Cell insertion would discard content at the sheet boundary.",
      );
  }
  const nextState = cloneSparseState(previousState);
  nextState.cells = previousState.cells.flatMap((cell) => {
    const address = map(cell.address);
    if (!address) return [];
    const content =
      cell.content?.kind === "formula"
        ? {
            kind: "formula" as const,
            formula: {
              source: transformFormulaReferences(cell.content.formula.source, map, (formulaRange) =>
                transformFormulaRange(formulaRange, map, range, command.direction),
              ),
            },
          }
        : cell.content === undefined
          ? undefined
          : cloneCellContent(cell.content);
    return [
      {
        ...cell,
        address,
        ...(content === undefined ? {} : { content }),
        ...(cell.sparkline
          ? {
              sparkline: {
                ...cell.sparkline,
                source: cell.sparkline.source
                  ? transformFormulaRange(cell.sparkline.source, map, range, command.direction)
                  : null,
              },
            }
          : {}),
      },
    ];
  });
  nextState.drawings = (previousState.drawings ?? []).flatMap((drawing) => {
    const anchor = map(drawing.anchor);
    return anchor
      ? [
          {
            ...mapDrawingSource({ ...drawing, anchor }, (source) =>
              transformFormulaRange(source, map, range, command.direction),
            ),
          },
        ]
      : [];
  });
  nextState.floatingImages = previousState.floatingImages.flatMap((image) => {
    const anchor = map(image.anchor);
    return anchor ? [{ ...image, anchor }] : [];
  });
  const workbookFormulaSources = [...workbook.sheets.values()].flatMap((sourceSheet) =>
    sourceSheet.id === sheet.id
      ? []
      : [...sourceSheet.cells].flatMap(([key, cell]) =>
          cell.content?.kind === "formula"
            ? [
                {
                  sheetId: sourceSheet.id,
                  address: parseCellKey(key),
                  source: cell.content.formula.source,
                },
              ]
            : [],
        ),
  );
  const definedNames = cloneDefinedNames(workbook);
  const transformedNames = definedNames.flatMap((definition) => {
    if (definition.reference.sheetId !== sheet.id) return [definition];
    const reference = transformDefinedNameRange(
      definition.reference,
      map,
      range,
      command.direction,
    );
    return reference ? [{ ...definition, reference: { sheetId: sheet.id, ...reference } }] : [];
  });
  const stateChanged = validateCommandPayload("range", command.range, () =>
    replaceSheetSparseState(sheet, nextState),
  );
  rewriteQualifiedReferencesForSheet(workbook, sheet.id, map);
  workbook.definedNames.clear();
  for (const definition of transformedNames) workbook.definedNames.set(definition.id, definition);
  const externalChanged =
    workbookFormulaSources.some((formula) => {
      const current = workbook.sheets
        .get(formula.sheetId)
        ?.cells.get(createCellKey(formula.address))?.content;
      return current?.kind === "formula" && current.formula.source !== formula.source;
    }) || JSON.stringify(definedNames) !== JSON.stringify(transformedNames);
  return stateChanged || externalChanged
    ? {
        type: "restoreCellShift",
        sheetId: sheet.id,
        state: previousState,
        direction: command.direction,
        range,
        operation: command.type === "insertCells" ? "insert" : "delete",
        workbookFormulaSources,
        definedNames,
      }
    : null;
}

export function applyRestoreCellShiftCommand(
  workbook: Workbook,
  command: RestoreCellShiftCommand,
): CellShiftCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const original =
    command.operation === "insert"
      ? createInsertCellsCommand(
          command.sheetId,
          command.range,
          command.direction as InsertCellsCommand["direction"],
        )
      : createDeleteCellsCommand(
          command.sheetId,
          command.range,
          command.direction as DeleteCellsCommand["direction"],
        );
  validate(original);
  const formulaChanged = command.workbookFormulaSources.some((formula) => {
    const current = workbook.sheets
      .get(formula.sheetId)
      ?.cells.get(createCellKey(formula.address))?.content;
    return current?.kind === "formula" && current.formula.source !== formula.source;
  });
  const namesChanged =
    JSON.stringify(cloneDefinedNames(workbook)) !== JSON.stringify(command.definedNames);
  const changed = validateCommandPayload("state", command.state, () =>
    replaceSheetSparseState(sheet, command.state),
  );
  for (const formula of command.workbookFormulaSources) {
    const target = workbook.sheets.get(formula.sheetId);
    const cell = target?.cells.get(createCellKey(formula.address));
    if (target && cell?.content?.kind === "formula")
      target.cells.set(createCellKey(formula.address), {
        ...cell,
        content: { kind: "formula", formula: { source: formula.source } },
      });
  }
  workbook.definedNames.clear();
  for (const definition of command.definedNames)
    workbook.definedNames.set(definition.id, definition);
  return changed || formulaChanged || namesChanged ? original : null;
}
