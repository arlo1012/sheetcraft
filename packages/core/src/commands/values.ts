import { getCellMatrixSize } from "../clipboard.js";
import {
  cloneConditionalFormatRule,
  normalizeConditionalFormatRules,
} from "../conditional-formatting.js";
import {
  assertConditionalFormatCrossSheetMoveSupported,
  createConditionalFormatMoveReferenceTransform,
  moveConditionalFormatRules,
} from "../conditional-formatting-move.js";
import {
  getConditionalFormatFormulaSources,
  rewriteConditionalFormatQualifiedReferencesForSheet,
} from "../formula/workbook-references.js";
import {
  cloneCellStyle,
  mergeCellStyle,
  normalizeCellStyle,
  type CellStyle,
  type CellStylePatch,
} from "../style.js";
import {
  getCellStyle,
  getCellHyperlink,
  getCellNote,
  getCellNamedStyle,
  cloneCellHyperlink,
  cloneCellNote,
  cloneCellNamedStyleBinding,
  setCellHyperlink,
  setCellNote,
  setCellNamedStyle,
  getCellContent,
  setCellStyle,
  setCellContent,
  createSheetSparseState,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetTable,
  type Workbook,
} from "../workbook.js";
import { cloneCellContent } from "../workbook.js";
import type { CellContent } from "../formula/types.js";
import { transformFormulaForMove } from "../formula/references.js";
import { renameTableColumnReferences } from "../formula/references.js";
import {
  doMergedCellRangesIntersect,
  expandSelectionToMergedCellRanges,
  MergedCellRangeResolver,
} from "../merged-cells.js";
import {
  getExactCellBorderPatch,
  getCellBorderTargetKey,
  reconcileCellBorderTargets,
  type CellBorderPatch,
} from "./borders.js";
import type {
  CellContentChange,
  ClearCellRangeCommand,
  MoveCellRangeCommand,
  RestoreFullSheetStateCommand,
  SetCellContentsCommand,
  WorkbookCommand,
} from "./contracts.js";
import {
  assertCellAddress,
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
  parseCellKey,
  validateCommandPayload,
} from "./helpers.js";

function normalizeCommandCellContent(value: unknown, field: string): CellContent | null {
  if (value === null) return null;
  try {
    // Validates and deep-clones through the sheet model's public contract.
    const temporary = {
      id: "validation",
      name: "Validation",
      properties: { pinned: false, hidden: false, protected: false },
      cells: new Map(),
      rowHeights: new Map(),
      columnWidths: new Map(),
      freezePanes: { rows: 0, columns: 0 },
      filter: null,
      mergedCells: [],
      floatingImages: [],
    };
    setCellContent(temporary, { row: 0, column: 0 }, value as CellContent);
    return getCellContent(temporary, { row: 0, column: 0 });
  } catch {
    throw invalidCommandPayload(field, value);
  }
}

export function createSetCellContentCommand(
  sheetId: string,
  address: CellAddress,
  content: CellContent | null,
): SetCellContentsCommand {
  return {
    type: "setCellContents",
    changes: [
      {
        sheetId,
        address: { ...address },
        content: normalizeCommandCellContent(content, "content"),
      },
    ],
  };
}

export function createBatchSetCellContentsCommand(
  changes: readonly CellContentChange[],
  options?: { reconcileBorders?: boolean },
): SetCellContentsCommand {
  return {
    type: "setCellContents",
    changes: changes.map((change, index) => ({
      sheetId: change.sheetId,
      address: { ...change.address },
      content: normalizeCommandCellContent(change.content, `changes.${index}.content`),
      ...("style" in change
        ? {
            style:
              validateCommandPayload(`changes.${index}.style`, change.style, () =>
                cloneCellStyle(change.style ?? undefined),
              ) ?? null,
          }
        : {}),
      ...("namedStyle" in change
        ? { namedStyle: cloneCellNamedStyleBinding(change.namedStyle ?? undefined) ?? null }
        : {}),
      ...("hyperlink" in change
        ? { hyperlink: cloneCellHyperlink(change.hyperlink ?? undefined) ?? null }
        : {}),
      ...("note" in change ? { note: cloneCellNote(change.note ?? undefined) ?? null } : {}),
    })),
    ...(options?.reconcileBorders ? { reconcileBorders: true } : {}),
  };
}

