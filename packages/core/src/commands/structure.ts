import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  cloneCellContent,
  cloneFloatingImage,
  createCellKey,
  createSheetSparseState,
  getSheetMetadata,
  replaceSheetSparseState,
  setSheetMetadata,
  type Sheet,
  type FloatingImage,
  type SheetDimensionAxis,
  type SheetFilter,
  type SheetMetadata,
  type SheetSparseCell,
  type SheetSparseState,
  type Workbook,
} from "../workbook.js";
import {
  collectFormulaRanges,
  transformFormulaForAxis,
  transformFormulaForAxisMove,
} from "../formula/references.js";
import { rewriteQualifiedReferencesForSheet } from "../formula/workbook-references.js";
import {
  transformMergedCellRangesForAxisDelete,
  transformMergedCellRangesForAxisInsert,
} from "../merged-cells.js";
import { cloneCellStyle } from "../style.js";
import type {
  DeleteSheetAxisCommand,
  InsertSheetAxisCommand,
  MoveSheetAxisCommand,
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

export function createMoveSheetAxisCommand(
  sheetId: string,
  axis: SheetDimensionAxis,
  index: number,
  count: number,
  toIndex: number,
  mode: MoveSheetAxisCommand["mode"] = "insert",
): MoveSheetAxisCommand {
  return { type: "moveSheetAxis", sheetId, axis, index, count, toIndex, mode };
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
    ...(slice.hiddenIndexes ? { hiddenIndexes: [...slice.hiddenIndexes] } : {}),
    floatingImages: slice.floatingImages.map(({ image, index }) => ({
      image: cloneFloatingImage(image),
      index,
    })),
    ...(slice.formulaSources
      ? {
          formulaSources: slice.formulaSources.map((formula) => ({
            address: { ...formula.address },
            source: formula.source,
          })),
        }
      : {}),
    ...(slice.workbookFormulaSources
      ? {
          workbookFormulaSources: slice.workbookFormulaSources.map((formula) => ({
            sheetId: formula.sheetId,
            address: { ...formula.address },
            source: formula.source,
          })),
        }
      : {}),
    ...(slice.definedNames
      ? {
          definedNames: slice.definedNames.map((definition) => ({
            ...definition,
            reference: {
              sheetId: definition.reference.sheetId,
              start: { ...definition.reference.start },
              end: { ...definition.reference.end },
            },
          })),
        }
      : {}),
    metadata: cloneSheetMetadata(slice.metadata),
  };
}

