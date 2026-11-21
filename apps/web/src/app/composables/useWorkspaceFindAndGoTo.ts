import { nextTick, ref, shallowRef, watch, type Ref } from "vue";
import type { CellFormatChange } from "@sheetcraft/core/commands";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import type { SheetGoToOptions } from "@sheetcraft/core/go-to";
import type { CellAddress, Sheet, Workbook } from "@sheetcraft/core/workbook";
import type WorkbookFindDialog from "../../modules/workbook/components/WorkbookFindDialog.vue";
import { useWorkbookFindShortcuts } from "../../modules/workbook/composables/useWorkbookFindShortcuts";
import {
  applyFindFormatChange,
  buildFindFormatFromCell,
  createFindFormatDraft,
} from "../../modules/workbook/workbook-find-format";
import type {
  WorkbookFindFormatMode,
  WorkbookFindMode,
  WorkbookFindResult,
} from "../../modules/workbook/workbook-find-types";
import type { useCellEditSession } from "../../shared/cell-editing/useCellEditSession";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import { useRangeReferencePicker } from "../../shared/range-reference/useRangeReferencePicker";
import type { useSpreadsheetWorkspaceController } from "./useSpreadsheetWorkspaceController";

type CellEditSession = ReturnType<typeof useCellEditSession>;
type WorkspaceController = ReturnType<typeof useSpreadsheetWorkspaceController>;

type WorkspaceFindAndGoToOptions = {
  getWorkbook: () => Workbook;
  getActiveSheet: () => Sheet;
  getWorkbookGeneration: () => number;
  getActiveAddress: () => CellAddress;
  cellEditSession: CellEditSession;
  workbookFind: WorkspaceController["workbookFind"];
  workbookGoTo: WorkspaceController["workbookGoTo"];
  findDialogVisible: Ref<boolean>;
  findDialogRef: Ref<InstanceType<typeof WorkbookFindDialog> | undefined>;
  findMode: Ref<WorkbookFindMode>;
  isShortcutBlocked: () => boolean;
};

/** Owns Find/Replace/Go-To dialog actions, format matching picker, and Ctrl+F/H/G shortcuts. */
export function useWorkspaceFindAndGoTo(options: WorkspaceFindAndGoToOptions) {
  const { workbookFind, workbookGoTo, findDialogVisible, findDialogRef, findMode } = options;
  const findFormatTarget = ref<"find" | "replace">("find");
  const findFormatDraft = shallowRef<ReturnType<typeof createFindFormatDraft>>();
  const findFormatPicker = useRangeReferencePicker(() => options.getActiveSheet().name, {
    singleCell: true,
  });
  const { active: pickingFindFormat, reference: pickedFindFormatReference } = findFormatPicker;

  function openFind(mode: WorkbookFindMode = "find"): void {
    if (!options.cellEditSession.finish()) return;
    findMode.value = mode;
    findDialogVisible.value = true;
    void nextTick(() => findDialogRef.value?.focusQuery());
  }

  useWorkbookFindShortcuts({
    canOpen: (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-shape-canvas-text-editor], [data-shape-canvas-text-toolbar]")
      )
        return false;
      if (
        options.cellEditSession.state.composing ||
        options.isShortcutBlocked() ||
        findFormatDraft.value
      )
        return false;
      const dialog = event.target instanceof Element ? event.target.closest(".t-dialog") : null;
      return !dialog || dialog.classList.contains("workbook-find-dialog-frame");
    },
    open: openFind,
  });

  function runFind(direction: "forward" | "backward"): void {
    if (options.cellEditSession.finish()) workbookFind.find(direction);
  }

  function runFindAll(): void {
    if (options.cellEditSession.finish()) workbookFind.findAll();
  }

  function runReplace(all = false): void {
    if (!options.cellEditSession.finish()) return;
    if (all) workbookFind.replaceAll();
    else workbookFind.replace();
  }

  function runGoTo(goToOptions: SheetGoToOptions): void {
    if (options.cellEditSession.finish()) workbookGoTo.locate(goToOptions);
  }

  function selectGoToResult(result: WorkbookFindResult): void {
    if (options.cellEditSession.finish()) workbookGoTo.selectResult(result);
  }

  function selectFindResult(result: WorkbookFindResult): void {
    if (options.cellEditSession.finish()) workbookFind.selectResult(result);
  }

  function configureFindFormat(target: "find" | "replace" = "find"): void {
    if (!options.cellEditSession.finish()) return;
    findFormatTarget.value = target;
    findFormatDraft.value = createFindFormatDraft(
      target === "replace" ? workbookFind.replacementFormat.value : workbookFind.format.value,
    );
  }

  function confirmFindFormat(change: CellFormatChange): void {
    if (findFormatTarget.value === "replace") {
      workbookFind.setReplacementFormat(
        applyFindFormatChange(workbookFind.replacementFormat.value, change),
      );
    } else {
      workbookFind.setFormat(applyFindFormatChange(workbookFind.format.value, change));
    }
    findFormatDraft.value = undefined;
  }

  async function pickFindFormat(
    mode: WorkbookFindFormatMode,
    purpose: "find" | "replace" = "find",
  ): Promise<void> {
    if (!options.cellEditSession.finish()) return;
    const workbook = options.getWorkbook();
    const generation = options.getWorkbookGeneration();
    const sheetId = options.getActiveSheet().id;
    const activeAddress = options.getActiveAddress();
    const selected = await findFormatPicker.selectReference(
      formatRangeReference(options.getActiveSheet().name, {
        start: activeAddress,
        end: activeAddress,
      }),
    );
    if (
      !selected ||
      workbook !== options.getWorkbook() ||
      generation !== options.getWorkbookGeneration() ||
      !findDialogVisible.value
    )
      return;
    const target = resolveRangeReference(workbook, selected, sheetId);
    if (!target) return;
    const sheet = workbook.sheets.get(target.sheetId);
    if (!sheet) return;
    const address = target.range.start;
    const setFormat =
      purpose === "replace" ? workbookFind.setReplacementFormat : workbookFind.setFormat;
    setFormat(
      buildFindFormatFromCell(sheet.cells.get(`${address.row}:${address.column}`)?.style, mode),
      `${sheet.name}!${formatCellAddress(address)}`,
    );
  }

  watch(findDialogVisible, (visible) => {
    if (!visible) {
      findFormatPicker.cancel();
      findFormatDraft.value = undefined;
    }
  });

  watch(options.getWorkbookGeneration, () => {
    findFormatPicker.cancel();
    findFormatDraft.value = undefined;
  });

  return {
    findFormatTarget,
    findFormatDraft,
    findFormatPicker,
    pickingFindFormat,
    pickedFindFormatReference,
    openFind,
    runFind,
    runFindAll,
    runReplace,
    runGoTo,
    selectGoToResult,
    selectFindResult,
    configureFindFormat,
    confirmFindFormat,
    pickFindFormat,
  };
}
