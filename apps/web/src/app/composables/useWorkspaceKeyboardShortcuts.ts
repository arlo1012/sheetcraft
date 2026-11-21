import { nextTick, type ComputedRef, type Ref } from "vue";
import {
  isShapeGroupDrawing,
  isSheetGroupedEquationDrawing,
  traverseShapeGroup,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import type { EquationRootEditSource } from "../../modules/sheet-drawings/equation/useEquationEditSession";
import type { CellAddress, Sheet, Workbook } from "@sheetcraft/core/workbook";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import type ChartFormatPaneType from "../../modules/charts/components/ChartFormatPane.vue";
import {
  resolveSymbolShortcut,
  withRecentSymbol,
  type SymbolInsertion,
  type SymbolPreferences,
} from "../../modules/insert-tools/symbols/symbol-preferences";
import { shapeFormatOwnerKey } from "../../modules/sheet-drawings/shape-format-pane-model";
import { ownsShapeTextEditTarget } from "../../modules/sheet-drawings/shape-text-edit-ownership";
import type { useShapeClipboard } from "../../modules/sheet-drawings/useShapeClipboard";
import type { useCellEditSession } from "../../shared/cell-editing/useCellEditSession";
import { ensureCellFontResource } from "../../shared/cell-text/font-resources";
import { restoreFocusAfterRemount } from "../../shared/floating/useDismissibleFloatingPanel";
import type { MessageKey } from "../../shared/i18n";
import {
  isFormatPaneReadonlyHistoryControl,
  routeFormatPaneHistoryShortcut,
} from "../format-pane-history-shortcuts";
import { routeRibbonHistoryShortcut } from "../ribbon-history-shortcuts";

type ShapePaneFieldLease = {
  element: HTMLElement;
  pane: { owner: Parameters<typeof shapeFormatOwnerKey>[0] };
  current: () => boolean;
};

type WorkspaceKeyboardShortcutsOptions = {
  getWorkbook: () => Workbook;
  getActiveSheet: () => Sheet;
  getActiveAddress: () => CellAddress;
  workbookGeneration: Ref<number>;
  workbookRevision: Ref<number>;
  cellEditSession: ReturnType<typeof useCellEditSession>;
  gridInert: ComputedRef<boolean>;
  imageBusy: ComputedRef<boolean>;
  showFormulaBar: Ref<boolean>;
  formatPainterActive: Ref<boolean>;
  selectedShapeObjectPaths: Ref<readonly ShapeGroupPath[]>;
  isEditingDashboard: () => boolean;
  isShortcutsSuppressedByDialog: () => boolean;
  isBusy: () => boolean;
  hasChartModalOpen: () => boolean;
  hasCellFormatOpen: () => boolean;
  getActiveRangePicker: () => { confirm: () => void; cancel: () => void } | undefined;
  getEquationSnapshot: () => { sessionId: number } | undefined;
  getShapeTextEditSnapshot: () => { sessionId: number } | undefined;
  getShapeRibbonFormatSnapshot: () => unknown;
  ownsSelectedShapeFieldTarget: (target: EventTarget | null) => boolean;
  flushSelectedShapeFieldDrafts: (snapshot: NonNullable<unknown>) => boolean;
  cancelPendingEquationOpen: () => void;
  flushPendingEquationEdit: () => boolean | undefined;
  flushPendingShapeTextEdit: () => boolean | undefined;
  hasActivePictureCrop: () => boolean;
  getSelectedShapeObjects: () => readonly ShapeGroupPath[];
  getPictureEffectsFocusReturn: () => () => HTMLElement | null | undefined;
  getChartFormatContext: () => { isCurrent: () => boolean; disabled: boolean } | undefined;
  chartFormatPaneRef: Ref<InstanceType<typeof ChartFormatPaneType> | undefined>;
  getSelectedShapePaneFieldLease: () => ShapePaneFieldLease | undefined;
  shapeClipboard: ReturnType<typeof useShapeClipboard>;
  shapeClipboardEpoch: Ref<number>;
  symbolPreferences: {
    preferences: Ref<SymbolPreferences>;
    update: (next: SymbolPreferences) => void;
  };
  insertSymbol: (symbol: SymbolInsertion) => boolean;
  editOwnedDrawing: (root: ShapeGroupDrawing, path: ShapeGroupPath) => void;
  beginEquationEdit: (drawing: EquationRootEditSource) => void;
  insertScreenCapture: (mode: "rectangle", hideWindow: boolean, copyOnly: boolean) => void;
  openHyperlinkEdit: () => void;
  requestCreateTable: () => void;
  openCellFormat: () => void;
  focusCellEditor: () => void;
  focusFormulaBar: () => void;
  cancelFormatPainter: () => void;
  undo: () => boolean | void;
  redo: () => boolean | void;
  t: (key: MessageKey) => string;
};

/** Owns workspace-level outside pointer flushing, native text copy coordination, and global keyboard shortcuts. */
export function useWorkspaceKeyboardShortcuts(options: WorkspaceKeyboardShortcutsOptions) {
  const {
    workbookGeneration,
    workbookRevision,
    cellEditSession,
    gridInert,
    imageBusy,
    showFormulaBar,
    formatPainterActive,
    selectedShapeObjectPaths,
    chartFormatPaneRef,
    shapeClipboard,
    shapeClipboardEpoch,
    symbolPreferences,
    t,
  } = options;

  function onWorkspaceShapeTextOutsideAction(event: PointerEvent | MouseEvent): void {
    options.cancelPendingEquationOpen();
    const math = options.getEquationSnapshot();
    if (
      math &&
      !(
        event.target instanceof Element &&
        event.target.closest(`[data-equation-session="${math.sessionId}"]`)
      )
    ) {
      if (options.flushPendingEquationEdit() === false) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }
    const current = options.getShapeTextEditSnapshot();
    if (!current) {
      const selected = options.getShapeRibbonFormatSnapshot();
      if (!selected || options.ownsSelectedShapeFieldTarget(event.target)) return;
      if (!options.flushSelectedShapeFieldDrafts(selected)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (ownsShapeTextEditTarget(event.target, current.sessionId)) return;
    if (options.flushPendingShapeTextEdit() === false) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function onWorkspaceNativeTextCopy(event: ClipboardEvent): void {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) ||
      target.closest("[data-shape-canvas-text-editor]")
    )
      return;
    if (
      target.selectionStart === null ||
      target.selectionEnd === null ||
      target.selectionStart === target.selectionEnd
    )
      return;
    const identity = shapeClipboard.getIdentity(),
      workbook = options.getWorkbook(),
      generation = workbookGeneration.value;
    void Promise.resolve().then(() => {
      if (
        identity &&
        !event.defaultPrevented &&
        options.getWorkbook() === workbook &&
        workbookGeneration.value === generation &&
        shapeClipboard.clear(identity)
      )
        shapeClipboardEpoch.value++;
    });
  }

  function onWorkspaceKeydown(event: KeyboardEvent): void {
    if (options.getActiveSheet().dashboard) {
      const target = event.target;
      if (
        !options.isEditingDashboard() &&
        !(
          target instanceof HTMLElement && target.closest("input,textarea,select,[contenteditable]")
        ) &&
        (event.ctrlKey || event.metaKey)
      ) {
        if (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") {
          event.preventDefault();
          if (event.key.toLowerCase() === "y" || event.shiftKey) options.redo();
          else options.undo();
        }
      }
      return;
    }
    const effectsFocusReturn = options.getPictureEffectsFocusReturn();
    const effectsTrigger = effectsFocusReturn();
    const fromEffectsTrigger =
      event.target instanceof Node && effectsTrigger?.contains(event.target);
    const activeBeforeHistory = document.activeElement;
    const historyContext = {
      blocked: gridInert.value || imageBusy.value || !!options.getActiveRangePicker(),
      editing:
        cellEditSession.state.active ||
        cellEditSession.state.composing ||
        !!options.getShapeTextEditSnapshot() ||
        !!options.getEquationSnapshot(),
      cropping: options.hasActivePictureCrop(),
      undo: options.undo,
      redo: options.redo,
    };
    if (
      event.ctrlKey &&
      event.altKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.defaultPrevented &&
      !event.repeat &&
      !event.isComposing &&
      !historyContext.editing &&
      !historyContext.blocked &&
      !historyContext.cropping &&
      !(
        event.target instanceof HTMLElement &&
        event.target.closest(
          "input,textarea,select,[contenteditable=true],[role=dialog],[role=menu]",
        )
      ) &&
      (event.code === "KeyX" || event.code === "KeyC")
    ) {
      event.preventDefault();
      options.insertScreenCapture("rectangle", false, event.code === "KeyC");
      return;
    }
    if (routeRibbonHistoryShortcut(event, historyContext)) {
      if (fromEffectsTrigger && effectsTrigger)
        restoreFocusAfterRemount(
          effectsTrigger,
          effectsFocusReturn,
          () => true,
          activeBeforeHistory,
        );
      return;
    }
    const chartHistory = options.getChartFormatContext();
    if (
      routeFormatPaneHistoryShortcut(event, {
        ...historyContext,
        pane: chartFormatPaneRef.value?.getHistoryElement(),
        current: () =>
          !!chartHistory &&
          chartHistory === options.getChartFormatContext() &&
          chartHistory.isCurrent() &&
          !chartHistory.disabled &&
          !options.isBusy() &&
          !options.hasChartModalOpen() &&
          chartFormatPaneRef.value?.canChangeTarget() === true,
      })
    )
      return;
    const paneHistory = options.getSelectedShapePaneFieldLease();
    const paneFocusOwner = paneHistory
      ? {
          workbook: options.getWorkbook(),
          sheet: options.getActiveSheet(),
          generation: workbookGeneration.value,
          paths: JSON.stringify(selectedShapeObjectPaths.value),
          owner: shapeFormatOwnerKey(paneHistory.pane.owner),
        }
      : undefined;
    const galleryPaintEditor =
      event.target instanceof HTMLInputElement &&
      event.target.getAttribute("data-panel-select-control") === "readonly-combobox"
        ? event.target.closest<HTMLElement>(".picture-paint-editor")
        : null;
    const galleryModeId =
      galleryPaintEditor && paneHistory?.element.contains(galleryPaintEditor)
        ? galleryPaintEditor.querySelector<HTMLInputElement>(
            'input[id^="picture-paint-mode-"][data-format-pane-history-control="readonly-combobox"]',
          )?.id
        : undefined;
    if (
      routeFormatPaneHistoryShortcut(event, {
        ...historyContext,
        pane: paneHistory?.element,
        current: () => paneHistory?.current() ?? false,
      })
    ) {
      const input = event.target;
      if (paneHistory && isFormatPaneReadonlyHistoryControl(input)) {
        const id = input.id;
        // Undo can legitimately refresh the Ribbon's independent session. Resolve
        // the same semantic pane owner again without reviving its retired lease.
        const currentFocusPane = () => {
          const next = options.getSelectedShapePaneFieldLease();
          return paneFocusOwner &&
            next &&
            options.getWorkbook() === paneFocusOwner.workbook &&
            options.getActiveSheet() === paneFocusOwner.sheet &&
            workbookGeneration.value === paneFocusOwner.generation &&
            JSON.stringify(selectedShapeObjectPaths.value) === paneFocusOwner.paths &&
            next.element === paneHistory.element &&
            shapeFormatOwnerKey(next.pane.owner) === paneFocusOwner.owner &&
            next.current()
            ? next
            : undefined;
        };
        restoreFocusAfterRemount(
          input,
          () => {
            const currentPane = currentFocusPane()?.element;
            if (!currentPane) return;
            const controls = [
              ...currentPane.querySelectorAll<HTMLInputElement>(
                "input[data-format-pane-history-control], input[data-panel-select-control]",
              ),
            ];
            const original = controls.find(
              (control) => control.id === id && isFormatPaneReadonlyHistoryControl(control),
            );
            if (original) return original;
            // A picture-only gallery can disappear or replace its keyed trigger.
            // Return only to the captured editor's own mode, never another editor.
            if (
              !galleryModeId ||
              !galleryPaintEditor?.isConnected ||
              !currentPane.contains(galleryPaintEditor) ||
              galleryPaintEditor.closest("[data-shape-format-pane]") !== currentPane
            )
              return;
            return controls.find(
              (control) =>
                control.id === galleryModeId &&
                galleryPaintEditor.contains(control) &&
                isFormatPaneReadonlyHistoryControl(control),
            );
          },
          () => !!currentFocusPane(),
          activeBeforeHistory,
        );
      }
      return;
    }
    const math = options.getEquationSnapshot();
    if (
      math &&
      event.target instanceof Element &&
      event.target.closest(`[data-equation-session="${math.sessionId}"]`)
    )
      return;
    if (
      math &&
      !event.defaultPrevented &&
      !event.isComposing &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      (event.key === "F2" || event.key === "Enter") &&
      event.target instanceof Element &&
      !event.target.closest("input, textarea, [contenteditable]")
    ) {
      const id =
        event.target.closest<HTMLElement>("[data-sheet-drawing-id]")?.dataset.sheetDrawingId;
      if (id)
        for (const root of options.getActiveSheet().drawings ?? []) {
          if (isShapeGroupDrawing(root)) {
            const visit = traverseShapeGroup(root).find(
              ({ node }) => node.id === id && isSheetGroupedEquationDrawing(node),
            );
            if (!visit) continue;
            // Commit may replace the outer root and invalidate the original Layer
            // view before this captured keystroke reaches its target handler.
            event.preventDefault();
            event.stopImmediatePropagation();
            options.editOwnedDrawing(root, visit.path);
            return;
          }
          if (root.id === id && root.kind === "equation") {
            event.preventDefault();
            event.stopImmediatePropagation();
            options.beginEquationEdit(root);
            return;
          }
        }
    }
    if (math && options.flushPendingEquationEdit() === false) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const currentShapeTextEdit = options.getShapeTextEditSnapshot();
    if (
      currentShapeTextEdit &&
      ownsShapeTextEditTarget(event.target, currentShapeTextEdit.sessionId)
    )
      return;
    if (options.getShapeTextEditSnapshot() && options.flushPendingShapeTextEdit() === false) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (options.isShortcutsSuppressedByDialog()) return;
    const picker = options.getActiveRangePicker();
    if (picker) {
      if (event.key === "Escape") picker.cancel();
      else if (event.key === "Enter") picker.confirm();
      else if (event.key === "Tab") return;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target instanceof Element ? event.target : undefined;
    const genericInput =
      target?.closest("input, textarea, [contenteditable]") &&
      !target?.closest("[data-cell-edit-surface]");
    if (
      !genericInput &&
      !event.defaultPrevented &&
      !event.repeat &&
      !event.isComposing &&
      !cellEditSession.state.active &&
      !cellEditSession.state.composing &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      !target?.closest('[role="dialog"],[role="menu"],[role="listbox"]')
    ) {
      const key = event.key.toLowerCase();
      const paths = options.getSelectedShapeObjects();
      if (
        ((key === "c" || key === "x") && paths.length) ||
        (key === "v" && shapeClipboard.hasPending())
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (key === "c") shapeClipboard.copy(paths);
        else if (key === "x") shapeClipboard.cut(paths);
        else shapeClipboard.paste();
        shapeClipboardEpoch.value++;
        return;
      }
      if (key === "c" || key === "x") {
        shapeClipboard.clear();
        shapeClipboardEpoch.value++;
      }
    }
    if (
      !gridInert.value &&
      !genericInput &&
      !event.repeat &&
      !event.isComposing &&
      !cellEditSession.state.composing &&
      !event.defaultPrevented
    ) {
      const symbol = resolveSymbolShortcut(symbolPreferences.preferences.value, event);
      if (symbol) {
        event.preventDefault();
        event.stopPropagation();
        const generation = workbookGeneration.value;
        const sheet = options.getActiveSheet();
        const address = { ...options.getActiveAddress() };
        const editGeneration = cellEditSession.state.generation;
        const revision = cellEditSession.state.revision;
        const documentRevision = workbookRevision.value;
        const selection = { ...cellEditSession.state.selection };
        void (symbol.fontFamily ? ensureCellFontResource(symbol.fontFamily) : Promise.resolve())
          .then(() => {
            const activeAddress = options.getActiveAddress();
            if (
              generation !== workbookGeneration.value ||
              sheet !== options.getActiveSheet() ||
              address.row !== activeAddress.row ||
              address.column !== activeAddress.column ||
              editGeneration !== cellEditSession.state.generation ||
              documentRevision !== workbookRevision.value ||
              revision !== cellEditSession.state.revision ||
              cellEditSession.state.selection.start !== selection.start ||
              cellEditSession.state.selection.end !== selection.end ||
              cellEditSession.state.selection.direction !== selection.direction ||
              gridInert.value
            )
              return;
            if (options.insertSymbol(symbol))
              symbolPreferences.update(
                withRecentSymbol(symbolPreferences.preferences.value, symbol),
              );
          })
          .catch(() => {
            void MessagePlugin.warning(t("workspace.cellEditUnavailable"));
          });
        return;
      }
    }
    if (
      event.key.toLowerCase() === "k" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      !event.isComposing &&
      !cellEditSession.state.composing
    ) {
      event.preventDefault();
      event.stopPropagation();
      options.openHyperlinkEdit();
      return;
    }
    if (
      event.key.toLowerCase() === "t" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      event.stopPropagation();
      options.requestCreateTable();
      return;
    }
    if (
      event.key === "1" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      !event.isComposing &&
      !cellEditSession.state.composing
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!options.hasCellFormatOpen()) options.openCellFormat();
      return;
    }
    if (
      event.key === "F2" &&
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.isComposing &&
      !cellEditSession.state.composing
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (cellEditSession.state.surface === "formula-bar") options.focusCellEditor();
      else {
        showFormulaBar.value = true;
        void nextTick(options.focusFormulaBar);
      }
      return;
    }
    if (event.key !== "Escape" || !formatPainterActive.value) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    options.cancelFormatPainter();
  }

  return {
    onWorkspaceShapeTextOutsideAction,
    onWorkspaceNativeTextCopy,
    onWorkspaceKeydown,
  };
}
