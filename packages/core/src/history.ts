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
  replacementToken?: number;
};

export type WorkbookHistory = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  maxEntries: number;
  revision: number;
  nextReplacementToken: number;
  replacementScope: number;
  /** The one replaceable interaction that may still alter the newest entry. */
  activeReplacementToken?: number;
};

let nextReplacementScope = 1;

export type WorkbookSession = {
  workbook: Workbook;
  history: WorkbookHistory;
  idFactory: IdFactory;
};

// WorkbookSession is intentionally mutable so hosts can load another document into
// it. Keep this runtime association out of persisted history, and do not rely on
// object identity in replacement tokens (Vue may proxy the session and its fields).
const historyWorkbooks = new WeakMap<WorkbookHistory, Workbook>();

function syncHistoryWorkbook(session: WorkbookSession): void {
  const tracked = historyWorkbooks.get(session.history);
  if (!tracked) {
    historyWorkbooks.set(session.history, session.workbook);
    return;
  }
  if (tracked === session.workbook) return;
  session.history.undoStack.splice(0);
  session.history.redoStack.splice(0);
  session.history.revision += 1;
  session.history.activeReplacementToken = undefined;
  historyWorkbooks.set(session.history, session.workbook);
}

function trimEntries(entries: HistoryEntry[], maxEntries: number): void {
  const overflow = entries.length - Math.max(0, maxEntries);
  if (overflow > 0) entries.splice(0, overflow);
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
    revision: 0,
    nextReplacementToken: 1,
    replacementScope: nextReplacementScope++,
  };
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
  syncHistoryWorkbook(session);
  const inverse = applyWorkbookCommand(session.workbook, command);
  if (!inverse) return false;
  pushEntry(session.history.undoStack, { command: inverse, operation }, session.history.maxEntries);
  session.history.redoStack.splice(0);
  session.history.revision += 1;
  session.history.activeReplacementToken = undefined;
  return true;
}

export type ReplaceableWorkbookCommandToken = Readonly<{
  scope: number;
  revision: number;
  id: number;
}>;
export type ReplaceableWorkbookCommandResult = Readonly<{
  changed: boolean;
  /** False means the token belongs to an older workbook/history state. */
  accepted: boolean;
  token?: ReplaceableWorkbookCommandToken;
}>;

function createReplacementToken(
  history: WorkbookHistory,
): ReplaceableWorkbookCommandToken | undefined {
  if (history.maxEntries <= 0) return undefined;
  const id = history.nextReplacementToken++;
  history.activeReplacementToken = id;
  return { scope: history.replacementScope, id, revision: history.revision };
}

function currentReplacementToken(
  history: WorkbookHistory,
): ReplaceableWorkbookCommandToken | undefined {
  return history.activeReplacementToken === undefined
    ? undefined
    : {
        scope: history.replacementScope,
        id: history.activeReplacementToken,
        revision: history.revision,
      };
}

function isCurrentReplacementToken(
  history: WorkbookHistory,
  token: ReplaceableWorkbookCommandToken,
): boolean {
  return (
    token.scope === history.replacementScope &&
    token.revision === history.revision &&
    token.id === history.activeReplacementToken
  );
}

/** Replaces only the newest matching operation, preserving its original undo state. */
export function executeReplaceableWorkbookCommand(
  session: WorkbookSession,
  token: ReplaceableWorkbookCommandToken | undefined,
  command: WorkbookCommand,
  operation: WorkbookOperation = getWorkbookOperation(command),
): ReplaceableWorkbookCommandResult {
  syncHistoryWorkbook(session);
  const history = session.history;
  const newest = history.undoStack.at(-1);
  if (token && !isCurrentReplacementToken(history, token)) {
    return { changed: false, accepted: false };
  }

  if (token && newest?.replacementToken === token.id) {
    // First restore the captured pre-fill state. A failed replacement must put the
    // workbook back exactly where it was, with the original history entry intact.
    const redo = applyWorkbookCommand(session.workbook, newest.command);
    if (!redo) return { changed: false, accepted: false };
    let inverse: WorkbookCommand | null;
    try {
      inverse = applyWorkbookCommand(session.workbook, command);
    } catch (error) {
      applyWorkbookCommand(session.workbook, redo);
      throw error;
    }
    if (!inverse) {
      // The chosen mode is the original state. Remove the entry so one undo still
      // restores the state before the fill, rather than re-applying a no-op.
      history.undoStack.pop();
      history.revision += 1;
      return {
        changed: true,
        accepted: true,
        token: currentReplacementToken(history),
      };
    }
    newest.command = inverse;
    newest.operation = operation;
    history.revision += 1;
    return {
      changed: true,
      accepted: true,
      token: currentReplacementToken(history),
    };
  }

  // A token can be issued for an initially unchanged fill (or after selecting the
  // original mode), so a later mode choice still owns a single undo entry.
  const inverse = applyWorkbookCommand(session.workbook, command);
  if (!inverse) {
    const issued = token ?? createReplacementToken(history);
    return { changed: false, accepted: true, token: issued };
  }
  const issued = token ?? createReplacementToken(history);
  if (!issued) {
    history.redoStack.splice(0);
    history.revision += 1;
    return { changed: true, accepted: true };
  }
  pushEntry(
    history.undoStack,
    { command: inverse, operation, replacementToken: issued.id },
    history.maxEntries,
  );
  history.redoStack.splice(0);
  history.revision += 1;
  return {
    changed: true,
    accepted: true,
    token: currentReplacementToken(history),
  };
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
  syncHistoryWorkbook(session);
  const changed = transferHistoryEntry(
    session,
    session.history.undoStack,
    session.history.redoStack,
  );
  if (changed) session.history.revision += 1;
  if (changed) session.history.activeReplacementToken = undefined;
  return changed;
}

export function redoWorkbookCommand(session: WorkbookSession): boolean {
  syncHistoryWorkbook(session);
  const changed = transferHistoryEntry(
    session,
    session.history.redoStack,
    session.history.undoStack,
  );
  if (changed) session.history.revision += 1;
  if (changed) session.history.activeReplacementToken = undefined;
  return changed;
}

export function canUndoWorkbookCommand(session: WorkbookSession): boolean {
  syncHistoryWorkbook(session);
  return session.history.undoStack.length > 0;
}

export function canRedoWorkbookCommand(session: WorkbookSession): boolean {
  syncHistoryWorkbook(session);
  return session.history.redoStack.length > 0;
}