export function createClearCellRangeCommand(
  sheetId: string,
  range: CellRange,
): ClearCellRangeCommand {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);
  return { type: "clearCellRange", sheetId, range: normalizedRange };
}

export function createMoveCellRangeCommand(
  sheetId: string,
  source: CellRange,
  destination: CellAddress,
): MoveCellRangeCommand {
  const range = normalizeRange(source);
  assertCellRange(range);
  const end = {
    row: destination.row + range.end.row - range.start.row,
    column: destination.column + range.end.column - range.start.column,
  };
  assertCellAddress(destination);
  assertCellAddress(end);
  return {
    type: "moveCellRange",
    sheetId,
    source: range,
    destination: { ...destination },
  };
}

export function createPasteCellContentsCommand(
  sheetId: string,
  anchor: CellAddress,
  contents: readonly (readonly (CellContent | null)[])[],
  options?: {
    clearRange?: CellRange;
    styles?: readonly (readonly (CellStyle | null)[])[];
    namedStyles?: readonly (readonly (import("../workbook.js").CellNamedStyleBinding | null)[])[];
    hyperlinks?: readonly (readonly (import("../workbook.js").CellHyperlink | null)[])[];
    notes?: readonly (readonly (import("../workbook.js").CellNote | null)[])[];
  },
): SetCellContentsCommand {
  const size = validateCommandPayload("contents", contents, () => getCellMatrixSize(contents));
  const end = {
    row: anchor.row + size.rowCount - 1,
    column: anchor.column + size.columnCount - 1,
  };
  assertCellAddress(anchor);
  assertCellAddress(end);
  if (
    options?.styles &&
    (options.styles.length !== size.rowCount ||
      options.styles.some((row) => row.length !== size.columnCount))
  ) {
    throw invalidCommandPayload(
      "styles",
      options.styles,
      "Pasted cell styles must match the pasted value matrix.",
    );
  }
  for (const [label, matrix] of [
    ["namedStyles", options?.namedStyles],
    ["hyperlinks", options?.hyperlinks],
    ["notes", options?.notes],
  ] as const) {
    if (
      matrix &&
      (matrix.length !== size.rowCount || matrix.some((row) => row.length !== size.columnCount))
    ) {
      throw invalidCommandPayload(
        label,
        matrix,
        `Pasted ${label} must match the pasted value matrix.`,
      );
    }
  }

  const changes = new Map<string, CellContentChange>();
  const setChange = (
    address: CellAddress,
    content: CellContent | null,
    style?: CellStyle | null,
    namedStyle?: import("../workbook.js").CellNamedStyleBinding | null,
    hyperlink?: import("../workbook.js").CellHyperlink | null,
    note?: import("../workbook.js").CellNote | null,
  ) => {
    changes.set(`${address.row}:${address.column}`, {
      sheetId,
      address: { ...address },
      content,
      ...(style === undefined ? {} : { style: style ? cloneCellStyle(style) : null }),
      ...(namedStyle === undefined
        ? {}
        : { namedStyle: cloneCellNamedStyleBinding(namedStyle) ?? null }),
      ...(hyperlink === undefined ? {} : { hyperlink: cloneCellHyperlink(hyperlink) ?? null }),
      ...(note === undefined ? {} : { note: cloneCellNote(note) ?? null }),
    });
  };

  if (options?.clearRange) {
    const clearRange = normalizeRange(options.clearRange);
    assertCellRange(clearRange);
    for (let row = clearRange.start.row; row <= clearRange.end.row; row += 1) {
      for (let column = clearRange.start.column; column <= clearRange.end.column; column += 1) {
        setChange({ row, column }, null, null);
      }
    }
  }
  for (let row = 0; row < size.rowCount; row += 1) {
    for (let column = 0; column < size.columnCount; column += 1) {
      const address = { row: anchor.row + row, column: anchor.column + column };
      const content = contents[row]?.[column] ?? null;
      setChange(
        address,
        content,
        options?.styles ? (options.styles[row]?.[column] ?? null) : undefined,
        options?.namedStyles ? (options.namedStyles[row]?.[column] ?? null) : undefined,
        options?.hyperlinks ? (options.hyperlinks[row]?.[column] ?? null) : undefined,
        options?.notes ? (options.notes[row]?.[column] ?? null) : undefined,
      );
    }
  }
  return createBatchSetCellContentsCommand([...changes.values()], {
    reconcileBorders: Boolean(options?.styles),
  });
}

