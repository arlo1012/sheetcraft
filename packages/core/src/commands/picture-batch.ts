import { createCalculatedColumnPlanningWorkbook } from "../table-calculated-columns.js";
import type { Workbook } from "../workbook.js";
import { applyWorkbookCommand } from "./apply.js";
import type {
  InsertPictureBatchCommand,
  RestorePictureBatchCommand,
  WorkbookCommand,
} from "./contracts.js";
import { createSetSheetDimensionSizesCommand } from "./dimensions.js";
import { getSheetOrThrow, invalidCommandPayload } from "./helpers.js";
import { createSetSheetFloatingImagesCommand } from "./images.js";
import { createBatchSetCellContentsCommand } from "./values.js";
import { assertFillDataValidation } from "./fill-validation.js";

export function createInsertPictureBatchCommand(
  sheetId: string,
  payload: Omit<InsertPictureBatchCommand, "type" | "sheetId">,
): InsertPictureBatchCommand {
  if (payload.cells.some((cell) => cell.sheetId !== sheetId))
    throw invalidCommandPayload("cells", payload.cells);
  return {
    type: "insertPictureBatch",
    sheetId,
    cells: createBatchSetCellContentsCommand(payload.cells).changes,
    rowHeights: payload.rowHeights.map((change) => ({ ...change })),
    images: createSetSheetFloatingImagesCommand(sheetId, payload.images).images,
  };
}

function applySteps(
  workbook: Workbook,
  commands: WorkbookCommand[],
  fromHistory: boolean,
  additions?: Pick<InsertPictureBatchCommand, "sheetId" | "images">,
): RestorePictureBatchCommand | null {
  // Admission runs every ordinary command guard before any live mutation.
  const planning = createCalculatedColumnPlanningWorkbook(workbook);
  for (const step of commands) applyWorkbookCommand(planning, step, { fromHistory });
  if (additions?.images.length) {
    const projected = getSheetOrThrow(planning, additions.sheetId);
    const step = createSetSheetFloatingImagesCommand(projected.id, [
      ...projected.floatingImages,
      ...additions.images,
    ]);
    applyWorkbookCommand(planning, step, { fromHistory });
    commands.push(step);
  }
  const inverses: WorkbookCommand[] = [];
  try {
    for (const step of commands) {
      const inverse = applyWorkbookCommand(workbook, step, { fromHistory });
      if (inverse) inverses.push(inverse);
    }
  } catch (error) {
    for (const inverse of inverses.reverse())
      applyWorkbookCommand(workbook, inverse, { fromHistory: true });
    throw error;
  }
  return inverses.length ? { type: "restorePictureBatch", commands: inverses.reverse() } : null;
}

export function applyInsertPictureBatchCommand(
  workbook: Workbook,
  command: InsertPictureBatchCommand,
  fromHistory = false,
): RestorePictureBatchCommand | null {
  const next = createInsertPictureBatchCommand(command.sheetId, command);
  const sheet = getSheetOrThrow(workbook, next.sheetId);
  const steps: WorkbookCommand[] = [];
  if (next.rowHeights.length)
    steps.push(createSetSheetDimensionSizesCommand(sheet.id, "row", next.rowHeights));
  if (next.cells.length) {
    const cells = createBatchSetCellContentsCommand(next.cells);
    if (!fromHistory) assertFillDataValidation(workbook, cells);
    steps.push(cells);
  }
  return applySteps(workbook, steps, fromHistory, next);
}

export function applyRestorePictureBatchCommand(
  workbook: Workbook,
  command: RestorePictureBatchCommand,
  fromHistory = false,
): RestorePictureBatchCommand | null {
  if (!fromHistory) throw invalidCommandPayload("type", command.type, "History-only command.");
  return applySteps(workbook, command.commands, true);
}
