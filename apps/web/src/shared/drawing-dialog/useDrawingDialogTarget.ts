import { computed, getCurrentScope, onScopeDispose, shallowRef, watch } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import type { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, Workbook } from "@sheetcraft/core/workbook";

type DrawingTarget = {
  workbook: Workbook;
  sheet: Sheet;
  generation: number | undefined;
  existing: SheetDrawing | undefined;
  request: number;
};
export type DrawingDialogTarget<T extends SheetDrawing, Args extends unknown[]> = DrawingTarget & {
  dialogId: number;
  initial: T;
  confirm: (drawing: T, ...args: Args) => void;
  close: () => void;
};

/** Shared identity/confirmation lifecycle for the three existing object editors. */
export function useDrawingDialogTarget<T extends SheetDrawing, Args extends unknown[]>(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration?: () => number;
  getRevision?: () => number;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  onReset?: () => void;
}) {
  type Dialog = DrawingDialogTarget<T, Args>;
  const dialog = shallowRef<Dialog>();
  const editing = computed(() => dialog.value?.initial);
  let operation = 0;
  let dialogId = 0;
  let confirming = false;
  let disposed = false;
  const allowed = (sheet: Sheet) =>
    !disposed && !options.isBusy() && canUseSheetPermission(sheet, "editObjects");
  const valid = (target: DrawingTarget) =>
    !disposed &&
    target.workbook === options.getWorkbook() &&
    target.generation === options.getGeneration?.() &&
    target.sheet === options.getSheet() &&
    target.workbook.sheets.get(target.sheet.id) === target.sheet &&
    (!target.existing || target.sheet.drawings?.includes(target.existing) === true);
  function close(target?: Dialog) {
    if (target && dialog.value !== target) return;
    operation++;
    dialog.value = undefined;
    options.onReset?.();
  }
  if (getCurrentScope()) {
    watch([options.getWorkbook, options.getSheet, () => options.getGeneration?.()], () => close(), {
      flush: "sync",
    });
    watch(
      () => {
        void options.getRevision?.();
        return !dialog.value || valid(dialog.value);
      },
      (current) => {
        if (!current && !confirming) close();
      },
      { flush: "sync" },
    );
    onScopeDispose(() => {
      disposed = true;
      close();
    });
  }
  function prepare(existing?: T): DrawingTarget | undefined {
    if (confirming || disposed) return;
    const target = {
      workbook: options.getWorkbook(),
      sheet: options.getSheet(),
      generation: options.getGeneration?.(),
      existing,
      request: ++operation,
    };
    if (
      !allowed(target.sheet) ||
      !valid(target) ||
      !options.flush() ||
      target.request !== operation ||
      !valid(target) ||
      !allowed(target.sheet)
    )
      return;
    return target;
  }
  function open(
    target: DrawingTarget,
    initial: T,
    confirm: (target: Dialog, drawing: T, ...args: Args) => void,
  ) {
    if (target.request !== operation || !valid(target) || !allowed(target.sheet)) return;
    const next: Dialog = {
      ...target,
      initial,
      dialogId: ++dialogId,
      confirm: (drawing, ...args) => confirm(next, drawing, ...args),
      close: () => close(next),
    };
    options.onReset?.();
    dialog.value = next;
  }
  function run(target: Dialog | undefined, work: (target: Dialog) => void) {
    if (!target || dialog.value !== target || confirming || disposed) return;
    if (!valid(target)) {
      close(target);
      return;
    }
    if (!allowed(target.sheet)) return;
    confirming = true;
    try {
      work(target);
    } finally {
      confirming = false;
      if (dialog.value === target && !valid(target)) close(target);
    }
  }
  function unchanged(target: Dialog, command: ReturnType<typeof createSetSheetDrawingsCommand>) {
    if (!target.existing) return false;
    const sheets = new Map(target.workbook.sheets);
    sheets.set(target.sheet.id, { ...target.sheet });
    return applyWorkbookCommand({ ...target.workbook, sheets }, command) === null;
  }
  function commit(
    target: Dialog,
    command: ReturnType<typeof createSetSheetDrawingsCommand>,
  ): boolean {
    if (
      dialog.value !== target ||
      !valid(target) ||
      !allowed(target.sheet) ||
      command.sheetId !== target.sheet.id
    )
      return false;
    const noChange = unchanged(target, command);
    if (options.execute(command) === false) {
      // The real executor also returns false for a proven no-op existing edit.
      if (noChange && dialog.value === target && valid(target) && unchanged(target, command)) {
        close(target);
        return true;
      }
      return false;
    }
    close(target);
    return true;
  }
  return { dialog, editing, prepare, open, run, commit, close };
}
