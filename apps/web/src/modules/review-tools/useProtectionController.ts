import { computed, ref, shallowRef, watch } from "vue";
import {
  createApplyCellStyleCommand,
  createSetSheetProtectionCommand,
  createSetWorkbookStructureProtectionCommand,
  type WorkbookCommand,
} from "@idea10/core/commands";
import { isCellStyleRangeSupported } from "@idea10/core/style-state";
import { normalizeSheetProtection, type SheetProtection } from "@idea10/core";
import type { CellRange, Sheet, Workbook } from "@idea10/core/workbook";
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
  const dialog = ref<"sheet" | "ranges" | "workbook">();
  const configuration = shallowRef<SheetProtection>({ editableRanges: [] });
  const selection = shallowRef<CellRange>(options.getRange());
  const error = ref("");
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
    if (kind === "ranges" && options.getSheet().properties.protected) return;
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
  function save(value?: SheetProtection): void {
    if (!target || options.isBusy()) return;
    if (target.sheetId !== options.getSheet().id || target.revision !== options.getRevision()) {
      error.value = t("review.staleTarget");
      return;
    }
    const sheet = options.getSheet();
    const command =
      dialog.value === "workbook"
        ? createSetWorkbookStructureProtectionCommand(!structureProtected.value)
        : createSetSheetProtectionCommand(
            sheet.id,
            dialog.value === "sheet" ? !sheet.properties.protected : sheet.properties.protected,
            value ?? configuration.value,
          );
    if (options.execute(command)) close();
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
  };
}
