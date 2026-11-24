import type { MessageKey } from "../../shared/i18n";
import type { CellErrorDescription } from "../sheet-grid/components/SheetCellErrorMenu.vue";
import type { ErrorCheckKind } from "./error-check-rules";

export type CellErrorQuickActions = Readonly<{
  trimActiveSpaces: () => void;
  recalculateWorkbook: () => void;
}>;

export function describeCellErrorCheck(
  kind: ErrorCheckKind | undefined,
  t: (key: MessageKey) => string,
  actions: CellErrorQuickActions,
): CellErrorDescription | undefined {
  if (!kind || kind === "duplicate") return undefined;
  switch (kind) {
    case "number-stored-as-text":
      return {
        numberConversion: true,
        label: t("dataTools.duplicates.errorChecks.numberStoredAsText"),
        message: t("dataTools.duplicates.errorChecks.numberStoredAsTextMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllNumberTextHint"),
      };
    case "formula-error":
      return {
        label: t("dataTools.duplicates.errorChecks.formulaError"),
        message: t("dataTools.duplicates.errorChecks.formulaErrorMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllFormulaErrorHint"),
      };
    case "two-digit-year":
      return {
        label: t("dataTools.duplicates.errorChecks.twoDigitYear"),
        message: t("dataTools.duplicates.errorChecks.twoDigitYearMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllTwoDigitYearHint"),
      };
    case "inconsistent-formula":
      return {
        label: t("dataTools.duplicates.errorChecks.inconsistentFormula"),
        message: t("dataTools.duplicates.errorChecks.inconsistentFormulaMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllInconsistentFormulaHint"),
      };
    case "formula-omitting-cells":
      return {
        label: t("dataTools.duplicates.errorChecks.formulaOmittingCells"),
        message: t("dataTools.duplicates.errorChecks.formulaOmittingCellsMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllFormulaOmittingCellsHint"),
      };
    case "unlocked-formula":
      return {
        label: t("dataTools.duplicates.errorChecks.unlockedFormula"),
        message: t("dataTools.duplicates.errorChecks.unlockedFormulaMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllUnlockedFormulaHint"),
      };
    case "formula-refers-to-empty":
      return {
        label: t("dataTools.duplicates.errorChecks.formulaRefersToEmpty"),
        message: t("dataTools.duplicates.errorChecks.formulaRefersToEmptyMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllFormulaRefersToEmptyHint"),
      };
    case "data-validation":
      return {
        label: t("dataTools.duplicates.errorChecks.dataValidation"),
        message: t("dataTools.duplicates.errorChecks.dataValidationMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllDataValidationHint"),
      };
    case "leading-trailing-spaces":
      return {
        label: t("dataTools.duplicates.errorChecks.leadingTrailingSpaces"),
        message: t("dataTools.duplicates.errorChecks.leadingTrailingSpacesMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllLeadingTrailingSpacesHint"),
        quickAction: {
          id: "trim-spaces",
          label: t("dataTools.duplicates.errorChecks.trimSpaces"),
          requiresWrite: true,
          run: actions.trimActiveSpaces,
        },
      };
    case "calculated-column":
      return {
        label: t("dataTools.duplicates.errorChecks.calculatedColumn"),
        message: t("dataTools.duplicates.errorChecks.calculatedColumnMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllCalculatedColumnHint"),
      };
    case "calculation-incomplete":
      return {
        label: t("dataTools.duplicates.errorChecks.calculationIncomplete"),
        message: t("dataTools.duplicates.errorChecks.calculationIncompleteMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllCalculationIncompleteHint"),
        quickAction: {
          id: "recalculate-workbook",
          label: t("dataTools.duplicates.errorChecks.recalculateNow"),
          run: actions.recalculateWorkbook,
        },
      };
    case "irregular-date":
      return {
        label: t("dataTools.duplicates.errorChecks.irregularDate"),
        message: t("dataTools.duplicates.errorChecks.irregularDateMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllIrregularDateHint"),
      };
  }
}
