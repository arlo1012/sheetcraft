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
  prepareDrawing?: (drawing: SheetDrawing, owner?: SheetDrawing) => SheetDrawing;
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
    const revision = options.getRevision?.(),
      workbook = options.getWorkbook(),
      generation = options.getGeneration?.();
    let command: ReturnType<typeof createSetSheetDrawingsCommand>;
    try {
      const next = options.prepareDrawing?.(drawing, owner) ?? drawing;
      if (next.id !== owner.id || next.kind !== owner.kind) return false;
      if (
        !allowed() ||
        options.getSheet() !== sheet ||
        options.getWorkbook() !== workbook ||
        options.getGeneration?.() !== generation ||
        options.getRevision?.() !== revision ||
        sheet.drawings?.find((item) => item.id === owner.id) !== owner
      )
        return false;
      command = createSetSheetDrawingsCommand(
        sheet.id,
        sheet.drawings!.map((item) => (item === owner ? next : item)),
      );
    } catch {
      return false;
    }
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
    let accepted = false;
    targets.run(target, (currentTarget) => {
      if (drawing.id !== currentTarget.initial.id || drawing.kind !== currentTarget.initial.kind)
        return;
      const current = currentTarget.sheet.drawings ?? [];
      const identities = [...current],
        revision = options.getRevision?.();
      let next: SheetDrawing;
      try {
        next = options.prepareDrawing?.(drawing, currentTarget.existing) ?? drawing;
      } catch {
        return;
      }
      if (next.id !== drawing.id || next.kind !== drawing.kind) return;
      const latest = currentTarget.sheet.drawings ?? [];
      if (
        options.getRevision?.() !== revision ||
        latest.length !== identities.length ||
        latest.some((item, index) => item !== identities[index])
      )
        return;
      accepted = targets.commit(
        currentTarget,
        createSetSheetDrawingsCommand(
          currentTarget.sheet.id,
          currentTarget.existing
            ? current.map((item) => (item === currentTarget.existing ? next : item))
            : [...current, next],
        ),
      );
    });
    return accepted;
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
