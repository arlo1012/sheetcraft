import { onScopeDispose, ref, shallowRef, watch } from "vue";
import type { Sheet, Workbook } from "@sheetcraft/core/workbook";
import { formatSparklineReference, readSparklineDateRange } from "@sheetcraft/core/sparklines";
import type { SparklineDialogOptions } from "./useSparklineSettingsDialog";

export function useSparklineDateAxis(
  options: SparklineDialogOptions & {
    workbook: () => Workbook;
    sheet: () => Sheet;
    revision: () => number;
    selectSheet: (id: string) => void;
  },
) {
  type Draft = {
    key: string;
    initial: string;
    workbook: Workbook;
    ownerId: string;
    confirm: (text: string) => void;
    close: () => void;
  };
  const dialog = shallowRef<Draft>();
  const failed = ref(false),
    picking = ref(false);
  let navigating = false,
    sequence = 0;
  function close() {
    dialog.value = undefined;
    failed.value = false;
  }
  watch(
    options.getContext,
    () => {
      if (!picking.value) close();
    },
    { flush: "sync" },
  );
  watch(
    [options.workbook, options.revision],
    () => {
      if (!navigating) close();
    },
    { flush: "sync" },
  );
  onScopeDispose(close);
  function open() {
    if (!options.flush()) return;
    const context = options.getContext();
    if (!context || context.disabled) return;
    const workbook = options.workbook(),
      owner = options.sheet(),
      axis = context.value;
    const source = axis.dateSheetId ? workbook.sheets.get(axis.dateSheetId) : owner;
    let initial = "";
    if (!context.mixed.includes("dateRange") && !context.mixed.includes("dateSheetId")) {
      if (axis.dateRange === null) initial = "#REF!";
      else if (source && axis.dateRange)
        initial = "=" + formatSparklineReference(axis.dateRange, source.name);
    }
    const draft: Draft = {
      key: `${context.key}:${++sequence}`,
      workbook,
      ownerId: owner.id,
      initial,
      confirm(text) {
        const current = options.getContext();
        if (
          dialog.value !== draft ||
          picking.value ||
          options.workbook() !== workbook ||
          current?.key !== context.key ||
          current.disabled
        )
          return;
        const patch = readSparklineDateRange(text, {
          currentSheetId: owner.id,
          resolveSheetId: (name) =>
            [...workbook.sheets.values()].find(
              (sheet) => sheet.name.toLowerCase() === name.toLowerCase(),
            )?.id,
        });
        if (patch && current.apply(patch)) close();
        else if (dialog.value === draft) failed.value = true;
      },
      close() {
        if (dialog.value === draft) close();
      },
    };
    failed.value = false;
    dialog.value = draft;
  }
  function selectPickerSheet(id: string) {
    const sheet = dialog.value?.workbook.sheets.get(id);
    if (!picking.value || !sheet || sheet.dashboard) return;
    navigating = true;
    try {
      options.selectSheet(id);
    } finally {
      navigating = false;
    }
  }
  async function pick(select: () => Promise<string | undefined>) {
    const draft = dialog.value;
    if (!draft || picking.value) return;
    picking.value = true;
    try {
      const selected = await select();
      return dialog.value === draft ? selected : undefined;
    } finally {
      if (
        dialog.value === draft &&
        options.workbook() === draft.workbook &&
        draft.workbook.sheets.has(draft.ownerId)
      )
        selectPickerSheet(draft.ownerId);
      picking.value = false;
    }
  }
  return { dialog, failed, open, picking, selectPickerSheet, pick };
}
