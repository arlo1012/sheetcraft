import { shallowRef, watch } from "vue";
import { createSetCellContentCommand, type WorkbookCommand } from "@idea10/core/commands";
import {
  getCellDataValidation,
  validateCellContentDataValidation,
} from "@idea10/core/data-validation";
import type { CellContent } from "@idea10/core/formula";
import type { CellAddress, SheetDataValidation, Workbook } from "@idea10/core/workbook";

type Candidate = {
  sheetId: string;
  address: CellAddress;
  content: CellContent | null;
};

export type DataValidationFeedback = {
  style: NonNullable<SheetDataValidation["errorStyle"]>;
  title?: string;
  message?: string;
};

/** Keeps a rejected edit pending while the editor retains the user's draft. */
export function useDataValidationInput(options: {
  getWorkbook: () => Workbook;
  getGeneration: () => number;
  execute: (command: WorkbookCommand) => boolean;
}) {
  const feedback = shallowRef<DataValidationFeedback>();
  let pending:
    | {
        workbook: Workbook;
        generation: number;
        candidate: Candidate;
        ruleSignature: string;
      }
    | undefined;

  function dismiss(): void {
    pending = undefined;
    feedback.value = undefined;
  }

  function commit(candidate: Candidate): boolean {
    const workbook = options.getWorkbook();
    const sheet = workbook.sheets.get(candidate.sheetId);
    if (!sheet || sheet.properties.protected) return false;
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
        candidate: {
          ...candidate,
          address: { ...candidate.address },
          content: candidate.content ? structuredClone(candidate.content) : null,
        },
        ruleSignature: JSON.stringify(rule),
      };
      feedback.value = {
        style: rule.errorStyle ?? "stop",
        title: rule.errorTitle,
        message: rule.error,
      };
      return false;
    }
    dismiss();
    options.execute(
      createSetCellContentCommand(candidate.sheetId, candidate.address, candidate.content),
    );
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
      sheet.properties.protected ||
      !rule ||
      request.ruleSignature !== JSON.stringify(rule)
    ) {
      dismiss();
      return false;
    }
    options.execute(
      createSetCellContentCommand(
        request.candidate.sheetId,
        request.candidate.address,
        request.candidate.content,
      ),
    );
    dismiss();
    return true;
  }

  watch(options.getGeneration, dismiss, { flush: "sync" });
  return { feedback, commit, dismiss, accept };
}
