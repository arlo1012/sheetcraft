import { ref, shallowRef } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { normalizeSheetDrawing, type SheetCameraDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  DEFAULT_ROW_HEIGHT,
  getDefaultColumnWidth,
  type Workbook,
  type Sheet,
  type CellRange,
} from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { resolveRangeReference } from "../../shared/range-reference/formatRangeReference";
export function useCameraActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getRange: () => CellRange;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  name: () => string;
}) {
  const editing = shallowRef<SheetCameraDrawing>();
  const error = ref(false);
  const idFactory = createBrowserIdFactory();
  let target: { workbook: Workbook; sheetId: string; existing: boolean } | undefined;
  const allowed = () =>
    !options.isBusy() && canUseSheetPermission(options.getSheet(), "editObjects");
  function open(drawing?: SheetCameraDrawing) {
    if (!allowed() || !options.flush()) return;
    const sheet = options.getSheet();
    const range = options.getRange();
    target = { workbook: options.getWorkbook(), sheetId: sheet.id, existing: !!drawing };
    error.value = false;
    editing.value = drawing ?? {
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
        Math.max(40, (range.end.row - range.start.row + 1) * DEFAULT_ROW_HEIGHT),
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
  }
  function confirm(drawing: SheetCameraDrawing, source: string) {
    if (
      !allowed() ||
      !target ||
      target.workbook !== options.getWorkbook() ||
      target.sheetId !== options.getSheet().id ||
      editing.value?.id !== drawing.id
    )
      return;
    const reference = resolveRangeReference(target.workbook, source, target.sheetId);
    if (!reference || reference.sheetId !== target.sheetId) {
      error.value = true;
      return;
    }
    try {
      const next = normalizeSheetDrawing({
        ...drawing,
        camera: { ...drawing.camera, range: reference.range },
      });
      const current = options.getSheet().drawings ?? [];
      if (target.existing && !current.some((item) => item.id === next.id)) {
        close();
        return;
      }
      options.execute(
        createSetSheetDrawingsCommand(
          target.sheetId,
          target.existing
            ? current.map((item) => (item.id === next.id ? next : item))
            : [...current, next],
        ),
      );
      close();
    } catch {
      error.value = true;
    }
  }
  function close() {
    editing.value = undefined;
    target = undefined;
    error.value = false;
  }
  return { editing, error, open, confirm, close };
}
