import { applyWorkbookCommand } from "./commands/apply.js";
import {
  getWorkbookOperation,
  type WorkbookCommand,
  type WorkbookOperation,
} from "./commands/contracts.js";
import type { IdFactory } from "./runtime.js";
import { createWorkbook, type Workbook } from "./workbook.js";

export type HistoryEntry = {
  command: WorkbookCommand;
  operation: WorkbookOperation;
};

export type WorkbookHistory = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  maxEntries: number;
};

export type WorkbookSession = {
  workbook: Workbook;
  history: WorkbookHistory;
  idFactory: IdFactory;
};

function trimEntries(entries: HistoryEntry[], maxEntries: number): void {
  const overflow = entries.length - Math.max(0, maxEntries);
  if (overflow > 0) entries.splice(0, overflow);
}

function pushEntry(entries: HistoryEntry[], entry: HistoryEntry, maxEntries: number): void {
  entries.push(entry);
  trimEntries(entries, maxEntries);
}

export function createWorkbookHistory(maxEntries = 100): WorkbookHistory {
  return { undoStack: [], redoStack: [], maxEntries };
}

export function createWorkbookSession(options: {
  workbook?: Workbook;
  idFactory: IdFactory;
}): WorkbookSession {
  return {
    workbook: options.workbook ?? createWorkbook({ idFactory: options.idFactory }),
    history: createWorkbookHistory(),
    idFactory: options.idFactory,
  };
}

export function executeWorkbookCommand(
  session: WorkbookSession,
  command: WorkbookCommand,
  operation: WorkbookOperation = getWorkbookOperation(command),
): boolean {
  const inverse = applyWorkbookCommand(session.workbook, command);
  if (!inverse) return false;
  pushEntry(session.history.undoStack, { command: inverse, operation }, session.history.maxEntries);
  session.history.redoStack.splice(0);
  return true;
}

function transferHistoryEntry(
  session: WorkbookSession,
  source: HistoryEntry[],
  target: HistoryEntry[],
): boolean {
  const entry = source[source.length - 1];
  if (!entry) return false;
  const inverse = applyWorkbookCommand(session.workbook, entry.command);
  if (!inverse) return false;
  source.pop();
  pushEntry(target, { command: inverse, operation: entry.operation }, session.history.maxEntries);
  return true;
}

export function undoWorkbookCommand(session: WorkbookSession): boolean {
  return transferHistoryEntry(session, session.history.undoStack, session.history.redoStack);
}

export function redoWorkbookCommand(session: WorkbookSession): boolean {
  return transferHistoryEntry(session, session.history.redoStack, session.history.undoStack);
}

export function canUndoWorkbookCommand(session: WorkbookSession): boolean {
  return session.history.undoStack.length > 0;
}

export function canRedoWorkbookCommand(session: WorkbookSession): boolean {
  return session.history.redoStack.length > 0;
}
