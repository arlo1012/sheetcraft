import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import type {
  SheetDrawing,
  SheetGraphicDrawing,
  SheetGraphicKind,
} from "@sheetcraft/core/sheet-drawings";
import { useDrawingDialogTarget } from "../../shared/drawing-dialog/useDrawingDialogTarget";
import type { Workbook, Sheet, CellAddress } from "@sheetcraft/core/workbook";
export function useDrawingActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration?: () => number;
  getRevision?: () => number;
  getAddress: () => CellAddress;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  isBusy: () => boolean;
  name: (kind: SheetGraphicKind) => string;
}) {
  const idFactory = createBrowserIdFactory();
  const targets = useDrawingDialogTarget<SheetGraphicDrawing, []>(options);
  const { dialog, editing, close } = targets;
  const allowed = () =>
    !options.isBusy() && canUseSheetPermission(options.getSheet(), "editObjects");
  function insert(kind: SheetGraphicKind) {
    const target = targets.prepare();
    if (!target) return;
    const initial: SheetGraphicDrawing = {
      id: idFactory("drawing"),
      kind,
      name: options.name(kind),
      anchor: { ...options.getAddress() },
      offsetX: 8,
      offsetY: 8,
      width: kind === "icon" ? 80 : 240,
      height: kind === "icon" ? 80 : 120,
      text:
        kind === "equation"
          ? "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"
          : kind === "textBox" || kind === "wordArt"
            ? options.name(kind)
            : "",
      shape: kind === "icon" ? "star" : "rectangle",
      fill: kind === "shape" || kind === "icon" ? "#dbeafe" : "transparent",
      stroke: "#2563eb",
      strokeWidth: kind === "textBox" ? 0 : 1,
      color: "#1e3a8a",
      fontSize: kind === "wordArt" ? 36 : 20,
      bold: kind === "wordArt",
      italic: false,
      rotation: 0,
    };
    targets.open(target, initial, (current, next) => confirm(next, current));
  }
  function edit(drawing: SheetGraphicDrawing) {
    const target = targets.prepare(drawing);
    if (target) targets.open(target, drawing, (current, next) => confirm(next, current));
  }
  function update(drawing: SheetDrawing) {
    if (!allowed()) return;
    const sheet = options.getSheet();
    if (!sheet.drawings?.some((item) => item.id === drawing.id)) return;
    options.execute(
      createSetSheetDrawingsCommand(
        sheet.id,
        sheet.drawings.map((item) => (item.id === drawing.id ? drawing : item)),
      ),
    );
  }
  function confirm(drawing: SheetGraphicDrawing, target = dialog.value) {
    targets.run(target, (currentTarget) => {
      if (drawing.id !== currentTarget.initial.id || drawing.kind !== currentTarget.initial.kind)
        return;
      const current = currentTarget.sheet.drawings ?? [];
      targets.commit(
        currentTarget,
        createSetSheetDrawingsCommand(
          currentTarget.sheet.id,
          currentTarget.existing
            ? current.map((item) => (item === currentTarget.existing ? drawing : item))
            : [...current, drawing],
        ),
      );
    });
  }
  function remove(id: string) {
    if (!allowed()) return;
    const sheet = options.getSheet();
    options.execute(
      createSetSheetDrawingsCommand(
        sheet.id,
        (sheet.drawings ?? []).filter((item) => item.id !== id),
      ),
    );
  }
  return { dialog, editing, insert, edit, update, confirm, remove, close };
}
