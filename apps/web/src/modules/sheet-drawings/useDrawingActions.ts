import { createGraphicDrawing } from "./drawing-defaults";
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
  function insert(kind: SheetGraphicKind, direction?: "horizontal" | "vertical") {
    const target = targets.prepare();
    if (!target) return;
    const initial = createGraphicDrawing(
      idFactory("drawing"),
      kind,
      options.name(kind),
      options.getAddress(),
      direction,
    );
    targets.open(target, initial, (current, next) => confirm(next, current));
  }
  function requestTextBox(direction: "horizontal" | "vertical", target = dialog.value): boolean {
    let accepted = false;
    targets.run(target, () => {
      accepted = true;
    });
    if (!accepted) return false;
    const before = dialog.value;
    insert("textBox", direction);
    return dialog.value !== before && dialog.value?.initial.kind === "textBox";
  }
  function edit(drawing: SheetGraphicDrawing) {
    const target = targets.prepare(drawing);
    if (target) targets.open(target, drawing, (current, next) => confirm(next, current));
  }
  function update(drawing: SheetDrawing, expected?: SheetDrawing): boolean {
    if (!allowed()) return false;
    const sheet = options.getSheet();
    const owner = sheet.drawings?.find((item) => item.id === drawing.id);
    if (!owner || (expected && owner !== expected)) return false;
    const command = createSetSheetDrawingsCommand(
      sheet.id,
      sheet.drawings!.map((item) => (item === owner ? drawing : item)),
    );
    const applied = () =>
      options.getSheet() === sheet &&
      JSON.stringify(sheet.drawings ?? []) === JSON.stringify(command.drawings);
    if (applied()) return true;
    try {
      return options.execute(command) === true || applied();
    } catch {
      return applied();
    }
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
  return { dialog, editing, insert, edit, update, confirm, remove, close, requestTextBox };
}