type TableMetadataEdit =
  | { kind: "rename"; tableId: string; columnIndex: number; caption: string }
  | { kind: "appendRow"; tableId: string }
  | { kind: "appendColumn"; tableId: string; caption: string };

function rangesIntersect(left: CellRange, right: CellRange): boolean {
  return (
    left.start.row <= right.end.row &&
    left.end.row >= right.start.row &&
    left.start.column <= right.end.column &&
    left.end.column >= right.start.column
  );
}

function canExpandTable(sheet: Sheet, table: SheetTable, range: CellRange): boolean {
  return (
    !(sheet.tables ?? []).some(
      (entry) => entry.id !== table.id && rangesIntersect(entry.range, range),
    ) && !sheet.mergedCells.some((merged) => doMergedCellRangesIntersect(merged, range))
  );
}

function getUniqueTableCaption(table: SheetTable, columnIndex: number, source: string): string {
  const base = source || `Column${columnIndex + 1}`;
  const used = new Set(
    table.columns
      .filter((_, index) => index !== columnIndex)
      .map((entry) => entry.name.trim().toLowerCase()),
  );
  let caption = base;
  let suffix = 2;
  while (used.has(caption.toLowerCase())) caption = `${base}${suffix++}`;
  return caption;
}

function getTableMetadataEdit(
  sheet: Sheet,
  change: CellContentChange,
): TableMetadataEdit | undefined {
  const { row, column } = change.address;
  for (const table of sheet.tables ?? []) {
    if (
      table.headerRow &&
      row === table.range.start.row &&
      column >= table.range.start.column &&
      column <= table.range.end.column
    ) {
      // Formula headers keep their formula. Literal headers are always normalized
      // into a usable, unique table caption and displayed with that same text.
      if (change.content?.kind !== "literal" && change.content !== null) return undefined;
      const columnIndex = column - table.range.start.column;
      const source =
        change.content?.kind === "literal" ? String(change.content.value ?? "").trim() : "";
      return {
        kind: "rename",
        tableId: table.id,
        columnIndex,
        caption: getUniqueTableCaption(table, columnIndex, source),
      };
    }
    if (change.content === null) continue;
    if (
      !table.totalRow &&
      column >= table.range.start.column &&
      column <= table.range.end.column &&
      row === table.range.end.row + 1
    ) {
      const range = { start: { ...table.range.start }, end: { ...table.range.end, row } };
      if (canExpandTable(sheet, table, range)) return { kind: "appendRow", tableId: table.id };
      continue;
    }
    if (
      !table.totalRow &&
      row >= table.range.start.row &&
      row <= table.range.end.row &&
      column === table.range.end.column + 1
    ) {
      const range = { start: { ...table.range.start }, end: { ...table.range.end, column } };
      if (canExpandTable(sheet, table, range)) {
        const source =
          table.headerRow && row === table.range.start.row && change.content?.kind === "literal"
            ? String(change.content.value ?? "").trim()
            : "";
        return {
          kind: "appendColumn",
          tableId: table.id,
          caption: getUniqueTableCaption(table, table.columns.length, source),
        };
      }
    }
  }
  return undefined;
}

