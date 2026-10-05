import {
  captureCellFill,
  CellFillError,
  createCellFillCommand,
  type CellFillPlan,
} from "@idea10/core/cell-autofill";
import type { WorkbookCommand } from "@idea10/core/commands";
import { WorkbookDomainError } from "@idea10/core/errors";
import type { ReplaceableWorkbookCommandToken } from "@idea10/core/history";
import type { Workbook } from "@idea10/core/workbook";
import type {
  GridFillFeedback,
  GridFillRequest,
  GridFillResult,
  GridFillSession,
} from "./auto-fill-contracts";

type ActiveFill = {
  workbook: Workbook;
  plan: CellFillPlan;
  token?: ReplaceableWorkbookCommandToken;
  state: GridFillSession;
};

/** Keeps the original fill snapshot only while its post-fill options are usable. */
export function createCellFillActions(options: {
  getWorkbook: () => Workbook;
  getSheetId: () => string;
  getRevision: () => number;
  execute: (
    command: WorkbookCommand,
    token?: ReplaceableWorkbookCommandToken,
  ) => { changed: boolean; accepted: boolean; token?: ReplaceableWorkbookCommandToken };
}) {
  let active: ActiveFill | undefined;
  let nextId = 0;

  function clear(): void {
    active = undefined;
  }

  function apply(request: GridFillRequest): GridFillResult {
    const workbook = options.getWorkbook();
    const sheetId = options.getSheetId();
    const sheet = workbook.sheets.get(sheetId);
    if (!sheet) {
      clear();
      return { ok: false, reason: "readOnly" };
    }
    try {
      if (request.type === "fill") {
        clear();
        if (request.sheetId !== sheetId || request.revision !== options.getRevision())
          return { ok: false, reason: "documentChanged" };
        const plan = captureCellFill(workbook, sheetId, request.source, request.range);
        const mode = request.copy ? "copy" : plan.defaultMode;
        const result = options.execute(createCellFillCommand(workbook, plan, mode));
        if (!result.accepted) return { ok: false, reason: "documentChanged" };
        const state: GridFillSession = {
          id: ++nextId,
          sheetId,
          range: request.range,
          mode,
          availableModes: result.token ? plan.availableModes : [],
          revision: options.getRevision(),
        };
        active = { workbook, plan, token: result.token, state };
        return { ok: true, session: state };
      }
      if (
        !active ||
        active.state.id !== request.sessionId ||
        active.workbook !== workbook ||
        active.state.sheetId !== sheetId ||
        active.state.revision !== options.getRevision()
      ) {
        clear();
        return { ok: false, reason: "documentChanged" };
      }
      if (request.mode === active.state.mode) return { ok: true, session: active.state };
      const result = options.execute(
        createCellFillCommand(workbook, active.plan, request.mode),
        active.token,
      );
      if (!result.accepted) {
        clear();
        return { ok: false, reason: "documentChanged" };
      }
      active.token = result.token;
      active.state = {
        ...active.state,
        mode: request.mode,
        revision: options.getRevision(),
      };
      return { ok: true, session: active.state };
    } catch (error) {
      clear();
      return { ok: false, reason: fillFailure(error) };
    }
  }

  return { apply, clear };
}

function fillFailure(error: unknown): GridFillFeedback {
  if (error instanceof WorkbookDomainError && error.data.details?.field === "duplicate")
    return "duplicate";
  if (error instanceof WorkbookDomainError && error.data.code === "sheet_protected")
    return "readOnly";
  if (error instanceof CellFillError) {
    switch (error.reason) {
      case "targetTooLarge":
        return "rangeTooLarge";
      case "mergedCells":
        return "mergedCells";
      case "hiddenAxis":
      case "filterRange":
        return "hiddenCells";
      case "sheetNotFound":
        return "documentChanged";
      case "invalidRange":
      case "resultDoesNotContainSource":
      case "notOneAxis":
        return "outOfBounds";
    }
  }
  return "failed";
}
