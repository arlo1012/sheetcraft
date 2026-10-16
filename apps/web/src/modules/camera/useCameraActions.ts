import { ref } from "vue";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { normalizeSheetDrawing, type SheetCameraDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  getDefaultRowHeight,
  getDefaultColumnWidth,
  type Workbook,
  type Sheet,
  type CellRange,
} from "@sheetcraft/core/workbook";
import { useDrawingDialogTarget } from "../../shared/drawing-dialog/useDrawingDialogTarget";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { resolveRangeReference } from "../../shared/range-reference/formatRangeReference";
export function useCameraActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration?: () => number;
  getRevision?: () => number;
  getRange: () => CellRange;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
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
    const initial = drawing ?? {
      id: idFactory("camera"),
      kind: "camera",
      name: options.name(),
      anchor: { ...range.start },
      offsetX: 16,
      offsetY: 16,
      width: Math.min(
        800,
        Math.max(80, (range.end.column - range.start.column + 1) * getDefaultColumnWidth(sheet)),
      ),
      height: Math.min(
        600,
        Math.max(40, (range.end.row - range.start.row + 1) * getDefaultRowHeight(sheet)),
      ),
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
      camera: { range, gridLines: true },
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
      if (!reference || reference.sheetId !== currentTarget.sheet.id) {
        error.value = true;
        return;
      }
      try {
        const next = normalizeSheetDrawing({
          ...drawing,
          camera: { ...drawing.camera, range: reference.range },
        });
        const current = currentTarget.sheet.drawings ?? [];
        if (
          !targets.commit(
            currentTarget,
            createSetSheetDrawingsCommand(
              currentTarget.sheet.id,
              currentTarget.existing
                ? current.map((item) => (item === currentTarget.existing ? next : item))
                : [...current, next],
            ),
          ) &&
          dialog.value === currentTarget
        )
          error.value = true;
      } catch {
        if (dialog.value === currentTarget) error.value = true;
      }
    });
  }
  return { dialog, editing, error, open, confirm, close };
}
