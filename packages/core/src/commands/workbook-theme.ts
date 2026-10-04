import {
  applyCellStyleIncludes,
  createBuiltinCellStyles,
  getCellStyleDefinitionPatch,
} from "../cell-styles.js";
import { createThemedTableStyles, cloneTableStyleDefinition } from "../table-styles.js";
import {
  cloneCellNamedStyleBinding,
  getCellNamedStyle,
  getCellStyle,
  setCellNamedStyle,
  type Workbook,
} from "../workbook.js";
import { cloneCellStyle, mergeCellStyle, type CellStyle } from "../style.js";
import {
  cloneWorkbookTheme,
  normalizeWorkbookTheme,
  resolveThemeColor,
  resolveThemeFontFamily,
  type WorkbookTheme,
} from "../workbook-theme.js";
import type { SetWorkbookThemeCommand } from "./contracts.js";
import { validateCommandPayload } from "./helpers.js";

const THEMED_STYLE_IDS = new Set(
  createBuiltinCellStyles()
    .filter((style) => style.category === "theme" || style.category === "titles")
    .map((style) => style.id),
);

export function createSetWorkbookThemeCommand(theme: WorkbookTheme): SetWorkbookThemeCommand {
  return {
    type: "setWorkbookTheme",
    theme: validateCommandPayload("theme", theme, () => normalizeWorkbookTheme(theme)),
  };
}

function cellStates(workbook: Workbook, command: SetWorkbookThemeCommand) {
  if (command.cellStates) {
    return command.cellStates.map((state) => {
      const sheet = workbook.sheets.get(state.sheetId);
      return {
        sheetId: state.sheetId,
        address: { ...state.address },
        style: cloneCellStyle(sheet ? getCellStyle(sheet, state.address) : undefined) ?? null,
        namedStyle:
          cloneCellNamedStyleBinding(sheet ? getCellNamedStyle(sheet, state.address) : undefined) ??
          null,
      };
    });
  }
  return [...workbook.sheets.values()].flatMap((sheet) =>
    [...sheet.cells].flatMap(([key]) => {
      const [row, column] = key.split(":").map(Number);
      const address = { row: row!, column: column! };
      const namedStyle = getCellNamedStyle(sheet, address);
      const style = getCellStyle(sheet, address);
      return (namedStyle && THEMED_STYLE_IDS.has(namedStyle.styleId)) ||
        style?.textColorTheme ||
        style?.fillColorTheme ||
        style?.fontTheme
        ? [
            {
              sheetId: sheet.id,
              address,
              style: cloneCellStyle(getCellStyle(sheet, address)) ?? null,
              namedStyle: cloneCellNamedStyleBinding(namedStyle) ?? null,
            },
          ]
        : [];
    }),
  );
}

/**
 * Theme-bound styles carry a resolved RGB/font cache for renderers and XLSX,
 * while retaining their live references for later theme changes. This only
 * touches explicitly bound sparse cells; direct formatting has no reference
 * and is deliberately left intact.
 */
function materializeThemeReferences(
  workbook: Workbook,
  theme: WorkbookTheme,
  states: ReturnType<typeof cellStates>,
): void {
  for (const state of states) {
    const sheet = workbook.sheets.get(state.sheetId);
    if (!sheet) continue;
    const style = cloneCellStyle(getCellStyle(sheet, state.address));
    if (!style) continue;
    const next: CellStyle = { ...style };
    if (next.textColorTheme) next.textColor = resolveThemeColor(theme, next.textColorTheme);
    if (next.fillColorTheme) next.fillColor = resolveThemeColor(theme, next.fillColorTheme);
    if (next.fontTheme) next.fontFamily = resolveThemeFontFamily(theme, next.fontTheme);
    const namedStyle = getCellNamedStyle(sheet, state.address);
    setCellNamedStyle(sheet, state.address, next, namedStyle);
  }
}

function tableStates(workbook: Workbook, command: SetWorkbookThemeCommand) {
  if (command.tableStyles)
    return command.tableStyles.map((state) => {
      const table = workbook.sheets
        .get(state.sheetId)
        ?.tables?.find((item) => item.id === state.tableId);
      return {
        sheetId: state.sheetId,
        tableId: state.tableId,
        style: table ? cloneTableStyleDefinition(table.style) : null,
      };
    });
  return [...workbook.sheets.values()].flatMap((sheet) =>
    (sheet.tables ?? []).flatMap((table) =>
      table.style.id.startsWith("table-wps-") &&
      table.style.accentColor === workbook.theme.accentColors[0]
        ? [{ sheetId: sheet.id, tableId: table.id, style: cloneTableStyleDefinition(table.style) }]
        : [],
    ),
  );
}

export function applySetWorkbookThemeCommand(
  workbook: Workbook,
  command: SetWorkbookThemeCommand,
): SetWorkbookThemeCommand | null {
  const theme = createSetWorkbookThemeCommand(command.theme).theme;
  const cells = cellStates(workbook, command);
  const tables = tableStates(workbook, command);
  const changedTheme = JSON.stringify(workbook.theme) !== JSON.stringify(theme);
  if (!changedTheme && !command.cellStates && !command.tableStyles) return null;
  const inverse: SetWorkbookThemeCommand = {
    type: "setWorkbookTheme",
    theme: cloneWorkbookTheme(workbook.theme),
    ...(cells.length ? { cellStates: cells } : {}),
    ...(tables.length ? { tableStyles: tables } : {}),
  };
  workbook.theme = cloneWorkbookTheme(theme);
  if (command.cellStates) {
    for (const state of command.cellStates) {
      const sheet = workbook.sheets.get(state.sheetId);
      if (sheet) setCellNamedStyle(sheet, state.address, state.style, state.namedStyle);
    }
  } else {
    const styles = new Map(createBuiltinCellStyles(theme).map((style) => [style.id, style]));
    for (const state of cells) {
      const sheet = workbook.sheets.get(state.sheetId);
      const binding = sheet && getCellNamedStyle(sheet, state.address);
      const definition = binding && styles.get(binding.styleId);
      if (!sheet || !binding || !definition) continue;
      const style = mergeCellStyle(
        undefined,
        applyCellStyleIncludes(
          getCellStyle(sheet, state.address),
          getCellStyleDefinitionPatch(definition),
          binding.includes,
          binding.overrides,
        ),
      );
      setCellNamedStyle(sheet, state.address, style, binding);
    }
    materializeThemeReferences(workbook, theme, cells);
  }
  if (command.tableStyles) {
    for (const state of command.tableStyles) {
      const table = workbook.sheets
        .get(state.sheetId)
        ?.tables?.find((item) => item.id === state.tableId);
      if (table && state.style) table.style = cloneTableStyleDefinition(state.style);
    }
  } else {
    const styles = new Map(
      createThemedTableStyles(theme.accentColors[0]).map((style) => [style.id, style]),
    );
    for (const state of tables) {
      const table = workbook.sheets
        .get(state.sheetId)
        ?.tables?.find((item) => item.id === state.tableId);
      const style = styles.get(state.style?.id ?? "");
      if (table && style) table.style = cloneTableStyleDefinition(style);
    }
  }
  return inverse;
}
