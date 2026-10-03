import { normalizeWorkbookCellStyles, type CellStyleDefinition } from "../cell-styles.js";
import type { Workbook } from "../workbook.js";
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
  const inverse = createSetWorkbookCellStylesCommand(workbook.cellStyles ?? []);
  workbook.cellStyles = styles;
  return inverse;
}
