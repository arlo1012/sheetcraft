import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  cloneCellContent,
  createCellKey,
  createSheetSparseState,
  replaceSheetSparseState,
  type Sheet,
  type SheetDimensionAxis,
  type SheetSparseCell,
  type SheetSparseState,
  type Workbook,
} from "../workbook.js";
import { transformFormulaForAxis } from "../formula/references.js";
import { cloneCellStyle } from "../style.js";
import type {
  DeleteSheetAxisCommand,
  InsertSheetAxisCommand,
  RestoreFullSheetStateCommand,
  RestoreSheetAxisSliceCommand,
  RestoreSheetStateCommand,
  SheetAxisSparseSlice,
} from "./contracts.js";
import {
  cloneSparseState,
  getSheetOrThrow,
  invalidCommandPayload,
  parseCellKey,
  validateCommandPayload,
} from "./helpers.js";

export function createInsertSheetAxisCommand(
  sheetId: string,
  axis: SheetDimensionAxis,
  index: number,
  count = 1,
): InsertSheetAxisCommand {
  return { type: "insertSheetAxis", sheetId, axis, index, count };
}

export function createDeleteSheetAxisCommand(
  sheetId: string,
  axis: SheetDimensionAxis,
  index: number,
  count = 1,
): DeleteSheetAxisCommand {
  return { type: "deleteSheetAxis", sheetId, axis, index, count };
}

export function createRestoreSheetStateCommand(
  sheetId: string,
  state: SheetSparseState,
): RestoreFullSheetStateCommand {
  return { type: "restoreSheetState", sheetId, state: cloneSparseState(state) };
}

function getAxisIndex(address: SheetSparseCell["address"], axis: SheetDimensionAxis): number {
  return axis === "row" ? address.row : address.column;
}

function setAxisIndex(
  address: SheetSparseCell["address"],
  axis: SheetDimensionAxis,
  index: number,
): SheetSparseCell["address"] {
  return axis === "row"
    ? { row: index, column: address.column }
    : { row: address.row, column: index };
}

function cloneAxisSlice(slice: SheetAxisSparseSlice): SheetAxisSparseSlice {
  return {
    cells: slice.cells.map((cell) => ({
      address: { ...cell.address },
      ...(cell.content === undefined ? {} : { content: cloneCellContent(cell.content) }),
      ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
    })),
    dimensions: slice.dimensions.map((dimension) => ({ ...dimension })),
    ...(slice.formulaSources
      ? {
          formulaSources: slice.formulaSources.map((formula) => ({
            address: { ...formula.address },
            source: formula.source,
          })),
        }
      : {}),
  };
}

function createRestoreSheetAxisSliceCommand(
  sheetId: string,
  axis: SheetDimensionAxis,
  index: number,
  count: number,
  operation: RestoreSheetAxisSliceCommand["operation"],
  slice: SheetAxisSparseSlice,
): RestoreSheetAxisSliceCommand {
  return {
    type: "restoreSheetState",
    sheetId,
    axis,
    index,
    count,
    operation,
    slice: cloneAxisSlice(slice),
  };
}

function assertSheetAxisRange(axis: SheetDimensionAxis, index: number, count: number): number {
  if (axis !== "row" && axis !== "column") {
    throw invalidCommandPayload("axis", axis);
  }
  const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  if (!Number.isInteger(index) || index < 0 || index >= maximum) {
    throw invalidCommandPayload(
      "index",
      index,
      `${axis === "row" ? "Row" : "Column"} index ${index} is outside the sheet.`,
    );
  }
  if (!Number.isInteger(count) || count <= 0 || count > maximum - index) {
    throw invalidCommandPayload(
      "count",
      count,
      `Cannot change ${count} ${axis}s starting at index ${index}.`,
    );
  }
  return maximum;
}

function transformAxisIndex(
  value: number,
  index: number,
  count: number,
  maximum: number,
  operation: "insert" | "delete",
): number | null {
  if (operation === "insert") {
    if (value >= maximum - count) return null;
    return value >= index ? value + count : value;
  }
  if (value >= index && value < index + count) return null;
  return value >= index + count ? value - count : value;
}

function compareAxisEntries(
  left: { index: number },
  right: { index: number },
  operation: "insert" | "delete",
): number {
  return operation === "insert" ? right.index - left.index : left.index - right.index;
}

