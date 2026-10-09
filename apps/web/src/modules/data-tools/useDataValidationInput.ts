import { canEditCell } from "@idea10/core";
import { shallowRef, watch } from "vue";
import { createSetCellContentCommand, type WorkbookCommand } from "@idea10/core/commands";
import { isCellInRange } from "@idea10/sheet-engine/selection";
import {
  getCellDataValidation,
  validateCellContentDataValidation,
} from "@idea10/core/data-validation";
import { validateDuplicateEntries } from "@idea10/core/duplicate-values";
import { WorkbookDomainError } from "@idea10/core/errors";
import type { CellContent } from "@idea10/core/formula";
import {
  getCellContent,
  type CellAddress,
  type SheetDataValidation,
  type Workbook,
} from "@idea10/core/workbook";

type Candidate = {
  sheetId: string;
  address: CellAddress;
  content: CellContent | null;
};

type DuplicateConfirmation = {
  workbook: Workbook;
  generation: number;
  candidate: Candidate;
  ruleSignature: string;
};

type PendingRequest = {
  workbook: Workbook;
  generation: number;
  candidate: Candidate;
  ruleSignature: string;
  source: "duplicate" | "validation";
  confirmedDuplicate?: DuplicateConfirmation;
};

export type DataValidationCommitOptions = {
  /** Explicitly confirms the currently displayed duplicate-entry warning. */
  confirmPendingWarning?: boolean;
};

export type DataValidationFeedback = {
  style: NonNullable<SheetDataValidation["errorStyle"]>;
  title?: string;
  message?: string;
} & (
  | { source: "duplicate"; target: { sheetId: string; address: CellAddress } }
  | { source?: "validation" }
);

