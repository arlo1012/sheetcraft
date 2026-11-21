import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  isShapeGroupDrawing,
  traverseShapeGroup,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import type {
  SheetFramedGraphicDrawing,
  SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  createWorkbookEvaluator,
  type CellAddress,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import {
  ChartClipboardSourceError,
  planChartClipboardSourceForTarget,
} from "../../modules/charts/chart-clipboard-source";
import {
  ShapeClipboardError,
  type ShapeClipboardFailure,
} from "../../modules/sheet-drawings/shape-clipboard-planning";
import { preflightShapeConnectorPaint } from "../../modules/sheet-drawings/shape-connector-paint-preflight";
import type { ShapeGalleryChoice } from "../../modules/sheet-drawings/shape-gallery";
import type { useDrawingActions } from "../../modules/sheet-drawings/useDrawingActions";
import { useShapeClipboard } from "../../modules/sheet-drawings/useShapeClipboard";
import type { useShapeCreation } from "../../modules/sheet-drawings/useShapeCreation";
import { useShapeDrawingTransfer } from "../../modules/sheet-drawings/useShapeDrawingTransfer";
import { useWordArtActions } from "../../modules/sheet-drawings/useWordArtActions";
import { ensureCellFontResource } from "../../shared/cell-text/font-resources";
import type { MessageKey } from "../../shared/i18n";

type WorkspaceShapeClipboardOptions = {
  getWorkbook: () => Workbook;
  getActiveSheet: () => Sheet;
  getActiveAddress: () => CellAddress;
  workbookGeneration: Ref<number>;
  workbookRevision: Ref<number>;
  getDocumentRevision: () => number;
  locale: Ref<string>;
  getShapeMetrics: (sheet: Sheet) => PictureSheetMetrics | undefined;
  getSelectedShapeObjects: () => readonly ShapeGroupPath[];
  getShapeObjectSelectionRevision: () => number | undefined;
  selectShapeObjects: (paths: readonly ShapeGroupPath[]) => boolean;
  isBusy: () => boolean;
  isWordArtBusy: () => boolean;
  isShapeTextEditing: () => boolean;
  flushPendingEdit: () => boolean;
  executeCommand: (command: WorkbookCommand) => boolean;
  prepareDrawing: Parameters<typeof useShapeDrawingTransfer>[0]["prepareDrawing"];
  getShapePaintAssetSize: (id: string) => { width: number; height: number } | undefined;
  drawingActions: ReturnType<typeof useDrawingActions>;
  shapeCreation: ReturnType<typeof useShapeCreation>;
  startShapeTextEdit: (request: { root: SheetFramedGraphicDrawing; selection: "all" }) => void;
  t: (key: MessageKey) => string;
};

/** Owns shape cross-sheet transfer, shape clipboard orchestration, WordArt insertion, and drawing insert handlers. */
export function useWorkspaceShapeClipboard(options: WorkspaceShapeClipboardOptions) {
  const { workbookGeneration, workbookRevision, locale, drawingActions, shapeCreation, t } =
    options;

  const shapeDrawingTransfer = useShapeDrawingTransfer({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    isBusy: () => options.isBusy() || options.isShapeTextEditing(),
    execute: options.executeCommand,
    prepareDrawing: options.prepareDrawing,
    preflightConnectedCollection: (pass) => {
      preflightShapeConnectorPaint(pass, {
        theme: options.getWorkbook().theme,
        getAssetSize: options.getShapePaintAssetSize,
      });
      return true;
    },
  });

  const shapeClipboardEpoch = ref(0);
  const shapeClipboard = useShapeClipboard({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    getDocumentRevision: options.getDocumentRevision,
    getMetrics: () => options.getShapeMetrics(options.getActiveSheet()),
    getSelectedPaths: options.getSelectedShapeObjects,
    getTargetAddress: options.getActiveAddress,
    replaceCollection: drawingActions.replaceCollectionPreservingGeometry,
    replaceCollections: shapeDrawingTransfer.replaceCollections,
    prepareRootsForTarget: (roots, sourceSheet, targetSheet) => {
      if (!roots.some((drawing) => drawing.kind === "chart")) return roots;
      const workbook = options.getWorkbook();
      try {
        const evaluator = createWorkbookEvaluator(workbook, sourceSheet.id);
        return roots.map((drawing) =>
          drawing.kind === "chart"
            ? planChartClipboardSourceForTarget({
                drawing,
                sourceSheet,
                targetSheet,
                evaluator,
                resolveSheet: (id) => workbook.sheets.get(id),
              })
            : drawing,
        );
      } catch (error) {
        throw new ShapeClipboardError(
          error instanceof ChartClipboardSourceError &&
            (error.reason === "unsupported-legacy-source" ||
              error.reason === "unsupported-pivot-source" ||
              error.reason === "dormant-series-id-collision" ||
              error.reason === "non-equivalent-source")
            ? "chart-source-unsupported"
            : "chart-source-invalid",
        );
      }
    },
    flush: options.flushPendingEdit,
    isBusy: () => options.isBusy() || options.isShapeTextEditing(),
    onSelect: (paths) => {
      const workbook = options.getWorkbook(),
        sheet = options.getActiveSheet(),
        generation = workbookGeneration.value,
        revision = workbookRevision.value,
        address = { ...options.getActiveAddress() },
        selectionRevision = options.getShapeObjectSelectionRevision(),
        previous = options.getSelectedShapeObjects(),
        selection = paths.map((path) => [...path]),
        roots = selection.map((path) => sheet.drawings?.find((root) => root.id === path[0]));
      shapeClipboardEpoch.value++;
      // Collection commits update the grid's drawings and metrics on the next Vue tick.
      void nextTick(() => {
        const activeAddress = options.getActiveAddress();
        if (
          options.getWorkbook() !== workbook ||
          options.getActiveSheet() !== sheet ||
          workbookGeneration.value !== generation ||
          workbookRevision.value !== revision ||
          activeAddress.row !== address.row ||
          activeAddress.column !== address.column ||
          options.isShapeTextEditing() ||
          options.getShapeObjectSelectionRevision() !== selectionRevision ||
          roots.some((root) => !root || !sheet.drawings?.includes(root))
        )
          return;
        const current = options.getSelectedShapeObjects();
        if (JSON.stringify(current) !== JSON.stringify(previous)) {
          // A cut can remove the old selection while the grid refreshes. Any surviving
          // or explicitly selected replacement must retain the user's newer selection.
          const surviving = new Set(
            (sheet.drawings ?? []).flatMap((root) =>
              isShapeGroupDrawing(root)
                ? traverseShapeGroup(root).map(({ path }) => JSON.stringify(path))
                : [JSON.stringify([root.id])],
            ),
          );
          if (current.length || previous.some((path) => surviving.has(JSON.stringify(path))))
            return;
        }
        options.selectShapeObjects(selection);
      });
    },
    onCopy: () => {
      shapeClipboardEpoch.value++;
    },
    onFeedback: (reason: ShapeClipboardFailure) => {
      const owningGroup =
        reason === "unsupported-group-scene" || reason === "unsupported-owner-effects";
      void MessagePlugin.warning(
        locale.value === "zh-CN"
          ? owningGroup
            ? "此成员继承组的三维场景或组合效果。请复制所属组以保留完整外观。"
            : reason === "chart-source-unsupported"
              ? "此图表的旧范围或透视来源暂不能跨表移动而保持数据含义。请在当前工作表粘贴，或先在选择数据中设置明确的系列来源；原图和剪贴板已保留。"
              : reason === "chart-source-invalid"
                ? "图表来源或所在工作表已变化，未执行粘贴。请重新复制图表；原图和剪贴板已保留。"
                : reason === "cross-sheet-cut"
                  ? "此对象暂不能跨工作表剪切。请使用复制；原对象已保留。"
                  : "无法复制、剪切或粘贴此形状。请检查对象权限及当前选区，原对象和剪贴板已保留。"
          : owningGroup
            ? "Copy the owning group to retain its shared 3D scene and composited effects."
            : reason === "chart-source-unsupported"
              ? "This legacy or Pivot chart cannot move across sheets while preserving its data meaning. Paste on its original sheet or configure explicit series in Select Data first; the original and clipboard are kept."
              : reason === "chart-source-invalid"
                ? "The chart source or owning sheet changed. Copy the chart again; the original and clipboard are kept."
                : reason === "cross-sheet-cut"
                  ? "This object cannot be cut across sheets yet. Use Copy; the original is kept."
                  : "The shape clipboard action was not applied. Check permissions and selection; the original and clipboard are kept.",
      );
    },
  });
  const { confirmation: shapeClipboardTransferConfirmation } = shapeClipboard;
  const canPasteShapeObjects = computed(() => {
    void shapeClipboardEpoch.value;
    return shapeClipboard.hasPending();
  });
  const shapeClipboardHandlers = computed(() => {
    const workbook = options.getWorkbook(),
      sheet = options.getActiveSheet(),
      generation = workbookGeneration.value,
      revision = workbookRevision.value,
      metrics = options.getShapeMetrics(sheet),
      address = { ...options.getActiveAddress() };
    const valid = () => {
      const activeAddress = options.getActiveAddress();
      return (
        options.getWorkbook() === workbook &&
        options.getActiveSheet() === sheet &&
        generation === workbookGeneration.value &&
        revision === workbookRevision.value &&
        metrics === options.getShapeMetrics(sheet) &&
        address.row === activeAddress.row &&
        address.column === activeAddress.column
      );
    };
    return {
      copy: (paths: readonly ShapeGroupPath[]) => valid() && shapeClipboard.copy(paths),
      cut: (paths: readonly ShapeGroupPath[]) => valid() && shapeClipboard.cut(paths),
      paste: () => {
        if (!valid()) return false;
        const accepted = shapeClipboard.paste(address);
        shapeClipboardEpoch.value++;
        return accepted;
      },
    };
  });

  function clearCompetingShapeClipboard(): void {
    if (shapeClipboard.clear()) shapeClipboardEpoch.value++;
  }

  function captureCompetingShapeClipboardCopy(): () => void {
    const identity = shapeClipboard.getIdentity(),
      workbook = options.getWorkbook(),
      generation = workbookGeneration.value;
    return () => {
      if (
        identity &&
        options.getWorkbook() === workbook &&
        workbookGeneration.value === generation &&
        shapeClipboard.clear(identity)
      )
        shapeClipboardEpoch.value++;
    };
  }
  watch(workbookGeneration, clearCompetingShapeClipboard);

  const wordArtActions = useWordArtActions({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    getMetrics: () => options.getShapeMetrics(options.getActiveSheet()),
    getAddress: options.getActiveAddress,
    isBusy: options.isWordArtBusy,
    flush: options.flushPendingEdit,
    replaceCollection: drawingActions.replaceCollection,
    name: () => t("drawing.wordArt"),
    placeholder: () => (locale.value === "zh-CN" ? "请输入文字" : "Your text here"),
    getFontFamily: () => options.getWorkbook().theme.bodyFont,
    prepareFont: (drawing) => ensureCellFontResource(drawing.shapeText!.fontFamily!),
    onInserted: (root) => {
      const workbook = options.getWorkbook(),
        sheet = options.getActiveSheet(),
        generation = workbookGeneration.value,
        revision = workbookRevision.value;
      // The insertion command invalidates grid metric objects. Start the editor
      // only after its stored root and current worksheet metrics reach the grid.
      void nextTick(() => {
        if (
          options.getWorkbook() !== workbook ||
          options.getActiveSheet() !== sheet ||
          workbookGeneration.value !== generation ||
          workbookRevision.value !== revision ||
          !sheet.drawings?.includes(root) ||
          options.isShapeTextEditing() ||
          !options.selectShapeObjects([[root.id]])
        )
          return;
        options.startShapeTextEdit({ root, selection: "all" });
      });
    },
  });
  const wordArtInsertHandler = computed(() => {
    const activeAddress = options.getActiveAddress();
    void workbookGeneration.value;
    void options.getActiveSheet();
    void workbookRevision.value;
    void activeAddress.row;
    void activeAddress.column;
    return wordArtActions.createInsertHandler();
  });
  onBeforeUnmount(wordArtActions.cancelPending);

  const shapeInsertHandler = computed(() => {
    const owner = shapeCreation.captureOwner();
    void workbookRevision.value;
    return (choice: ShapeGalleryChoice, continuous: boolean) =>
      shapeCreation.start(choice, continuous, owner);
  });

  const drawingTextBoxHandler = computed(() => {
    const target = drawingActions.dialog.value;
    return (direction: "horizontal" | "vertical") =>
      drawingActions.requestTextBox(direction, target);
  });
  const drawingConfirmHandler = computed(() => {
    const target = drawingActions.dialog.value;
    return (drawing: SheetGraphicDrawing) => drawingActions.confirm(drawing, target);
  });

  return {
    shapeClipboard,
    shapeClipboardEpoch,
    shapeClipboardTransferConfirmation,
    canPasteShapeObjects,
    shapeClipboardHandlers,
    clearCompetingShapeClipboard,
    captureCompetingShapeClipboardCopy,
    wordArtInsertHandler,
    shapeInsertHandler,
    drawingTextBoxHandler,
    drawingConfirmHandler,
  };
}
