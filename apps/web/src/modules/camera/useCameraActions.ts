import { ref } from "vue";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { normalizeSheetDrawing, type SheetCameraDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createWorkbookEvaluator,
  type Workbook,
  type Sheet,
  type CellRange,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import { useDrawingDialogTarget } from "../../shared/drawing-dialog/useDrawingDialogTarget";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { resolveRangeReference } from "../../shared/range-reference/formatRangeReference";
import { createCameraRangeLayout, fitCameraSize } from "./camera-range-layout";
export function useCameraActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration?: () => number;
  getRevision?: () => number;
  getRange: () => CellRange;
  getEvaluator?: () => SheetEvaluator;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  onInserted?: (drawingId: string) => void;
  name: () => string;
}) {
  const error = ref(false);
  const idFactory = createBrowserIdFactory();
  const targets = useDrawingDialogTarget<SheetCameraDrawing, [source: string]>({
    ...options,
    onReset: () => {
      error.value = false;
    },
  });
  const { dialog, editing, close } = targets;
  function open(drawing?: SheetCameraDrawing) {
    const target = targets.prepare(drawing);
    if (!target) return;
    const sheet = target.sheet;
    const range = options.getRange();
    const sourceLayout = createCameraRangeLayout(sheet, range, options.getEvaluator?.());
    const existingAtAnchor = drawing
      ? 0
      : (sheet.drawings ?? []).filter(
          (item) =>
            item.kind === "camera" &&
            item.anchor.row === range.start.row &&
            item.anchor.column === range.start.column,
        ).length;
    const initial = drawing ?? {
      id: idFactory("camera"),
      kind: "camera",
      name: options.name(),
      anchor: { ...range.start },
      offsetX: 16 + existingAtAnchor * 24,
      offsetY: 16 + existingAtAnchor * 24,
      ...fitCameraSize(sourceLayout.width, sourceLayout.height),
      text: "",
      shape: "rectangle",
      fill: "#ffffff",
      stroke: "#d1d5db",
      strokeWidth: 1,
      color: "#111827",
      fontSize: 14,
      bold: false,
      italic: false,
      rotation: 0,
      camera: { sheetId: sheet.id, range, gridLines: true },
    };
    targets.open(target, initial, (current, next, source) => confirm(next, source, current));
  }
  function confirm(drawing: SheetCameraDrawing, source: string, target = dialog.value) {
    targets.run(target, (currentTarget) => {
      if (drawing.id !== currentTarget.initial.id || drawing.kind !== "camera") return;
      const reference = resolveRangeReference(
        currentTarget.workbook,
        source,
        currentTarget.sheet.id,
      );
      const sourceSheet = reference && currentTarget.workbook.sheets.get(reference.sheetId);
      if (!reference || !sourceSheet) {
        error.value = true;
        return;
      }
      try {
        const evaluator = options.getEvaluator?.();
        const sourceEvaluator =
          sourceSheet === currentTarget.sheet && evaluator
            ? evaluator
            : (evaluator?.forSheet?.(sourceSheet.id) ??
              createWorkbookEvaluator(currentTarget.workbook, sourceSheet.id));
        const layout = createCameraRangeLayout(sourceSheet, reference.range, sourceEvaluator);
        const next = normalizeSheetDrawing({
          ...drawing,
          ...(!currentTarget.existing ? fitCameraSize(layout.width, layout.height) : {}),
          camera: { ...drawing.camera, sheetId: sourceSheet.id, range: reference.range },
        });
        const current = currentTarget.sheet.drawings ?? [];
        const committed = targets.commit(
          currentTarget,
          createSetSheetDrawingsCommand(
            currentTarget.sheet.id,
            currentTarget.existing
              ? current.map((item) => (item === currentTarget.existing ? next : item))
              : [...current, next],
          ),
        );
        if (committed) {
          if (!currentTarget.existing) options.onInserted?.(next.id);
        } else if (dialog.value === currentTarget) {
          error.value = true;
        }
      } catch {
        if (dialog.value === currentTarget) error.value = true;
      }
    });
  }
  return { dialog, editing, error, open, confirm, close };
}