function createTableTransactionState(workbook: Workbook) {
  return {
    states: [...workbook.sheets.values()].map((sheet) => ({
      sheetId: sheet.id,
      state: createSheetSparseState(sheet),
    })),
    tableStyles: JSON.parse(
      JSON.stringify(workbook.tableStyles ?? []),
    ) as import("../table-styles.js").TableStyleDefinition[],
    ...(workbook.defaultTableStyleId ? { defaultTableStyleId: workbook.defaultTableStyleId } : {}),
  };
}

export function applySetCellContentsCommand(
  workbook: Workbook,
  command: SetCellContentsCommand,
): WorkbookCommand | null {
  if (!Array.isArray(command.changes)) {
    throw invalidCommandPayload("changes", command.changes);
  }
  if (command.conditionalFormats !== undefined && !Array.isArray(command.conditionalFormats))
    throw invalidCommandPayload("conditionalFormats", command.conditionalFormats);
  const ruleSheetIds = new Set<string>();
  const conditionalFormats = (command.conditionalFormats ?? []).map((entry) => {
    if (!entry || ruleSheetIds.has(entry.sheetId))
      throw invalidCommandPayload("conditionalFormats", entry);
    const sheet = getSheetOrThrow(workbook, entry.sheetId);
    ruleSheetIds.add(entry.sheetId);
    return { sheet, rules: normalizeConditionalFormatRules(entry.rules) };
  });
  const resolvers = new Map<string, MergedCellRangeResolver>();
  const getResolver = (sheetId: string) => {
    const cached = resolvers.get(sheetId);
    if (cached) return cached;
    const resolver = new MergedCellRangeResolver(getSheetOrThrow(workbook, sheetId).mergedCells);
    resolvers.set(sheetId, resolver);
    return resolver;
  };
  const addresses = new Set<string>();
  const normalizedChanges = command.changes.map((change, index) => {
    if (!change || typeof change !== "object") {
      throw invalidCommandPayload(`changes.${index}`, change);
    }
    if (!change.address || typeof change.address !== "object") {
      throw invalidCommandPayload(`changes.${index}.address`, change.address);
    }
    assertCellAddress(change.address);
    getSheetOrThrow(workbook, change.sheetId);
    const key = `${change.sheetId}:${change.address.row}:${change.address.column}`;
    if (addresses.has(key)) {
      throw invalidCommandPayload(
        `changes.${index}.address`,
        change.address,
        "Duplicate cell change.",
      );
    }
    addresses.add(key);
    const anchor = getResolver(change.sheetId).getAnchor(change.address);
    if (
      command.changes.length > 1 &&
      anchor &&
      (anchor.row !== change.address.row || anchor.column !== change.address.column)
    ) {
      throw invalidCommandPayload(
        `changes.${index}.address`,
        change.address,
        "Batch cell updates cannot target a merged cell tail.",
      );
    }
    return {
      sheetId: change.sheetId,
      // A direct edit of a displayed merge tail belongs to its sole anchor.
      address: anchor ?? { ...change.address },
      content: normalizeCommandCellContent(change.content, `changes.${index}.content`),
      ...(Object.hasOwn(change, "style")
        ? {
            style:
              validateCommandPayload(`changes.${index}.style`, change.style, () =>
                normalizeCellStyle(change.style),
              ) ?? null,
          }
        : {}),
      ...(Object.hasOwn(change, "namedStyle")
        ? {
            namedStyle:
              validateCommandPayload(`changes.${index}.namedStyle`, change.namedStyle, () =>
                cloneCellNamedStyleBinding(change.namedStyle ?? undefined),
              ) ?? null,
          }
        : {}),
      ...(Object.hasOwn(change, "hyperlink")
        ? {
            hyperlink:
              validateCommandPayload(`changes.${index}.hyperlink`, change.hyperlink, () =>
                cloneCellHyperlink(change.hyperlink ?? undefined),
              ) ?? null,
          }
        : {}),
      ...(Object.hasOwn(change, "note")
        ? {
            note:
              validateCommandPayload(`changes.${index}.note`, change.note, () =>
                cloneCellNote(change.note ?? undefined),
              ) ?? null,
          }
        : {}),
    } satisfies CellContentChange;
  });
  const tableMetadataEdit =
    normalizedChanges.length === 1
      ? getTableMetadataEdit(
          getSheetOrThrow(workbook, normalizedChanges[0]!.sheetId),
          normalizedChanges[0]!,
        )
      : undefined;
  if (
    tableMetadataEdit?.kind === "rename" ||
    (tableMetadataEdit?.kind === "appendColumn" &&
      normalizedChanges[0]!.address.row ===
        getSheetOrThrow(workbook, normalizedChanges[0]!.sheetId).tables?.find(
          (table) => table.id === tableMetadataEdit.tableId,
        )?.range.start.row)
  )
    normalizedChanges[0]!.content = { kind: "literal", value: tableMetadataEdit.caption };
  const tableTransactionState = tableMetadataEdit
    ? createTableTransactionState(workbook)
    : undefined;

  const reverseChanges: CellContentChange[] = [];
  const reverseChangesByAddress = new Map<string, CellContentChange>();
  const initialStates = new Map<
    string,
    {
      sheetId: string;
      address: CellAddress;
      content: CellContent | null;
      style: CellStyle | undefined;
      namedStyle: import("../workbook.js").CellNamedStyleBinding | undefined;
      hyperlink: import("../workbook.js").CellHyperlink | undefined;
      note: import("../workbook.js").CellNote | undefined;
    }
  >();
  const getChangeKey = (sheetId: string, address: CellAddress) =>
    `${sheetId}:${address.row}:${address.column}`;
  const normalizedChangesByAddress = new Map(
    normalizedChanges.map((change) => [getChangeKey(change.sheetId, change.address), change]),
  );

  for (const change of normalizedChanges) {
    const sheet = getSheetOrThrow(workbook, change.sheetId);
    const key = getChangeKey(change.sheetId, change.address);
    if (initialStates.has(key)) continue;
    initialStates.set(key, {
      sheetId: change.sheetId,
      address: { ...change.address },
      content: getCellContent(sheet, change.address),
      style: cloneCellStyle(getCellStyle(sheet, change.address) as CellStyle | undefined),
      namedStyle: cloneCellNamedStyleBinding(getCellNamedStyle(sheet, change.address)),
      hyperlink: cloneCellHyperlink(getCellHyperlink(sheet, change.address)),
      note: cloneCellNote(getCellNote(sheet, change.address)),
    });
  }

  const recordReverseChange = (
    sheetId: string,
    address: CellAddress,
    includeStyle: boolean,
    fallback?: {
      content: CellContent | null;
      style: CellStyle | undefined;
      namedStyle: import("../workbook.js").CellNamedStyleBinding | undefined;
      hyperlink: import("../workbook.js").CellHyperlink | undefined;
      note: import("../workbook.js").CellNote | undefined;
    },
  ) => {
    const key = getChangeKey(sheetId, address);
    const previous =
      initialStates.get(key) ??
      (fallback ? { sheetId, address: { ...address }, ...fallback } : undefined);
    if (!previous)
      throw new Error(`Missing previous state for cell ${address.row}:${address.column}.`);
    const originalChange = normalizedChangesByAddress.get(key);
    const existing = reverseChangesByAddress.get(key);
    if (existing) {
      if (includeStyle && !("style" in existing))
        Object.assign(existing, { style: previous.style ?? null });
      return;
    }
    const reverseChange: CellContentChange = {
      sheetId,
      address: { ...address },
      content: previous.content,
      ...(includeStyle ? { style: previous.style ?? null } : {}),
      ...(originalChange && "namedStyle" in originalChange
        ? { namedStyle: previous.namedStyle ?? null }
        : {}),
      ...(originalChange && "hyperlink" in originalChange
        ? { hyperlink: previous.hyperlink ?? null }
        : {}),
      ...(originalChange && "note" in originalChange ? { note: previous.note ?? null } : {}),
    };
    reverseChanges.unshift(reverseChange);
    reverseChangesByAddress.set(key, reverseChange);
  };

  for (const change of normalizedChanges) {
    const sheet = getSheetOrThrow(workbook, change.sheetId);
    const valueChanged = setCellContent(sheet, change.address, change.content);
    const styleChanged =
      "style" in change ? setCellStyle(sheet, change.address, change.style) : false;
    const namedStyleChanged =
      "namedStyle" in change
        ? setCellNamedStyle(
            sheet,
            change.address,
            getCellStyle(sheet, change.address),
            (change as CellContentChange).namedStyle,
          )
        : false;
    const hyperlinkChanged =
      "hyperlink" in change
        ? setCellHyperlink(sheet, change.address, (change as CellContentChange).hyperlink)
        : false;
    const noteChanged =
      "note" in change
        ? setCellNote(sheet, change.address, (change as CellContentChange).note)
        : false;
    if (valueChanged || styleChanged || namedStyleChanged || hyperlinkChanged || noteChanged) {
      recordReverseChange(change.sheetId, change.address, "style" in change);
    }
  }

  if (command.reconcileBorders) {
    const targetsBySheet = new Map<
      string,
      Map<string, { address: CellAddress; patch: CellBorderPatch }>
    >();
    for (const change of normalizedChanges) {
      if (!("style" in change)) continue;
      const targets = targetsBySheet.get(change.sheetId) ?? new Map();
      targets.set(getCellBorderTargetKey(change.address), {
        address: { ...change.address },
        patch: getExactCellBorderPatch(normalizeCellStyle(change.style)),
      });
      targetsBySheet.set(change.sheetId, targets);
    }
    for (const [sheetId, targets] of targetsBySheet) {
      const cleanupPatches = new Map<string, { address: CellAddress; patch: CellStylePatch }>();
      reconcileCellBorderTargets(targets, (address, patch) => {
        const mergeAwareAddress = getResolver(sheetId).getAnchor(address) ?? address;
        const key = getCellBorderTargetKey(mergeAwareAddress);
        const existing = cleanupPatches.get(key);
        if (existing) Object.assign(existing.patch, patch);
        else
          cleanupPatches.set(key, {
            address: { ...mergeAwareAddress },
            patch: { ...patch },
          });
      });
      const sheet = getSheetOrThrow(workbook, sheetId);
      for (const { address, patch } of cleanupPatches.values()) {
        const previousContent = getCellContent(sheet, address);
        const previousStyle = cloneCellStyle(getCellStyle(sheet, address) as CellStyle | undefined);
        if (setCellStyle(sheet, address, mergeCellStyle(previousStyle, patch))) {
          recordReverseChange(sheetId, address, true, {
            content: previousContent,
            style: previousStyle,
            namedStyle: cloneCellNamedStyleBinding(getCellNamedStyle(sheet, address)),
            hyperlink: cloneCellHyperlink(getCellHyperlink(sheet, address)),
            note: cloneCellNote(getCellNote(sheet, address)),
          });
        }
      }
    }
  }
  const previousRules: NonNullable<SetCellContentsCommand["conditionalFormats"]> = [];
  for (const { sheet, rules } of conditionalFormats) {
    if (JSON.stringify(sheet.conditionalFormats ?? []) === JSON.stringify(rules)) continue;
    previousRules.push({
      sheetId: sheet.id,
      rules: (sheet.conditionalFormats ?? []).map(cloneConditionalFormatRule),
    });
    sheet.conditionalFormats = rules;
  }
  // A single interactive edit owns one history entry. Keep table membership and
  // column captions in the document rather than asking the UI to infer them.
  if (tableMetadataEdit) {
    const change = normalizedChanges[0]!;
    const sheet = getSheetOrThrow(workbook, change.sheetId);
    const table = (sheet.tables ?? []).find((entry) => entry.id === tableMetadataEdit.tableId)!;
    const columnRenames: Array<{ tableName: string; previousName: string; nextName: string }> = [];
    let next = table;
    if (tableMetadataEdit.kind === "rename") {
      const previousName = table.columns[tableMetadataEdit.columnIndex]!.name;
      const columns = table.columns.map((entry, index) =>
        index === tableMetadataEdit.columnIndex
          ? { ...entry, name: tableMetadataEdit.caption }
          : entry,
      );
      next = { ...table, columns };
      if (previousName !== tableMetadataEdit.caption)
        columnRenames.push({
          tableName: table.name,
          previousName,
          nextName: tableMetadataEdit.caption,
        });
    } else if (tableMetadataEdit.kind === "appendRow") {
      const row = change.address.row;
      next = {
        ...table,
        range: { start: { ...table.range.start }, end: { ...table.range.end, row } },
        filter: table.filter
          ? {
              ...table.filter,
              range: {
                start: { ...table.filter.range.start },
                end: { ...table.filter.range.end, row },
              },
            }
          : null,
      };
    } else {
      const column = change.address.column;
      const name = tableMetadataEdit.caption;
      next = {
        ...table,
        columns: [...table.columns, { id: `column-${table.columns.length + 1}`, name }],
        range: { start: { ...table.range.start }, end: { ...table.range.end, column } },
        filter: table.filter
          ? {
              ...table.filter,
              range: {
                start: { ...table.filter.range.start },
                end: { ...table.filter.range.end, column },
              },
            }
          : null,
      };
    }
    sheet.tables = (sheet.tables ?? []).map((entry) => (entry.id === next.id ? next : entry));
    if (
      tableMetadataEdit.kind === "appendColumn" &&
      table.headerRow &&
      change.address.row !== table.range.start.row
    )
      setCellContent(
        sheet,
        { row: table.range.start.row, column: change.address.column },
        { kind: "literal", value: tableMetadataEdit.caption },
      );
    for (const rename of columnRenames)
      for (const formulaSheet of workbook.sheets.values())
        for (const [key, cell] of formulaSheet.cells) {
          if (cell.content?.kind !== "formula") continue;
          const source = renameTableColumnReferences(
            cell.content.formula.source,
            rename.tableName,
            rename.previousName,
            rename.nextName,
          );
          if (source === cell.content.formula.source) continue;
          const separator = key.indexOf(":");
          setCellContent(
            formulaSheet,
            { row: Number(key.slice(0, separator)), column: Number(key.slice(separator + 1)) },
            { kind: "formula", formula: { source } },
          );
        }
    return { type: "restoreTableTransaction", ...tableTransactionState! };
  }

  if (!reverseChanges.length && !previousRules.length) return null;
  return {
    ...createBatchSetCellContentsCommand(reverseChanges),
    ...(previousRules.length ? { conditionalFormats: previousRules } : {}),
  };
}

