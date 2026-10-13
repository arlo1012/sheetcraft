import { hasWorkbookTextReferencesToSheet } from "./text-references.js";
import { createCalculatedColumnPlanningWorkbook } from "../table-calculated-columns.js";
import { applyWorkbookCommand } from "./apply.js";
import type {
  BatchDeleteSheetAxesCommand,
  DeleteSheetAxisCommand,
  RestoreSheetAxisSliceCommand,
  WorkbookCommand,
} from "./contracts.js";
import { invalidCommandPayload } from "./helpers.js";
import type { Workbook } from "../workbook.js";

export function createBatchDeleteSheetAxesCommand(
  commands: readonly DeleteSheetAxisCommand[],
): BatchDeleteSheetAxesCommand {
  if (!commands.length)
    throw invalidCommandPayload("commands", commands, "A batch must not be empty.");
  const sheetId = commands[0]!.sheetId;
  if (
    commands.some((command) => command.type !== "deleteSheetAxis" || command.sheetId !== sheetId)
  ) {
    throw invalidCommandPayload(
      "commands",
      commands,
      "All batch deletions must target the same sheet.",
    );
  }
  return { type: "batchDeleteSheetAxes", sheetId, commands: [...commands] };
}

function isBatchMember(
  command: WorkbookCommand,
): command is DeleteSheetAxisCommand | RestoreSheetAxisSliceCommand {
  return (
    command.type === "deleteSheetAxis" ||
    (command.type === "restoreSheetState" && "axis" in command && command.operation === "delete")
  );
}

/** Applies disjoint axis deletes atomically and records one history entry. */
export function applyBatchDeleteSheetAxesCommand(
  workbook: Workbook,
  command: BatchDeleteSheetAxesCommand,
): BatchDeleteSheetAxesCommand | null {
  if (!command.commands.length) {
    throw invalidCommandPayload("commands", command.commands, "A batch must not be empty.");
  }
  if (
    command.commands.some((nested) => nested.sheetId !== command.sheetId || !isBatchMember(nested))
  ) {
    throw invalidCommandPayload(
      "commands",
      command.commands,
      "Only deletes and their structural inverses are supported in this batch.",
    );
  }

  if (hasWorkbookTextReferencesToSheet(workbook, command.sheetId)) {
    // The strict planning clone deeply detaches sheet state and names. Axis commands
    // never write shared workbook theme/style catalogs. Admit the entire referenced
    // batch before the first live cell, dimension, metadata or owner assignment.
    const planning = createCalculatedColumnPlanningWorkbook(workbook);
    for (const nested of command.commands) applyWorkbookCommand(planning, nested);
  }

  const inverses: Array<DeleteSheetAxisCommand | RestoreSheetAxisSliceCommand> = [];
  try {
    for (const nested of command.commands) {
      const inverse = applyWorkbookCommand(workbook, nested);
      if (inverse) {
        if (!isBatchMember(inverse)) throw new Error("Unexpected axis delete inverse.");
        inverses.push(inverse);
      }
    }
  } catch (error) {
    for (const inverse of inverses.reverse()) applyWorkbookCommand(workbook, inverse);
    throw error;
  }
  return inverses.length
    ? {
        type: "batchDeleteSheetAxes",
        sheetId: command.sheetId,
        commands: inverses.reverse(),
      }
    : null;
}