function cloneSheetMetadata(metadata: SheetMetadata): SheetMetadata {
  return {
    freezePanes: { ...metadata.freezePanes },
    filter: metadata.filter
      ? {
          range: {
            start: { ...metadata.filter.range.start },
            end: { ...metadata.filter.range.end },
          },
          columns: metadata.filter.columns.map((column) => ({
            column: column.column,
            allowedValues: column.allowedValues.map((value) => ({ ...value })),
          })),
        }
      : null,
    mergedCells: metadata.mergedCells.map((range) => ({
      start: { ...range.start },
      end: { ...range.end },
    })),
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

function assertSheetAxisMove(command: MoveSheetAxisCommand): number {
  const maximum = assertSheetAxisRange(command.axis, command.index, command.count);
  if (
    !Number.isInteger(command.toIndex) ||
    command.toIndex < 0 ||
    command.toIndex > maximum - command.count
  ) {
    throw invalidCommandPayload(
      "toIndex",
      command.toIndex,
      `Moved ${command.axis}s must remain inside the sheet.`,
    );
  }
  if (command.mode !== undefined && command.mode !== "insert" && command.mode !== "overwrite") {
    throw invalidCommandPayload("mode", command.mode);
  }
  if (command.mode === "overwrite") {
    throw invalidCommandPayload(
      "mode",
      command.mode,
      "Overwriting rows or columns during a move is not supported yet.",
    );
  }
  return maximum;
}

function transformAxisIndexForMove(
  value: number,
  index: number,
  count: number,
  toIndex: number,
): number {
  if (index === toIndex) return value;
  const sourceEnd = index + count;
  if (value >= index && value < sourceEnd) return toIndex + value - index;
  if (toIndex < index) return value >= toIndex && value < index ? value + count : value;
  return value >= sourceEnd && value < toIndex + count ? value - count : value;
}

function transformRangeForAxisMove(
  range: { start: { row: number; column: number }; end: { row: number; column: number } },
  axis: SheetDimensionAxis,
  index: number,
  count: number,
  toIndex: number,
): typeof range | null {
  const start = axis === "row" ? range.start.row : range.start.column;
  const end = axis === "row" ? range.end.row : range.end.column;
  const nextStart = transformAxisIndexForMove(start, index, count, toIndex);
  const nextEnd = transformAxisIndexForMove(end, index, count, toIndex);
  // A merged/filter/formula range can only survive a move when it remains one
  // contiguous physical range. Rejecting before mutation keeps the command atomic.
  if (nextStart > nextEnd || nextEnd - nextStart !== end - start) return null;
  return axis === "row"
    ? {
        start: { row: nextStart, column: range.start.column },
        end: { row: nextEnd, column: range.end.column },
      }
    : {
        start: { row: range.start.row, column: nextStart },
        end: { row: range.end.row, column: nextEnd },
      };
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

function transformRangeForAxis(
  range: {
    start: { row: number; column: number };
    end: { row: number; column: number };
  },
  axis: SheetDimensionAxis,
  index: number,
  count: number,
  maximum: number,
  operation: "insert" | "delete",
): typeof range | null {
  const start = axis === "row" ? range.start.row : range.start.column;
  const end = axis === "row" ? range.end.row : range.end.column;
  const deletedEnd = index + count - 1;
  let nextStart = start;
  let nextEnd = end;
  if (operation === "insert") {
    if (index <= start) {
      nextStart += count;
      nextEnd += count;
    } else if (index <= end) nextEnd += count;
    if (nextStart >= maximum) return null;
    nextEnd = Math.min(maximum - 1, nextEnd);
  } else if (end < index) {
    // no-op
  } else if (start > deletedEnd) {
    nextStart -= count;
    nextEnd -= count;
  } else {
    nextStart = start < index ? start : index;
    nextEnd = end > deletedEnd ? end - count : index - 1;
    if (nextEnd < nextStart) return null;
  }
  return axis === "row"
    ? {
        start: { row: nextStart, column: range.start.column },
        end: { row: nextEnd, column: range.end.column },
      }
    : {
        start: { row: range.start.row, column: nextStart },
        end: { row: range.end.row, column: nextEnd },
      };
}

function transformFilterForAxis(
  filter: SheetFilter | null,
  axis: SheetDimensionAxis,
  index: number,
  count: number,
  maximum: number,
  operation: "insert" | "delete",
): SheetFilter | null {
  if (!filter) return null;
  if (
    axis === "row" &&
    operation === "delete" &&
    index <= filter.range.start.row &&
    filter.range.start.row < index + count
  ) {
    return null;
  }
  const range = transformRangeForAxis(filter.range, axis, index, count, maximum, operation);
  if (!range) return null;
  const columns =
    axis === "row"
      ? filter.columns.map((column) => ({
          column: column.column,
          allowedValues: column.allowedValues.map((value) => ({ ...value })),
        }))
      : filter.columns.flatMap((column) => {
          const next = transformAxisIndex(column.column, index, count, maximum, operation);
          return next === null
            ? []
            : [
                {
                  column: next,
                  allowedValues: column.allowedValues.map((value) => ({
                    ...value,
                  })),
                },
              ];
        });
  if (range.end.row <= range.start.row) return null;
  return { range, columns };
}

function transformSheetMetadataForAxis(
  metadata: SheetMetadata,
  axis: SheetDimensionAxis,
  index: number,
  count: number,
  maximum: number,
  operation: "insert" | "delete",
): SheetMetadata {
  const freezeValue = axis === "row" ? metadata.freezePanes.rows : metadata.freezePanes.columns;
  const nextFreezeValue =
    operation === "insert"
      ? index <= freezeValue
        ? Math.min(maximum, freezeValue + count)
        : freezeValue
      : freezeValue <= index
        ? freezeValue
        : Math.max(index, freezeValue - count);
  const mergedCells =
    operation === "insert"
      ? transformMergedCellRangesForAxisInsert(metadata.mergedCells, axis, index, count)
      : transformMergedCellRangesForAxisDelete(metadata.mergedCells, axis, index, count);
  return {
    freezePanes:
      axis === "row"
        ? { rows: nextFreezeValue, columns: metadata.freezePanes.columns }
        : { rows: metadata.freezePanes.rows, columns: nextFreezeValue },
    filter: transformFilterForAxis(metadata.filter, axis, index, count, maximum, operation),
    mergedCells,
  };
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
  const hiddenIndexes = axis === "row" ? sheet.hiddenRows : sheet.hiddenColumns;
  const dimensionEntries = [...dimensions].flatMap(([dimensionIndex, size]) =>
    dimensionIndex >= index ? [{ index: dimensionIndex, size }] : [],
  );
  const hiddenEntries = [...(hiddenIndexes ?? [])].filter((hiddenIndex) => hiddenIndex >= index);

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
    for (const hiddenIndex of hiddenEntries) {
      if (hiddenIndex < index + count) {
        hiddenIndexes?.delete(hiddenIndex);
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
  hiddenEntries.sort((left, right) => (operation === "insert" ? right - left : left - right));
  for (const hiddenIndex of hiddenEntries) {
    const targetIndex = transformAxisIndex(hiddenIndex, index, count, maximum, operation);
    if (targetIndex === null) {
      hiddenIndexes?.delete(hiddenIndex);
      changed = true;
      continue;
    }
    if (targetIndex !== hiddenIndex) {
      hiddenIndexes?.add(targetIndex);
      hiddenIndexes?.delete(hiddenIndex);
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
    sheet.cells.set(key, {
      ...cell,
      content: { kind: "formula", formula: { source } },
    });
    changed = true;
  }
  const transformedFloatingImages: FloatingImage[] = [];
  for (const image of sheet.floatingImages) {
    const sourceIndex = axis === "row" ? image.anchor.row : image.anchor.column;
    const targetIndex = transformAxisIndex(sourceIndex, index, count, maximum, operation);
    if (targetIndex === null) {
      changed = true;
      continue;
    }
    if (targetIndex === sourceIndex) transformedFloatingImages.push(image);
    else {
      transformedFloatingImages.push({
        ...image,
        anchor:
          axis === "row"
            ? { row: targetIndex, column: image.anchor.column }
            : { row: image.anchor.row, column: targetIndex },
      });
      changed = true;
    }
  }
  sheet.floatingImages = transformedFloatingImages;
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
  const hiddenIndexes = axis === "row" ? sheet.hiddenRows : sheet.hiddenColumns;
  const capturedDimensions = [...dimensions].flatMap(([dimensionIndex, size]) =>
    dimensionIndex >= start && dimensionIndex < end ? [{ index: dimensionIndex, size }] : [],
  );
  const capturedHiddenIndexes = [...(hiddenIndexes ?? [])].filter(
    (hiddenIndex) => hiddenIndex >= start && hiddenIndex < end,
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
  const floatingImages = sheet.floatingImages.flatMap((image, imageIndex) => {
    const axisIndex = axis === "row" ? image.anchor.row : image.anchor.column;
    return axisIndex >= start && axisIndex < end
      ? [{ image: cloneFloatingImage(image), index: imageIndex }]
      : [];
  });
  formulaSources.sort(
    (left, right) =>
      left.address.row - right.address.row || left.address.column - right.address.column,
  );
  return {
    cells,
    dimensions: capturedDimensions,
    hiddenIndexes: capturedHiddenIndexes,
    floatingImages,
    formulaSources,
    metadata: getSheetMetadata(sheet),
  };
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
  const hiddenIndexes = axis === "row" ? sheet.hiddenRows : sheet.hiddenColumns;
  for (const dimension of slice.dimensions) {
    if (dimensions.get(dimension.index) === dimension.size) {
      continue;
    }
    dimensions.set(dimension.index, dimension.size);
    changed = true;
  }
  for (const hiddenIndex of slice.hiddenIndexes ?? []) {
    if (hiddenIndexes?.has(hiddenIndex)) continue;
    hiddenIndexes?.add(hiddenIndex);
    changed = true;
  }
  for (const { image, index } of slice.floatingImages) {
    if (sheet.floatingImages.some((current) => current.id === image.id)) continue;
    sheet.floatingImages.splice(
      Math.min(index, sheet.floatingImages.length),
      0,
      cloneFloatingImage(image),
    );
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
  if (slice.metadata && setSheetMetadata(sheet, slice.metadata)) changed = true;
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
  if (!command.slice.metadata) {
    throw invalidCommandPayload("slice.metadata", command.slice.metadata);
  }
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
  for (const hiddenIndex of command.slice.hiddenIndexes ?? []) {
    if (!Number.isInteger(hiddenIndex) || hiddenIndex < start || hiddenIndex >= end) {
      throw invalidCommandPayload("slice.hiddenIndexes", hiddenIndex);
    }
  }
  for (const entry of command.slice.floatingImages) {
    if (!Number.isInteger(entry.index) || entry.index < 0) {
      throw invalidCommandPayload("slice.floatingImages", entry);
    }
    validateCommandPayload("slice.floatingImages", entry.image, () => {
      const validationSheet: Sheet = {
        id: "floating-image-validation",
        name: "Floating image validation",
        properties: { pinned: false, hidden: false, protected: false },
        cells: new Map(),
        rowHeights: new Map(),
        columnWidths: new Map(),
        freezePanes: { rows: 0, columns: 0 },
        filter: null,
        mergedCells: [],
        floatingImages: [entry.image],
      };
      createSheetSparseState(validationSheet);
    });
    const axisIndex = command.axis === "row" ? entry.image.anchor.row : entry.image.anchor.column;
    if (axisIndex < start || axisIndex >= end) {
      throw invalidCommandPayload("slice.floatingImages", entry);
    }
  }

  // Reuse the sparse-state validator without copying the target Sheet.
  const validationSheet: Sheet = {
    id: "axis-slice-validation",
    name: "Axis slice validation",
    properties: { pinned: false, hidden: false, protected: false },
    cells: new Map(),
    rowHeights: new Map(),
    columnWidths: new Map(),
    freezePanes: { rows: 0, columns: 0 },
    filter: null,
    mergedCells: [],
    floatingImages: [],
  };
  validateCommandPayload("slice", command.slice, () =>
    replaceSheetSparseState(validationSheet, {
      cells: command.slice.cells,
      rowHeights: command.axis === "row" ? command.slice.dimensions : [],
      columnWidths: command.axis === "column" ? command.slice.dimensions : [],
      freezePanes: command.slice.metadata.freezePanes,
      filter: command.slice.metadata.filter,
      mergedCells: command.slice.metadata.mergedCells,
      floatingImages: [],
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
  const expectedMetadata = transformSheetMetadataForAxis(
    command.slice.metadata,
    command.axis,
    command.index,
    command.count,
    maximum,
    command.operation,
  );
  if (JSON.stringify(expectedMetadata) !== JSON.stringify(getSheetMetadata(sheet))) {
    throw invalidCommandPayload(
      "slice.metadata",
      command.slice.metadata,
      "Metadata restore is not associated with this structural inverse.",
    );
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
    const nextMetadata = transformSheetMetadataForAxis(
      getSheetMetadata(sheet),
      command.axis,
      command.index,
      command.count,
      maximum,
      inverseOperation,
    );
    const transformed = transformSheetAxis(
      sheet,
      command.axis,
      command.index,
      command.count,
      maximum,
      inverseOperation,
    );
    const metadataTransformed = setSheetMetadata(sheet, nextMetadata);
    const restored = restoreSheetAxisSlice(sheet, command.axis, command.slice);
    for (const formula of command.slice.workbookFormulaSources ?? []) {
      const targetSheet = workbook.sheets.get(formula.sheetId);
      const cell = targetSheet?.cells.get(createCellKey(formula.address));
      if (targetSheet && cell?.content?.kind === "formula")
        targetSheet.cells.set(createCellKey(formula.address), {
          ...cell,
          content: { kind: "formula", formula: { source: formula.source } },
        });
    }
    if (command.slice.definedNames) {
      workbook.definedNames.clear();
      for (const definition of command.slice.definedNames)
        workbook.definedNames.set(definition.id, {
          ...definition,
          reference: {
            sheetId: definition.reference.sheetId,
            start: { ...definition.reference.start },
            end: { ...definition.reference.end },
          },
        });
    }
    if (!transformed && !metadataTransformed && !restored) return null;
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
  slice.workbookFormulaSources = [...workbook.sheets.values()].flatMap((sourceSheet) =>
    [...sourceSheet.cells.entries()].flatMap(([key, cell]) =>
      sourceSheet.id === command.sheetId || cell.content?.kind !== "formula"
        ? []
        : [
            {
              sheetId: sourceSheet.id,
              address: parseCellKey(key),
              source: cell.content.formula.source,
            },
          ],
    ),
  );
  slice.definedNames = [...workbook.definedNames.values()].map((definition) => ({
    ...definition,
    reference: {
      sheetId: definition.reference.sheetId,
      start: { ...definition.reference.start },
      end: { ...definition.reference.end },
    },
  }));
  const nextMetadata = transformSheetMetadataForAxis(
    getSheetMetadata(sheet),
    command.axis,
    command.index,
    command.count,
    maximum,
    operation,
  );
  const changed = transformSheetAxis(
    sheet,
    command.axis,
    command.index,
    command.count,
    maximum,
    operation,
  );
  const metadataChanged = setSheetMetadata(sheet, nextMetadata);
  rewriteQualifiedReferencesForSheet(workbook, command.sheetId, (address) => {
    const value = command.axis === "row" ? address.row : address.column;
    let next = value;
    if (operation === "insert") next = value >= command.index ? value + command.count : value;
    else if (value >= command.index && value < command.index + command.count) return null;
    else if (value >= command.index + command.count) next = value - command.count;
    return command.axis === "row"
      ? { row: next, column: address.column }
      : { row: address.row, column: next };
  });
  for (const [id, definition] of workbook.definedNames) {
    if (definition.reference.sheetId !== command.sheetId) continue;
    const reference = transformRangeForAxis(
      definition.reference,
      command.axis,
      command.index,
      command.count,
      maximum,
      operation,
    );
    if (!reference) {
      workbook.definedNames.delete(id);
      continue;
    }
    workbook.definedNames.set(id, {
      ...definition,
      reference: { ...reference, sheetId: command.sheetId },
    });
  }
  const externalChanged =
    (slice.workbookFormulaSources ?? []).some((formula) => {
      const current = workbook.sheets
        .get(formula.sheetId)
        ?.cells.get(createCellKey(formula.address))?.content;
      return current?.kind === "formula" && current.formula.source !== formula.source;
    }) ||
    JSON.stringify(slice.definedNames) !== JSON.stringify([...workbook.definedNames.values()]);
  return changed || metadataChanged || externalChanged
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

function transformSheetMetadataForAxisMove(
  metadata: SheetMetadata,
  axis: SheetDimensionAxis,
  index: number,
  count: number,
  toIndex: number,
): SheetMetadata {
  const mergedCells = metadata.mergedCells.map((range) => {
    const transformed = transformRangeForAxisMove(range, axis, index, count, toIndex);
    if (!transformed) {
      throw invalidCommandPayload(
        "axis",
        axis,
        "Moving this row or column band would split a merged range.",
      );
    }
    return transformed;
  });
  const filter = metadata.filter
    ? (() => {
        const range = transformRangeForAxisMove(metadata.filter.range, axis, index, count, toIndex);
        if (!range) {
          throw invalidCommandPayload(
            "axis",
            axis,
            "Moving this row or column band would split the active filter range.",
          );
        }
        return {
          range,
          columns: metadata.filter.columns.map((column) => ({
            column:
              axis === "column"
                ? transformAxisIndexForMove(column.column, index, count, toIndex)
                : column.column,
            allowedValues: column.allowedValues.map((value) => ({ ...value })),
          })),
        };
      })()
    : null;
  return { freezePanes: { ...metadata.freezePanes }, filter, mergedCells };
}

function assertFormulaRangesCanMove(
  sheet: Sheet,
  axis: SheetDimensionAxis,
  index: number,
  count: number,
  toIndex: number,
): void {
  for (const cell of sheet.cells.values()) {
    if (cell.content?.kind !== "formula") continue;
    for (const range of collectFormulaRanges(cell.content.formula.source)) {
      if (
        !transformRangeForAxisMove(
          { start: range.start, end: range.end },
          axis,
          index,
          count,
          toIndex,
        )
      ) {
        throw invalidCommandPayload(
          "axis",
          axis,
          "Moving this row or column band would split a formula range.",
        );
      }
    }
  }
}

/** Reorders whole rows or columns while retaining every sparse sheet resource. */
export function applyMoveSheetAxisCommand(
  workbook: Workbook,
  command: MoveSheetAxisCommand,
): RestoreFullSheetStateCommand | null {
  assertSheetAxisMove(command);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  if (command.index === command.toIndex) return null;

  // Validate every non-cell resource before changing the sheet, so an unsupported
  // merge, filter, or formula range leaves the workbook untouched.
  const metadata = transformSheetMetadataForAxisMove(
    getSheetMetadata(sheet),
    command.axis,
    command.index,
    command.count,
    command.toIndex,
  );
  assertFormulaRangesCanMove(sheet, command.axis, command.index, command.count, command.toIndex);
  const previousState = createSheetSparseState(sheet);
  const mapIndex = (value: number) =>
    transformAxisIndexForMove(value, command.index, command.count, command.toIndex);
  const mapAddress = (address: SheetSparseCell["address"]): SheetSparseCell["address"] =>
    command.axis === "row"
      ? { row: mapIndex(address.row), column: address.column }
      : { row: address.row, column: mapIndex(address.column) };
  const state: SheetSparseState = {
    cells: previousState.cells.map((cell) => {
      const content = cell.content;
      return {
        ...cell,
        address: mapAddress(cell.address),
        ...(content?.kind === "formula"
          ? {
              content: {
                kind: "formula" as const,
                formula: {
                  source: transformFormulaForAxisMove(content.formula.source, {
                    axis: command.axis,
                    index: command.index,
                    count: command.count,
                    toIndex: command.toIndex,
                  }),
                },
              },
            }
          : {}),
      };
    }),
    rowHeights: previousState.rowHeights.map((dimension) => ({
      ...dimension,
      ...(command.axis === "row" ? { index: mapIndex(dimension.index) } : {}),
    })),
    columnWidths: previousState.columnWidths.map((dimension) => ({
      ...dimension,
      ...(command.axis === "column" ? { index: mapIndex(dimension.index) } : {}),
    })),
    hiddenRows: previousState.hiddenRows?.map((index) =>
      command.axis === "row" ? mapIndex(index) : index,
    ),
    hiddenColumns: previousState.hiddenColumns?.map((index) =>
      command.axis === "column" ? mapIndex(index) : index,
    ),
    defaultColumnWidth: previousState.defaultColumnWidth,
    freezePanes: metadata.freezePanes,
    filter: metadata.filter,
    mergedCells: metadata.mergedCells,
    floatingImages: previousState.floatingImages.map((image) => ({
      ...image,
      anchor:
        command.axis === "row"
          ? { row: mapIndex(image.anchor.row), column: image.anchor.column }
          : { row: image.anchor.row, column: mapIndex(image.anchor.column) },
    })),
  };
  return replaceSheetSparseState(sheet, state)
    ? createRestoreSheetStateCommand(command.sheetId, previousState)
    : null;
}
