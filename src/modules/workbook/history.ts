import { applyWorkbookCommand, type WorkbookCommand } from "./commands";
import { createWorkbook, type Workbook } from "./workbook";

export type HistoryEntry = {
  command: WorkbookCommand;
  description?: string;
};

export type WorkbookHistory = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  maxEntries: number;
};

export type WorkbookSession = {
  workbook: Workbook;
  history: WorkbookHistory;
};

function trimEntries(entries: HistoryEntry[], maxEntries: number): void {
  const overflow = entries.length - Math.max(0, maxEntries);
  if (overflow > 0) {
    entries.splice(0, overflow);
  }
}

function pushEntry(entries: HistoryEntry[], entry: HistoryEntry, maxEntries: number): void {
  entries.push(entry);
  trimEntries(entries, maxEntries);
}

export function createWorkbookHistory(maxEntries = 100): WorkbookHistory {
  return {
    undoStack: [],
    redoStack: [],
    maxEntries,
  };
}

export function createWorkbookSession(workbook = createWorkbook()): WorkbookSession {
  return {
    workbook,
    history: createWorkbookHistory(),
  };
}

export function executeWorkbookCommand(
  session: WorkbookSession,
  command: WorkbookCommand,
  description?: string,
): boolean {
  const reverseCommand = applyWorkbookCommand(session.workbook, command);
  if (!reverseCommand) {
    return false;
  }

  pushEntry(
    session.history.undoStack,
    { command: reverseCommand, description },
    session.history.maxEntries,
  );
  session.history.redoStack.splice(0);
  return true;
}

function transferHistoryEntry(
  session: WorkbookSession,
  source: HistoryEntry[],
  target: HistoryEntry[],
): boolean {
  const entry = source.pop();
  if (!entry) {
    return false;
  }

  const reverseCommand = applyWorkbookCommand(session.workbook, entry.command);
  if (!reverseCommand) {
    return false;
  }

  pushEntry(
    target,
    { command: reverseCommand, description: entry.description },
    session.history.maxEntries,
  );
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