export function applyClearCellRangeCommand(
  workbook: Workbook,
  command: ClearCellRangeCommand,
): SetCellContentsCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const range = expandSelectionToMergedCellRanges(normalizeRange(command.range), sheet.mergedCells);
  assertCellRange(range);
  const reverseChanges: CellContentChange[] = [];
  for (const [key, cell] of sheet.cells) {
    const address = parseCellKey(key);
    if (
      address.row < range.start.row ||
      address.row > range.end.row ||
      address.column < range.start.column ||
      address.column > range.end.column ||
      cell.content === undefined
    ) {
      continue;
    }
    reverseChanges.push({
      sheetId: command.sheetId,
      address,
      content: cloneCellContent(cell.content),
    });
    setCellContent(sheet, address, null);
  }
  return reverseChanges.length > 0 ? createBatchSetCellContentsCommand(reverseChanges) : null;
}

export function applyMoveCellRangeCommand(
  workbook: Workbook,
  command: MoveCellRangeCommand,
): RestoreFullSheetStateCommand | null {
  const source = normalizeRange(command.source);
  assertCellRange(source);
  assertCellAddress(command.destination);
  const end = {
    row: command.destination.row + source.end.row - source.start.row,
    column: command.destination.column + source.end.column - source.start.column,
  };
  assertCellAddress(end);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const destination = { start: { ...command.destination }, end };
  if (
    sheet.mergedCells.some(
      (merged) =>
        doMergedCellRangesIntersect(merged, source) ||
        doMergedCellRangesIntersect(merged, destination),
    )
  ) {
    throw invalidCommandPayload(
      "source",
      command.source,
      "Moving merged cells is not supported until merged move semantics are defined.",
    );
  }
  if (
    source.start.row === command.destination.row &&
    source.start.column === command.destination.column
  )
    return null;
  const previous = createSheetSparseState(sheet);
  assertConditionalFormatCrossSheetMoveSupported(workbook, sheet.id);
  const conditionalFormatFormulaSources = getConditionalFormatFormulaSources(workbook, sheet.id);
  const conditionalFormats = moveConditionalFormatRules(
    sheet.conditionalFormats ?? [],
    source,
    command.destination,
  );
  const captured = [...sheet.cells].flatMap(([key, cell]) => {
    const address = parseCellKey(key);
    return address.row >= source.start.row &&
      address.row <= source.end.row &&
      address.column >= source.start.column &&
      address.column <= source.end.column
      ? [
          {
            address,
            content: cell.content ? cloneCellContent(cell.content) : undefined,
            style: cloneCellStyle(cell.style),
            namedStyle: cloneCellNamedStyleBinding(cell.namedStyle),
            hyperlink: cloneCellHyperlink(cell.hyperlink),
            note: cloneCellNote(cell.note),
          },
        ]
      : [];
  });
  const isIn = (address: CellAddress, range: CellRange) =>
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column;
  const affected = new Map<string, CellAddress>();
  for (const [key] of sheet.cells) {
    const address = parseCellKey(key);
    if (isIn(address, source) || isIn(address, destination)) affected.set(key, address);
  }
  // Sparse clear gives blank source cells overwrite semantics without iterating the rectangle.
  for (const address of affected.values()) {
    setCellContent(sheet, address, null);
    setCellStyle(sheet, address, null);
    setCellNamedStyle(sheet, address, null, null);
    setCellHyperlink(sheet, address, null);
    setCellNote(sheet, address, null);
  }
  for (const cell of captured) {
    const address = {
      row: command.destination.row + cell.address.row - source.start.row,
      column: command.destination.column + cell.address.column - source.start.column,
    };
    setCellContent(sheet, address, cell.content ?? null);
    setCellNamedStyle(sheet, address, cell.style ?? null, cell.namedStyle ?? null);
    setCellHyperlink(sheet, address, cell.hyperlink ?? null);
    setCellNote(sheet, address, cell.note ?? null);
    affected.set(`${address.row}:${address.column}`, address);
  }
  for (const [key, cell] of sheet.cells)
    if (cell.content?.kind === "formula") {
      const next = transformFormulaForMove(
        cell.content.formula.source,
        source,
        command.destination,
      );
      if (next !== cell.content.formula.source)
        sheet.cells.set(key, {
          ...cell,
          content: { kind: "formula", formula: { source: next } },
        });
    }
  const targets = new Map<string, { address: CellAddress; patch: CellBorderPatch }>();
  for (const address of affected.values())
    targets.set(getCellBorderTargetKey(address), {
      address,
      patch: getExactCellBorderPatch(getCellStyle(sheet, address)),
    });
  reconcileCellBorderTargets(targets, (address, patch) =>
    setCellNamedStyle(
      sheet,
      address,
      mergeCellStyle(getCellStyle(sheet, address), patch),
      getCellNamedStyle(sheet, address),
    ),
  );
  sheet.conditionalFormats = conditionalFormats;
  rewriteConditionalFormatQualifiedReferencesForSheet(
    workbook,
    sheet.id,
    createConditionalFormatMoveReferenceTransform(source, command.destination),
  );
  const current = createSheetSparseState(sheet);
  if (
    JSON.stringify(current) === JSON.stringify(previous) &&
    JSON.stringify(getConditionalFormatFormulaSources(workbook, sheet.id)) ===
      JSON.stringify(conditionalFormatFormulaSources)
  )
    return null;
  return {
    type: "restoreSheetState",
    sheetId: command.sheetId,
    state: previous,
    ...(conditionalFormatFormulaSources.length ? { conditionalFormatFormulaSources } : {}),
  };
}
