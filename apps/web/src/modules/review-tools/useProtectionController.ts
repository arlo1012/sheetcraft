import { computed, ref, shallowRef, watch } from "vue";
import {
  createApplyCellStyleCommand,
  createSetSheetProtectionCommand,
  createSetWorkbookStructureProtectionCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import { isCellStyleRangeSupported } from "@sheetcraft/core/style-state";
import {
  normalizeSheetProtection,
  unlockEditableRange,
  getProtectedEditableRanges,
  type SheetProtection,
} from "@sheetcraft/core";
import type { CellRange, Sheet, Workbook } from "@sheetcraft/core/workbook";
import { WorkbookDomainError } from "@sheetcraft/core/errors";
import { createBrowserProtectionPassword } from "./protection-password";
import { useAppI18n } from "../../shared/i18n";

export function useProtectionController(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getRange: () => CellRange;
  getRevision: () => number;
  getGeneration: () => number;
  isBusy: () => boolean;
  finishEditing: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
}) {
  const { t } = useAppI18n();
  const dialog = ref<"sheet" | "ranges" | "workbook" | "unlock">();
  const configuration = shallowRef<SheetProtection>({ editableRanges: [] });
  const selection = shallowRef<CellRange>(options.getRange());
  const error = ref("");
  const unlockRangeName = ref("");
  let target: { sheetId: string; revision: number } | undefined;
  const canLockCells = computed(
    () =>
      !options.isBusy() &&
      !options.getSheet().properties.protected &&
      isCellStyleRangeSupported(options.getRange()),
  );
  const lockedState = computed<boolean | "mixed">(() => {
    void options.getRevision();
    const input = options.getRange();
    const start = {
      row: Math.min(input.start.row, input.end.row),
      column: Math.min(input.start.column, input.end.column),
    };
    const end = {
      row: Math.max(input.start.row, input.end.row),
      column: Math.max(input.start.column, input.end.column),
    };
    let unlocked = 0;
    for (const [key, cell] of options.getSheet().cells) {
      if (!cell.style?.unlocked) continue;
      const [row, column] = key.split(":").map(Number) as [number, number];
      if (row >= start.row && row <= end.row && column >= start.column && column <= end.column)
        unlocked++;
    }
    return unlocked === 0
      ? true
      : unlocked === (end.row - start.row + 1) * (end.column - start.column + 1)
        ? false
        : "mixed";
  });
  const structureProtected = computed(() => {
    void options.getRevision();
    return Boolean(options.getWorkbook().structureProtected);
  });
  function toggleCells(): void {
    if (!canLockCells.value || !options.finishEditing()) return;
    options.execute(
      createApplyCellStyleCommand(options.getSheet().id, options.getRange(), {
        unlocked: lockedState.value === true ? true : null,
      }),
    );
  }
  function close(): void {
    dialog.value = undefined;
    target = undefined;
    error.value = "";
  }
  function open(kind: "sheet" | "ranges" | "workbook"): void {
    if (options.isBusy() || !options.finishEditing()) return;
    target = { sheetId: options.getSheet().id, revision: options.getRevision() };
    configuration.value = normalizeSheetProtection(options.getSheet().protection) ?? {
      editableRanges: [],
    };
    selection.value = {
      start: { ...options.getRange().start },
      end: { ...options.getRange().end },
    };
    error.value = "";
    dialog.value = kind;
  }
  function save(value?: SheetProtection, password = ""): void {
    if (!target || options.isBusy()) return;
    if (target.sheetId !== options.getSheet().id || target.revision !== options.getRevision()) {
      error.value = t("review.staleTarget");
      return;
    }
    const sheet = options.getSheet();
    try {
      const protecting = !sheet.properties.protected;
      const nextConfiguration = value ?? configuration.value;
      const command =
        dialog.value === "workbook"
          ? createSetWorkbookStructureProtectionCommand(
              !structureProtected.value,
              structureProtected.value ? undefined : createBrowserProtectionPassword(password),
              password,
            )
          : createSetSheetProtectionCommand(
              sheet.id,
              dialog.value === "sheet" ? protecting : sheet.properties.protected,
              dialog.value === "sheet"
                ? {
                    ...nextConfiguration,
                    password: protecting ? createBrowserProtectionPassword(password) : undefined,
                  }
                : nextConfiguration,
              password,
            );
      options.execute(command);
      close();
    } catch (cause) {
      error.value = t(
        cause instanceof WorkbookDomainError && cause.data.code === "incorrect_protection_password"
          ? "review.incorrectPassword"
          : "review.failed",
      );
    }
  }
  function protectWithRanges(value: SheetProtection): void {
    save(value);
    if (!dialog.value) open("sheet");
  }
  function requestRangeUnlock(range: CellRange | string): void {
    if (options.isBusy()) return;
    const sheet = options.getSheet();
    const entry =
      typeof range === "string"
        ? sheet.protection?.editableRanges.find((item) => item.name === range)
        : getProtectedEditableRanges(sheet, range)[0];
    if (!entry?.password) return;
    target = { sheetId: sheet.id, revision: options.getRevision() };
    unlockRangeName.value = entry.name;
    error.value = "";
    dialog.value = "unlock";
  }
  function unlock(password: string): void {
    if (
      !target ||
      target.sheetId !== options.getSheet().id ||
      target.revision !== options.getRevision()
    ) {
      error.value = t("review.staleTarget");
      return;
    }
    if (!unlockEditableRange(options.getSheet(), unlockRangeName.value, password)) {
      error.value = t("review.incorrectPassword");
      return;
    }
    close();
  }
  watch([options.getGeneration, () => options.getSheet().id], close);
  return {
    dialog,
    configuration,
    selection,
    error,
    canLockCells,
    lockedState,
    structureProtected,
    toggleCells,
    open,
    close,
    save,
    protectWithRanges,
    requestRangeUnlock,
    unlockRangeName,
    unlock,
  };
}
