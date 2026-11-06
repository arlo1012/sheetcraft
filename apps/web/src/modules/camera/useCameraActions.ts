import { ref } from "vue";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { normalizeSheetDrawing, type SheetCameraDrawing } from "@sheetcraft/core/sheet-drawings";
import {
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
    const initial = drawing ?? {
      id: idFactory("camera"),
      kind: "camera",
      name: options.name(),
      anchor: { ...range.start },
      offsetX: 16,
      offsetY: 16,
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
        const layout = createCameraRangeLayout(
          currentTarget.sheet,
          reference.range,
          options.getEvaluator?.(),
        );
        const next = normalizeSheetDrawing({
          ...drawing,
          ...(!currentTarget.existing ? fitCameraSize(layout.width, layout.height) : {}),
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
