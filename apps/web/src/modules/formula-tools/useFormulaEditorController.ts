import { canEditCell } from "@idea10/core";
import { computed, nextTick, ref, watch } from "vue";
import { formatCellAddress } from "@idea10/core/coordinates";
import { formatCellContentForInput } from "@idea10/core/input";
import { getCellContent, type CellAddress, type Workbook } from "@idea10/core/workbook";
import type { CellEditSession } from "../../shared/cell-editing/useCellEditSession";
import { useAppI18n } from "../../shared/i18n";
import { previewFormulaInput } from "./formula-value-preview";

export function useFormulaEditorController(options: {
  getWorkbook: () => Workbook;
  getRevision: () => number;
  getAddress: () => CellAddress;
  editSession: CellEditSession;
  isBusy: () => boolean;
  focusFormulaBar: () => void;
}) {
  const { t } = useAppI18n();
  const session = options.editSession;
  const visible = ref(false);
  const previewing = ref(false);
  const previewValue = ref("");
  const error = ref("");
  let priorDraft:
    | {
        value: string;
        start: number;
        end: number;
        direction: "none" | "forward" | "backward";
        mode: "edit" | "point";
      }
    | undefined;
  const target = computed(() => {
    void options.getRevision();
    return {
      sheetId: session.state.owner?.sheetId ?? options.getWorkbook().activeSheetId,
      address: session.state.owner?.address ?? options.getAddress(),
    };
  });
  const sheet = computed(() => {
    void options.getRevision();
    return options.getWorkbook().sheets.get(target.value.sheetId);
  });
  const targetLabel = computed(
    () => `${sheet.value?.name ?? ""}!${formatCellAddress(target.value.address)}`,
  );
  const value = computed(() => {
    void options.getRevision();
    if (session.state.active) return session.state.draft;
    return sheet.value
      ? formatCellContentForInput(getCellContent(sheet.value, target.value.address))
      : "";
  });
  const disabled = computed(
    () =>
      options.isBusy() ||
      session.state.composing ||
      !sheet.value ||
      !canEditCell(sheet.value, target.value.address),
  );

  watch(
    () => [visible.value, previewing.value, value.value, targetLabel.value, options.getRevision()],
    (_state, _previous, onCleanup) => {
      if (!visible.value && !previewing.value) return;
      previewValue.value = "…";
      const timer = setTimeout(() => {
        previewValue.value = previewFormulaInput(
          options.getWorkbook(),
          target.value.sheetId,
          target.value.address,
          value.value,
        );
      }, 150);
      onCleanup(() => clearTimeout(timer));
    },
  );

  function open(): void {
    if (visible.value || disabled.value || !sheet.value) return;
    const previous = session.state.active
      ? { value: session.state.draft, ...session.state.selection, mode: session.state.mode }
      : undefined;
    const { sheetId, address } = target.value;
    if (
      !session.begin(
        {
          sheetId,
          address,
          input: formatCellContentForInput(getCellContent(sheet.value, address)),
        },
        { surface: "formula-bar", mode: "append" },
      )
    )
      return;
    priorDraft = previous;
    if (!session.state.draft) session.setDraft("=");
    previewing.value = false;
    error.value = "";
    visible.value = true;
  }

  function change(input: string): void {
    if (!visible.value) return;
    session.setDraft(input);
    error.value = "";
  }

  function composing(active: boolean): void {
    if (active) session.startComposition();
    else session.endComposition(session.state.draft);
  }

  function confirm(): void {
    if (!visible.value || disabled.value) return;
    if (!session.finish({ complete: true, confirmPendingWarning: true })) {
      error.value = t("formulaTools.editorApplyFailed");
      return;
    }
    visible.value = false;
    priorDraft = undefined;
    error.value = "";
    void nextTick(options.focusFormulaBar);
  }

  function close(): void {
    if (session.state.composing) return;
    if (priorDraft) {
      session.setDraft(priorDraft.value);
      session.setSelection(priorDraft.start, priorDraft.end, priorDraft.direction);
      session.setMode(priorDraft.mode);
    } else session.cancel();
    priorDraft = undefined;
    visible.value = false;
    error.value = "";
    void nextTick(options.focusFormulaBar);
  }

  function reset(): void {
    priorDraft = undefined;
    visible.value = false;
    previewing.value = false;
    previewValue.value = "";
    error.value = "";
  }

  return {
    visible,
    previewing,
    previewValue,
    value,
    targetLabel,
    error,
    disabled,
    open,
    change,
    composing,
    confirm,
    close,
    reset,
  };
}