function transformSheetAxis(
  sheet: Sheet,
  axis: SheetDimensionAxis,
  index: number,
  count: number,
  maximum: number,
  operation: "insert" | "delete",
): boolean {
  const cells = [...sheet.cells].flatMap(([key, cell]) => {
    const address = parseCellKey(key);
    const sourceIndex = getAxisIndex(address, axis);
    return sourceIndex >= index ? [{ key, cell, address, index: sourceIndex }] : [];
  });
  const dimensions = axis === "row" ? sheet.rowHeights : sheet.columnWidths;
  const dimensionEntries = [...dimensions].flatMap(([dimensionIndex, size]) =>
    dimensionIndex >= index ? [{ index: dimensionIndex, size }] : [],
  );

  let changed = false;

  if (operation === "delete") {
    for (const entry of cells) {
      if (entry.index < index + count) {
        sheet.cells.delete(entry.key);
        changed = true;
      }
    }
    for (const entry of dimensionEntries) {
      if (entry.index < index + count) {
        dimensions.delete(entry.index);
        changed = true;
      }
    }
  }

  cells.sort((left, right) => compareAxisEntries(left, right, operation));
  for (const entry of cells) {
    const targetIndex = transformAxisIndex(entry.index, index, count, maximum, operation);
    if (targetIndex === null) {
      sheet.cells.delete(entry.key);
      changed = true;
      continue;
    }
    const targetAddress = setAxisIndex(entry.address, axis, targetIndex);
    const targetKey = createCellKey(targetAddress);
    if (targetKey !== entry.key) {
      sheet.cells.set(targetKey, entry.cell);
      sheet.cells.delete(entry.key);
      changed = true;
    }
  }

  dimensionEntries.sort((left, right) => compareAxisEntries(left, right, operation));
  for (const entry of dimensionEntries) {
    const targetIndex = transformAxisIndex(entry.index, index, count, maximum, operation);
    if (targetIndex === null) {
      dimensions.delete(entry.index);
      changed = true;
      continue;
    }
    if (targetIndex !== entry.index) {
      dimensions.set(targetIndex, entry.size);
      dimensions.delete(entry.index);
      changed = true;
    }
  }
  for (const [key, cell] of sheet.cells) {
    if (cell.content?.kind !== "formula") continue;
    const source = transformFormulaForAxis(cell.content.formula.source, {
      axis,
      operation,
      index,
      count,
    });
    if (source === cell.content.formula.source) continue;
    sheet.cells.set(key, { ...cell, content: { kind: "formula", formula: { source } } });
    changed = true;
  }
  return changed;
}

function captureSheetAxisSlice(
  sheet: Sheet,
  axis: SheetDimensionAxis,
  start: number,
  end: number,
): SheetAxisSparseSlice {
  const cells = [...sheet.cells].flatMap(([key, cell]) => {
    const address = parseCellKey(key);
    return getAxisIndex(address, axis) >= start && getAxisIndex(address, axis) < end
      ? [
          {
            address,
            ...(cell.content === undefined ? {} : { content: cloneCellContent(cell.content) }),
            ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
          },
        ]
      : [];
  });
  const dimensions = axis === "row" ? sheet.rowHeights : sheet.columnWidths;
  const capturedDimensions = [...dimensions].flatMap(([dimensionIndex, size]) =>
    dimensionIndex >= start && dimensionIndex < end ? [{ index: dimensionIndex, size }] : [],
  );
  cells.sort(
    (left, right) =>
      getAxisIndex(left.address, axis) - getAxisIndex(right.address, axis) ||
      (axis === "row"
        ? left.address.column - right.address.column
        : left.address.row - right.address.row),
  );
  capturedDimensions.sort((left, right) => left.index - right.index);
  const formulaSources = [...sheet.cells].flatMap(([key, cell]) => {
    if (cell.content?.kind !== "formula") return [];
    return [{ address: parseCellKey(key), source: cell.content.formula.source }];
  });
  formulaSources.sort(
    (left, right) =>
      left.address.row - right.address.row || left.address.column - right.address.column,
  );
  return { cells, dimensions: capturedDimensions, formulaSources };
}

function restoreSheetAxisSlice(
  sheet: Sheet,
  axis: SheetDimensionAxis,
  slice: SheetAxisSparseSlice,
): boolean {
  let changed = false;
  for (const cell of slice.cells) {
    const key = createCellKey(cell.address);
    const current = sheet.cells.get(key);
    if (current?.content === cell.content && current?.style === cell.style) {
      continue;
    }
    sheet.cells.set(key, {
      ...(cell.content === undefined ? {} : { content: cloneCellContent(cell.content) }),
      ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
    });
    changed = true;
  }
  const dimensions = axis === "row" ? sheet.rowHeights : sheet.columnWidths;
  for (const dimension of slice.dimensions) {
    if (dimensions.get(dimension.index) === dimension.size) {
      continue;
    }
    dimensions.set(dimension.index, dimension.size);
    changed = true;
  }
  for (const formula of slice.formulaSources ?? []) {
    const key = createCellKey(formula.address);
    const current = sheet.cells.get(key);
    if (
      !current ||
      current.content?.kind !== "formula" ||
      current.content.formula.source === formula.source
    )
      continue;
    sheet.cells.set(key, {
      ...current,
      content: { kind: "formula", formula: { source: formula.source } },
    });
    changed = true;
  }
  return changed;
}

function isAxisSliceRestoreCommand(
  command: RestoreSheetStateCommand,
): command is RestoreSheetAxisSliceCommand {
  return "slice" in command;
}

