import {
  applyWorkbookCommand,
  createApplyCellFormatCommand,
  type CellFormatChange,
} from "@idea10/core/commands";
import {
  CELL_STYLE_KEYS,
  cloneCellStyle,
  type CellBorderAction,
  type CellStyle,
} from "@idea10/core/style";
import {
  getSelectionBorderState,
  getSelectionCellStyleState,
  type SelectionBorderState,
  type SelectionCellStyleState,
} from "@idea10/core/style-state";
import { createWorkbook, getActiveSheet, getCellStyle, setCellStyle } from "@idea10/core/workbook";
import type { SheetSearchFormat } from "@idea10/core/search";
import type { WorkbookFindFormatMode } from "./workbook-find-types";

export type FindFormatDraft = {
  state: SelectionCellStyleState;
  borderState: SelectionBorderState;
};

const FILL_KEYS = ["fillColor", "fillPattern", "fillPatternColor", "fillGradient"] as const;
const FONT_KEYS = ["textColor"] as const;
const COLOR_KEYS = [...FILL_KEYS, "textColor"] as const;
const BORDER_KEYS = [
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "borderDiagonalUp",
  "borderDiagonalDown",
] as const;

function modeKeys(mode: WorkbookFindFormatMode): readonly (keyof CellStyle)[] {
  switch (mode) {
    case "fill":
      return FILL_KEYS;
    case "font":
      return FONT_KEYS;
    case "colors":
      return COLOR_KEYS;
    case "all":
      return CELL_STYLE_KEYS;
  }
}

function cloneSearchStyle(
  style: CellStyle | undefined,
  keys: readonly (keyof CellStyle)[],
): CellStyle {
  const source = cloneCellStyle(style) ?? {};
  const selected: CellStyle = {};
  for (const key of keys) {
    // Search distinguishes an omitted style key only through `keys`; retaining
    // an explicit undefined here makes cleared criteria round-trip predictably.
    Object.assign(selected, { [key]: source[key] });
  }
  return selected;
}

function createShadowWorkbook(style: CellStyle | undefined) {
  const workbook = createWorkbook({
    id: "find-format-shadow",
    sheetId: "find-format-shadow-sheet",
  });
  const sheet = getActiveSheet(workbook);
  setCellStyle(sheet, { row: 0, column: 0 }, cloneCellStyle(style));
  return { workbook, sheet };
}

function addBorderActionKeys(keys: Set<keyof CellStyle>, action: CellBorderAction): void {
  switch (action.preset) {
    case "none":
      BORDER_KEYS.forEach((key) => keys.add(key));
      return;
    case "all":
    case "outer":
      keys.add("borderTop");
      keys.add("borderRight");
      keys.add("borderBottom");
      keys.add("borderLeft");
      return;
    // Internal borders have no single-cell representation. The shadow command
    // correctly leaves them unchanged, so they must not create a false
    // "border is absent" criterion.
    case "inner":
    case "innerHorizontal":
    case "innerVertical":
      return;
    case "top":
      keys.add("borderTop");
      return;
    case "right":
      keys.add("borderRight");
      return;
    case "bottom":
      keys.add("borderBottom");
      return;
    case "left":
      keys.add("borderLeft");
      return;
    case "diagonalUp":
      keys.add("borderDiagonalUp");
      return;
    case "diagonalDown":
      keys.add("borderDiagonalDown");
  }
}

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  return (
    leftKeys.length === Object.keys(rightRecord).length &&
    leftKeys.every(
      (key) => Object.hasOwn(rightRecord, key) && areValuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

/** Builds a format-only search criterion from one cell, including clear values. */
export function buildFindFormatFromCell(
  style: CellStyle | undefined,
  mode: WorkbookFindFormatMode,
): SheetSearchFormat {
  const keys = modeKeys(mode);
  return { style: cloneSearchStyle(style, keys), keys: [...keys] };
}

/** Adapts a format criterion to the existing cell-format dialog's selection props. */
export function createFindFormatDraft(format?: SheetSearchFormat): FindFormatDraft {
  const { sheet } = createShadowWorkbook(
    format ? cloneSearchStyle(format.style, format.keys) : undefined,
  );
  const range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
  return {
    state: getSelectionCellStyleState(sheet, range),
    borderState: getSelectionBorderState(sheet, range),
  };
}

/**
 * Applies a dialog change in a throwaway workbook, so the criterion follows
 * Core's normalization and border rules without touching the active workbook.
 */
export function applyFindFormatChange(
  format: SheetSearchFormat | undefined,
  change: CellFormatChange,
): SheetSearchFormat {
  const { workbook, sheet } = createShadowWorkbook(
    format ? cloneSearchStyle(format.style, format.keys) : undefined,
  );
  const before = cloneCellStyle(getCellStyle(sheet, { row: 0, column: 0 }));
  const keys = new Set<keyof CellStyle>(format?.keys ?? []);

  for (const key of CELL_STYLE_KEYS) {
    if (change.style && Object.hasOwn(change.style, key)) keys.add(key);
  }
  for (const action of change.borders ?? []) addBorderActionKeys(keys, action);

  const coreChange: CellFormatChange = {};
  if (change.style && Object.keys(change.style).length > 0) coreChange.style = change.style;
  if (change.borders?.length) coreChange.borders = change.borders;
  if (change.borderFormat) coreChange.borderFormat = change.borderFormat;
  if (Object.keys(coreChange).length > 0) {
    applyWorkbookCommand(
      workbook,
      createApplyCellFormatCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        coreChange,
      ),
    );
  }

  const after = cloneCellStyle(getCellStyle(sheet, { row: 0, column: 0 }));
  for (const key of BORDER_KEYS) {
    if (!areValuesEqual(before?.[key], after?.[key])) keys.add(key);
  }

  const orderedKeys = CELL_STYLE_KEYS.filter((key) => keys.has(key));
  return { style: cloneSearchStyle(after, orderedKeys), keys: orderedKeys };
}