/** Keeps a rejected edit pending while the editor retains the user's draft. */
export function useDataValidationInput(options: {
  getWorkbook: () => Workbook;
  getGeneration: () => number;
  execute: (command: WorkbookCommand, options?: { allowDuplicateEntry?: boolean }) => boolean;
  getDuplicateRejectionFeedback: () => { title: string; message: string };
}) {
  const feedback = shallowRef<DataValidationFeedback>();
  let pending: PendingRequest | undefined;

  function dismiss(): void {
    pending = undefined;
    feedback.value = undefined;
  }

  function cloneCandidate(candidate: Candidate): Candidate {
    return {
      ...candidate,
      address: { ...candidate.address },
      content: candidate.content ? structuredClone(candidate.content) : null,
    };
  }

  function candidatesMatch(left: Candidate, right: Candidate): boolean {
    return (
      left.sheetId === right.sheetId &&
      left.address.row === right.address.row &&
      left.address.column === right.address.column &&
      JSON.stringify(left.content) === JSON.stringify(right.content)
    );
  }

  function duplicateRuleSignature(workbook: Workbook, candidate: Candidate): string {
    const sheet = workbook.sheets.get(candidate.sheetId);
    return JSON.stringify(
      (sheet?.duplicateRules ?? []).filter(
        (rule) => rule.kind === "reject" && isCellInRange(candidate.address, rule.range),
      ),
    );
  }

  function createDuplicateConfirmation(
    workbook: Workbook,
    candidate: Candidate,
  ): DuplicateConfirmation {
    return {
      workbook,
      generation: options.getGeneration(),
      candidate: cloneCandidate(candidate),
      ruleSignature: duplicateRuleSignature(workbook, candidate),
    };
  }

  function isCurrentDuplicateConfirmation(
    confirmation: DuplicateConfirmation | undefined,
    workbook: Workbook,
    candidate: Candidate,
  ): boolean {
    return Boolean(
      confirmation &&
      confirmation.workbook === workbook &&
      confirmation.generation === options.getGeneration() &&
      candidatesMatch(confirmation.candidate, candidate) &&
      confirmation.ruleSignature === duplicateRuleSignature(workbook, candidate),
    );
  }

  function rejectDuplicate(workbook: Workbook, candidate: Candidate): false {
    pending = {
      ...createDuplicateConfirmation(workbook, candidate),
      source: "duplicate",
    };
    feedback.value = {
      style: "stop",
      source: "duplicate",
      target: { sheetId: candidate.sheetId, address: { ...candidate.address } },
      ...options.getDuplicateRejectionFeedback(),
    };
    return false;
  }

  function isDuplicateRejection(error: unknown): boolean {
    return (
      error instanceof WorkbookDomainError &&
      error.data.code === "invalid_command_payload" &&
      error.data.details?.field === "duplicate"
    );
  }

  function commit(candidate: Candidate, commitOptions: DataValidationCommitOptions = {}): boolean {
    const workbook = options.getWorkbook();
    const sheet = workbook.sheets.get(candidate.sheetId);
    if (!sheet || !canEditCell(sheet, candidate.address)) return false;
    const confirmedDuplicate =
      commitOptions.confirmPendingWarning &&
      pending?.source === "duplicate" &&
      isCurrentDuplicateConfirmation(pending, workbook, candidate)
        ? createDuplicateConfirmation(workbook, candidate)
        : undefined;
    const duplicateBlocked = !validateDuplicateEntries(workbook, [candidate], {
      includeUnchanged: true,
    }).valid;
    if (duplicateBlocked && !confirmedDuplicate) return rejectDuplicate(workbook, candidate);
    const rule = getCellDataValidation(sheet, candidate.address);
    if (
      rule &&
      rule.showError !== false &&
      !validateCellContentDataValidation(rule, candidate.content, {
        workbook,
        sheet,
        address: candidate.address,
      }).valid
    ) {
      pending = {
        workbook,
        generation: options.getGeneration(),
        candidate: cloneCandidate(candidate),
        ruleSignature: JSON.stringify(rule),
        source: "validation",
        ...(confirmedDuplicate ? { confirmedDuplicate } : {}),
      };
      feedback.value = {
        style: rule.errorStyle ?? "stop",
        title: rule.errorTitle,
        message: rule.error,
      };
      return false;
    }
    dismiss();
    try {
      const changed = options.execute(
        createSetCellContentCommand(candidate.sheetId, candidate.address, candidate.content),
        duplicateBlocked && confirmedDuplicate ? { allowDuplicateEntry: true } : undefined,
      );
      if (
        !changed &&
        JSON.stringify(getCellContent(sheet, candidate.address)) !==
          JSON.stringify(candidate.content)
      )
        return false;
    } catch (error) {
      if (isDuplicateRejection(error)) return rejectDuplicate(workbook, candidate);
      throw error;
    }
    // An unchanged valid value is also a successful editor commit.
    return true;
  }

  function accept(): boolean {
    const request = pending;
    if (!request || !feedback.value || feedback.value.style === "stop") return false;
    const workbook = options.getWorkbook();
    const sheet = workbook.sheets.get(request.candidate.sheetId);
    const rule = sheet && getCellDataValidation(sheet, request.candidate.address);
    if (
      request.workbook !== workbook ||
      request.generation !== options.getGeneration() ||
      !sheet ||
      !canEditCell(sheet, request.candidate.address) ||
      !rule ||
      request.ruleSignature !== JSON.stringify(rule)
    ) {
      dismiss();
      return false;
    }
    const duplicateBlocked = !validateDuplicateEntries(workbook, [request.candidate], {
      includeUnchanged: true,
    }).valid;
    if (
      duplicateBlocked &&
      !isCurrentDuplicateConfirmation(request.confirmedDuplicate, workbook, request.candidate)
    ) {
      return rejectDuplicate(workbook, request.candidate);
    }
    try {
      const changed = options.execute(
        createSetCellContentCommand(
          request.candidate.sheetId,
          request.candidate.address,
          request.candidate.content,
        ),
        duplicateBlocked ? { allowDuplicateEntry: true } : undefined,
      );
      if (
        !changed &&
        JSON.stringify(getCellContent(sheet, request.candidate.address)) !==
          JSON.stringify(request.candidate.content)
      )
        return false;
    } catch (error) {
      if (isDuplicateRejection(error)) return rejectDuplicate(workbook, request.candidate);
      throw error;
    }
    dismiss();
    return true;
  }

  watch(options.getGeneration, dismiss, { flush: "sync" });
  return { feedback, commit, dismiss, accept };
}
