import {
  applyCellStyleIncludes,
  getCellStylePatchIncludes,
  normalizeWorkbookCellStyles,
  type CellStyleDefinition,
} from "../cell-styles.js";
import {
  cloneCellNamedStyleBinding,
  getCellNamedStyle,
  getCellStyle,
  setCellNamedStyle,
  type Workbook,
} from "../workbook.js";
import { cloneCellStyle, mergeCellStyle, type CellStylePatch } from "../style.js";
import type { SetWorkbookCellStylesCommand } from "./contracts.js";
import { validateCommandPayload } from "./helpers.js";

export function createSetWorkbookCellStylesCommand(
  styles: readonly CellStyleDefinition[],
): SetWorkbookCellStylesCommand {
  return {
    type: "setWorkbookCellStyles",
    styles: validateCommandPayload("styles", styles, () => normalizeWorkbookCellStyles(styles)),
  };
}

export function applySetWorkbookCellStylesCommand(
  workbook: Workbook,
  command: SetWorkbookCellStylesCommand,
): SetWorkbookCellStylesCommand | null {
  const styles = createSetWorkbookCellStylesCommand(command.styles).styles;
  if (JSON.stringify(workbook.cellStyles ?? []) === JSON.stringify(styles)) return null;
  const bindingStates = [...workbook.sheets.values()].flatMap((sheet) =>
    [...sheet.cells].flatMap(([key]) => {
      const address = parseCellKey(key);
      const binding = getCellNamedStyle(sheet, address);
      return binding
        ? [
            {
              sheetId: sheet.id,
              address,
              style: cloneCellStyle(getCellStyle(sheet, address)) ?? null,
              namedStyle: cloneCellNamedStyleBinding(binding) ?? null,
            },
          ]
        : [];
    }),
  );
  const inverse = {
    ...createSetWorkbookCellStylesCommand(workbook.cellStyles ?? []),
    ...(bindingStates.length ? { namedStyleCells: bindingStates } : {}),
  };
  workbook.cellStyles = styles;
  if (command.namedStyleCells) {
    for (const state of command.namedStyleCells) {
      const sheet = workbook.sheets.get(state.sheetId);
      if (sheet) setCellNamedStyle(sheet, state.address, state.style, state.namedStyle);
    }
    return inverse;
  }
  const byId = new Map(styles.map((style) => [style.id, style]));
  for (const sheet of workbook.sheets.values()) {
    for (const [key] of sheet.cells) {
      const binding = getCellNamedStyle(sheet, parseCellKey(key));
      if (!binding) continue;
      const definition = byId.get(binding.styleId);
      if (!definition) {
        // Deleting a style leaves its current visible formatting intact, but severs the reference.
        setCellNamedStyle(sheet, parseCellKey(key), getCellStyle(sheet, parseCellKey(key)), null);
        continue;
      }
      const source: CellStylePatch = { ...definition.style };
      const includes =
        definition.includes === undefined
          ? getCellStylePatchIncludes(definition.style)
          : definition.includes;
      setCellNamedStyle(
        sheet,
        parseCellKey(key),
        mergeCellStyle(
          undefined,
          applyCellStyleIncludes(
            getCellStyle(sheet, parseCellKey(key)),
            source,
            includes,
            binding.overrides,
          ),
        ),
        {
          styleId: binding.styleId,
          includes: [...includes],
          ...(binding.overrides?.length ? { overrides: [...binding.overrides] } : {}),
        },
      );
    }
  }
  return inverse;
}

function parseCellKey(key: string): { row: number; column: number } {
  const separator = key.indexOf(":");
  return { row: Number(key.slice(0, separator)), column: Number(key.slice(separator + 1)) };
}