function validateSheetAxisSlice(
  command: RestoreSheetAxisSliceCommand,
  maximum: number,
  sheet: Sheet,
): void {
  if (command.operation !== "insert" && command.operation !== "delete") {
    throw invalidCommandPayload("operation", command.operation);
  }
  const start = command.operation === "insert" ? maximum - command.count : command.index;
  const end = command.operation === "insert" ? maximum : command.index + command.count;
  for (const cell of command.slice.cells) {
    const axisIndex = getAxisIndex(cell.address, command.axis);
    if (axisIndex < start || axisIndex >= end) {
      throw invalidCommandPayload(
        "slice.cells",
        axisIndex,
        `Axis restore cell ${axisIndex} is outside the restored slice.`,
      );
    }
  }
  for (const dimension of command.slice.dimensions) {
    if (dimension.index < start || dimension.index >= end) {
      throw invalidCommandPayload(
        "slice.dimensions",
        dimension.index,
        `Axis restore dimension ${dimension.index} is outside the restored slice.`,
      );
    }
  }

  // Reuse the sparse-state validator without copying the target Sheet.
  const validationSheet: Sheet = {
    id: "axis-slice-validation",
    name: "Axis slice validation",
    cells: new Map(),
    rowHeights: new Map(),
    columnWidths: new Map(),
  };
  validateCommandPayload("slice", command.slice, () =>
    replaceSheetSparseState(validationSheet, {
      cells: command.slice.cells,
      rowHeights: command.axis === "row" ? command.slice.dimensions : [],
      columnWidths: command.axis === "column" ? command.slice.dimensions : [],
    }),
  );
  for (const formula of command.slice.formulaSources ?? []) {
    if (
      !formula ||
      !Number.isInteger(formula.address?.row) ||
      !Number.isInteger(formula.address?.column) ||
      typeof formula.source !== "string" ||
      !formula.source.startsWith("=")
    ) {
      throw invalidCommandPayload("slice.formulaSources", formula);
    }
    const expectedAddress = transformAxisIndex(
      getAxisIndex(formula.address, command.axis),
      command.index,
      command.count,
      maximum,
      command.operation,
    );
    if (expectedAddress === null) {
      const captured = command.slice.cells.find(
        (cell) =>
          cell.address.row === formula.address.row &&
          cell.address.column === formula.address.column &&
          cell.content?.kind === "formula" &&
          cell.content.formula.source === formula.source,
      );
      if (!captured) throw invalidCommandPayload("slice.formulaSources", formula);
      continue;
    }
    const currentAddress = setAxisIndex(formula.address, command.axis, expectedAddress);
    const current = sheet.cells.get(createCellKey(currentAddress))?.content;
    const expectedSource = transformFormulaForAxis(formula.source, {
      axis: command.axis,
      operation: command.operation,
      index: command.index,
      count: command.count,
    });
    if (current?.kind !== "formula" || current.formula.source !== expectedSource) {
      throw invalidCommandPayload(
        "slice.formulaSources",
        formula,
        "Formula source restore is not associated with this structural inverse.",
      );
    }
  }
}

export function applyRestoreSheetStateCommand(
  workbook: Workbook,
  command: RestoreSheetStateCommand,
): RestoreSheetStateCommand | InsertSheetAxisCommand | DeleteSheetAxisCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  if (isAxisSliceRestoreCommand(command)) {
    const maximum = assertSheetAxisRange(command.axis, command.index, command.count);
    validateCommandPayload("slice", command.slice, () =>
      validateSheetAxisSlice(command, maximum, sheet),
    );
    const inverseOperation = command.operation === "insert" ? "delete" : "insert";
    const transformed = transformSheetAxis(
      sheet,
      command.axis,
      command.index,
      command.count,
      maximum,
      inverseOperation,
    );
    const restored = restoreSheetAxisSlice(sheet, command.axis, command.slice);
    if (!transformed && !restored) return null;
    return command.operation === "insert"
      ? createInsertSheetAxisCommand(command.sheetId, command.axis, command.index, command.count)
      : createDeleteSheetAxisCommand(command.sheetId, command.axis, command.index, command.count);
  }

  const previousState = createSheetSparseState(sheet);
  return validateCommandPayload("state", command.state, () =>
    replaceSheetSparseState(sheet, command.state),
  )
    ? createRestoreSheetStateCommand(command.sheetId, previousState)
    : null;
}

export function applySheetAxisCommand(
  workbook: Workbook,
  command: InsertSheetAxisCommand | DeleteSheetAxisCommand,
): RestoreSheetAxisSliceCommand | null {
  const maximum = assertSheetAxisRange(command.axis, command.index, command.count);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const operation = command.type === "insertSheetAxis" ? "insert" : "delete";
  const slice = captureSheetAxisSlice(
    sheet,
    command.axis,
    operation === "insert" ? maximum - command.count : command.index,
    operation === "insert" ? maximum : command.index + command.count,
  );
  const changed = transformSheetAxis(
    sheet,
    command.axis,
    command.index,
    command.count,
    maximum,
    operation,
  );
  return changed
    ? createRestoreSheetAxisSliceCommand(
        command.sheetId,
        command.axis,
        command.index,
        command.count,
        operation,
        slice,
      )
    : null;
}
