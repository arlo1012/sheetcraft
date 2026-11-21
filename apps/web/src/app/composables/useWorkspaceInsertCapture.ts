import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { canEditCell, canUseSheetPermission } from "@sheetcraft/core";
import { isTextCellNumberFormat } from "@sheetcraft/core/number-format";
import {
  getCellContent,
  getCellStyle,
  type CellAddress,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import type { CaptureShape } from "../../modules/insert-tools/capture-region";
import { captureScreen } from "../../modules/insert-tools/captureScreen";
import {
  useSymbolPreferences,
  validSymbolInsertion,
  type SymbolInsertion,
} from "../../modules/insert-tools/symbols/symbol-preferences";
import type { useCellEditSession } from "../../shared/cell-editing/useCellEditSession";
import type { MessageKey } from "../../shared/i18n";

type CellEditSession = ReturnType<typeof useCellEditSession>;

type WorkspaceInsertCaptureOptions = {
  getWorkbook: () => Workbook;
  getActiveSheet: () => Sheet;
  getWorkbookGeneration: () => number;
  getWorkbookRevision: () => number;
  getActiveAddress: () => CellAddress;
  getActiveCellInput: () => string;
  cellEditSession: CellEditSession;
  isBusy: () => boolean;
  isImageBusy: () => boolean;
  focusCellEditor: () => void;
  focusFormulaBarOrGrid: () => void;
  pasteFloatingImage: (file: File, address: CellAddress) => Promise<boolean>;
  insertRecordingAttachment: (file: File) => boolean;
  t: (key: MessageKey) => string;
};

/** Owns symbol insertion dialog/shortcuts, screen capture, and screen recording insertion flows. */
export function useWorkspaceInsertCapture(options: WorkspaceInsertCaptureOptions) {
  const symbolDialog = shallowRef<{
    dialogId: number;
    insert: (symbol: SymbolInsertion) => boolean;
    close: () => void;
  }>();
  const symbolVisible = computed(() => !!symbolDialog.value);
  const symbolPreferences = useSymbolPreferences();
  let symbolDialogSequence = 0;

  const captureBusy = ref(false);
  const recordingToolOpen = ref(false);
  const recordingModal = ref(false);

  function openRecorder() {
    if (recordingToolOpen.value || !options.cellEditSession.finish()) return;
    recordingModal.value = true;
    recordingToolOpen.value = true;
  }

  function closeRecorder() {
    recordingToolOpen.value = false;
    recordingModal.value = false;
  }

  function insertRecording(file: File) {
    if (options.insertRecordingAttachment(file)) closeRecorder();
  }

  const canCaptureScreen = !!navigator.mediaDevices?.getDisplayMedia;
  const screenCapture = shallowRef<{
    file?: File;
    shape: CaptureShape;
    excludeSelf: boolean;
    workbook: Workbook;
    sheet: Sheet;
    generation: number;
    address: CellAddress;
  }>();
  const requestingCapture = shallowRef<typeof screenCapture.value>();
  const preparingFrame = shallowRef<typeof screenCapture.value>();

  watch([options.getWorkbookGeneration, () => options.getActiveSheet().id], () => {
    screenCapture.value = undefined;
  });

  function openSymbolDialog(): void {
    const sheet = options.getActiveSheet();
    const activeAddress = options.getActiveAddress();
    if (options.isBusy() || !canEditCell(sheet, activeAddress)) return;
    const generation = options.getWorkbookGeneration();
    const address = { ...activeAddress };
    const priorSurface = options.cellEditSession.state.active
      ? options.cellEditSession.state.surface
      : "grid";
    if (
      !options.cellEditSession.begin(
        {
          sheetId: sheet.id,
          address,
          input: options.getActiveCellInput(),
          content: getCellContent(sheet, address),
          asText: isTextCellNumberFormat(getCellStyle(sheet, address)?.numberFormat),
        },
        { surface: priorSurface, mode: "append" },
      )
    )
      return;
    const editGeneration = options.cellEditSession.state.generation;
    const documentRevision = options.getWorkbookRevision();
    let revision = options.cellEditSession.state.revision;
    const current = {
      dialogId: ++symbolDialogSequence,
      insert: (symbol: SymbolInsertion) => {
        const currentAddress = options.getActiveAddress();
        if (
          symbolDialog.value !== current ||
          options.getWorkbookGeneration() !== generation ||
          options.getActiveSheet() !== sheet ||
          currentAddress.row !== address.row ||
          currentAddress.column !== address.column ||
          options.cellEditSession.state.generation !== editGeneration ||
          options.getWorkbookRevision() !== documentRevision ||
          options.cellEditSession.state.revision !== revision
        )
          return false;
        const accepted = insertSymbol(symbol, false);
        if (accepted) revision = options.cellEditSession.state.revision;
        return accepted;
      },
      close: () => {
        if (symbolDialog.value !== current) return;
        symbolDialog.value = undefined;
        if (options.cellEditSession.state.generation === editGeneration) {
          options.cellEditSession.activateSurface(priorSurface);
          void nextTick(
            priorSurface === "formula-bar"
              ? options.focusFormulaBarOrGrid
              : options.focusCellEditor,
          );
        }
      },
    };
    symbolDialog.value = current;
  }

  function insertSymbol(symbol: SymbolInsertion, restoreFocus = true): boolean {
    const sheet = options.getActiveSheet();
    const address = options.getActiveAddress();
    if (
      options.isBusy() ||
      !canEditCell(sheet, address) ||
      options.cellEditSession.state.composing ||
      !validSymbolInsertion(symbol)
    )
      return false;
    const formula =
      (options.cellEditSession.state.active
        ? options.cellEditSession.state.draft
        : options.getActiveCellInput()
      ).startsWith("=") && !isTextCellNumberFormat(getCellStyle(sheet, address)?.numberFormat);
    if (symbol.fontFamily && !formula && !canUseSheetPermission(sheet, "formatCells")) {
      void MessagePlugin.warning(options.t("workspace.cellEditUnavailable"));
      return false;
    }
    if (
      !options.cellEditSession.begin(
        {
          sheetId: sheet.id,
          address,
          input: options.getActiveCellInput(),
          content: getCellContent(sheet, address),
          asText: isTextCellNumberFormat(getCellStyle(sheet, address)?.numberFormat),
        },
        {
          surface: options.cellEditSession.state.active
            ? options.cellEditSession.state.surface
            : "grid",
          mode: "append",
        },
      )
    )
      return false;
    if (
      !options.cellEditSession.replaceSelection(
        symbol.text,
        formula ? undefined : symbol.fontFamily,
        {
          preserveLiteral: !formula,
          preserveTypingFont: !formula,
        },
      )
    )
      return false;
    if (restoreFocus)
      void nextTick(
        options.cellEditSession.state.surface === "formula-bar"
          ? options.focusFormulaBarOrGrid
          : options.focusCellEditor,
      );
    return true;
  }

  const quickSymbolInsert = computed(() => {
    const generation = options.getWorkbookGeneration();
    const sheet = options.getActiveSheet();
    const address = { ...options.getActiveAddress() };
    const editGeneration = options.cellEditSession.state.generation;
    const revision = options.cellEditSession.state.revision;
    const documentRevision = options.getWorkbookRevision();
    const selection = { ...options.cellEditSession.state.selection };
    return (symbol: SymbolInsertion): boolean => {
      const currentAddress = options.getActiveAddress();
      if (
        options.getWorkbookGeneration() !== generation ||
        options.getActiveSheet() !== sheet ||
        currentAddress.row !== address.row ||
        currentAddress.column !== address.column ||
        options.cellEditSession.state.generation !== editGeneration ||
        options.cellEditSession.state.revision !== revision ||
        options.getWorkbookRevision() !== documentRevision ||
        symbolVisible.value ||
        options.cellEditSession.state.selection.start !== selection.start ||
        options.cellEditSession.state.selection.end !== selection.end ||
        options.cellEditSession.state.selection.direction !== selection.direction
      )
        return false;
      return insertSymbol(symbol);
    };
  });

  watch(
    () => options.getActiveSheet().id,
    () => {
      symbolDialog.value = undefined;
    },
  );

  function insertScreenCapture(
    shape: CaptureShape = "rectangle",
    tools = false,
    excludeSelf = false,
  ): void {
    const sheet = options.getActiveSheet();
    if (
      captureBusy.value ||
      screenCapture.value ||
      options.isImageBusy() ||
      options.isBusy() ||
      !canUseSheetPermission(sheet, "editObjects") ||
      !options.cellEditSession.finish()
    )
      return;
    screenCapture.value = {
      workbook: options.getWorkbook(),
      sheet,
      generation: options.getWorkbookGeneration(),
      address: { ...options.getActiveAddress() },
      shape,
      excludeSelf,
    };
    if (!tools && canCaptureScreen) void acquireScreenCapture(true);
  }

  async function acquireScreenCapture(direct: boolean) {
    const target = screenCapture.value;
    if (!target || requestingCapture.value === target) return;
    requestingCapture.value = target;
    try {
      const file = await captureScreen(target.excludeSelf, async () => {
        if (target !== screenCapture.value) return false;
        preparingFrame.value = target;
        await nextTick();
        return screenCapture.value === target;
      });
      if (screenCapture.value !== target) return;
      if (file) screenCapture.value = { ...target, file };
      else if (direct) screenCapture.value = undefined;
    } catch {
      if (screenCapture.value === target)
        void MessagePlugin.error(options.t("drawing.captureFailed"));
    } finally {
      if (requestingCapture.value === target) requestingCapture.value = undefined;
      if (preparingFrame.value === target) preparingFrame.value = undefined;
    }
  }

  async function insertCapturedRegion(file: File): Promise<void> {
    const target = screenCapture.value;
    if (!target?.file || captureBusy.value) return;
    if (
      target.workbook !== options.getWorkbook() ||
      target.sheet !== options.getActiveSheet() ||
      target.generation !== options.getWorkbookGeneration() ||
      !canUseSheetPermission(target.sheet, "editObjects")
    ) {
      screenCapture.value = undefined;
      return;
    }
    captureBusy.value = true;
    try {
      const inserted = await options.pasteFloatingImage(file, target.address);
      if (inserted && screenCapture.value === target) screenCapture.value = undefined;
    } finally {
      captureBusy.value = false;
    }
  }

  return {
    symbolDialog,
    symbolVisible,
    symbolPreferences,
    openSymbolDialog,
    insertSymbol,
    quickSymbolInsert,
    captureBusy,
    recordingToolOpen,
    recordingModal,
    openRecorder,
    closeRecorder,
    insertRecording,
    canCaptureScreen,
    screenCapture,
    requestingCapture,
    preparingFrame,
    insertScreenCapture,
    acquireScreenCapture,
    insertCapturedRegion,
  };
}
