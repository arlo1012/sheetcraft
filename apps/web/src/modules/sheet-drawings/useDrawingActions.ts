import { computed } from "vue";
import { createGraphicDrawing } from "./drawing-defaults";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  isFramedShapeDrawing,
  type SheetFramedGraphicDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
  type SheetGraphicKind,
} from "@sheetcraft/core/sheet-drawings";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { frameShapeView } from "./shape-view-layout";
import {
  resolveShapeDrawing,
  updateResolvedShapeDrawing,
  type ResolvedShapeDrawing,
} from "./resolved-shape-drawing";
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
  getMetrics?: () => PictureSheetMetrics | undefined;
  prepareDrawing?: (drawing: SheetDrawing, owner?: SheetDrawing) => SheetDrawing;
}) {
  const idFactory = createBrowserIdFactory();
  const targets = useDrawingDialogTarget<SheetGraphicDrawing, []>({
    ...options,
    canEditExisting: canEditShapeObject,
  });
  const { dialog, editing, close } = targets;
  const dialogProjections = new WeakMap<object, ResolvedShapeDrawing>();
  const normalizeDialogDrawing = computed(() => {
    const target = dialog.value,
      resolved = target && dialogProjections.get(target);
    if (!resolved) return undefined;
    return (view: SheetGraphicDrawing): SheetGraphicDrawing => {
      if (
        dialog.value !== target ||
        options.getMetrics?.() !== resolved.metrics ||
        options.getSheet().drawings?.find((item) => item.id === resolved.source.id) !==
          resolved.source
      )
        throw new Error("The shape editor owner is stale.");
      return resolveShapeDrawing(
        updateResolvedShapeDrawing(resolved, view, resolved.metrics),
        resolved.metrics,
      ).view as SheetGraphicDrawing;
    };
  });
  const allowed = (drawing?: SheetDrawing) =>
    !options.isBusy() &&
    (drawing
      ? canEditShapeObject(options.getSheet(), drawing)
      : canUseSheetPermission(options.getSheet(), "editObjects"));
  const canEditDialog = computed(() => !!dialog.value && allowed(dialog.value.existing));
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
  function edit(drawing: SheetGraphicDrawing | SheetFramedGraphicDrawing) {
    // Flushing an active cell can change worksheet geometry. Capture the view
    // only after target preparation has verified the surviving source owner.
    const target = targets.prepare(drawing);
    if (!target) return;
    const metrics = options.getMetrics?.();
    if (isFramedShapeDrawing(drawing) && !metrics) return;
    const resolved =
      metrics && isFramedShapeDrawing(drawing) ? resolveShapeDrawing(drawing, metrics) : undefined;
    const view = resolved
      ? (resolved.view as SheetGraphicDrawing)
      : (drawing as SheetGraphicDrawing);
    if (
      resolved &&
      (options.getMetrics?.() !== metrics ||
        options.getSheet().drawings?.find((item) => item.id === drawing.id) !== drawing)
    )
      return;
    targets.open(target, view, (current, next) => confirm(next, current, resolved));
    if (resolved && dialog.value) dialogProjections.set(dialog.value, resolved);
  }
  function update(drawing: SheetDrawing, expected?: SheetDrawing): boolean {
    if (!allowed(drawing)) return false;
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
        !allowed(owner) ||
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
  function confirm(
    drawing: SheetGraphicDrawing,
    target = dialog.value,
    resolved?: ResolvedShapeDrawing,
  ) {
    resolved ??= target && dialogProjections.get(target);
    let accepted = false;
    targets.run(target, (currentTarget) => {
      if (drawing.id !== currentTarget.initial.id || drawing.kind !== currentTarget.initial.kind)
        return;
      const current = currentTarget.sheet.drawings ?? [];
      const identities = [...current],
        revision = options.getRevision?.();
      let next: SheetDrawing;
      try {
        if (currentTarget.existing && isFramedShapeDrawing(currentTarget.existing)) {
          const metrics = options.getMetrics?.();
          if (
            !resolved ||
            resolved.source !== currentTarget.existing ||
            metrics !== resolved.metrics
          )
            return;
          const candidate = updateResolvedShapeDrawing(resolved, drawing, metrics);
          next = options.prepareDrawing?.(candidate, currentTarget.existing) ?? candidate;
        } else {
          let candidate: SheetDrawing = drawing;
          if (
            !currentTarget.existing &&
            (drawing.kind === "shape" || drawing.kind === "textBox") &&
            options.getMetrics
          ) {
            const metrics = options.getMetrics();
            if (!metrics) return;
            candidate = frameShapeView(drawing, metrics);
            if (options.getMetrics() !== metrics) return;
          }
          next = options.prepareDrawing?.(candidate, currentTarget.existing) ?? candidate;
        }
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
    const sheet = options.getSheet();
    const owner = sheet.drawings?.find((item) => item.id === id);
    if (!owner || !allowed(owner)) return;
    options.execute(
      createSetSheetDrawingsCommand(
        sheet.id,
        (sheet.drawings ?? []).filter((item) => item.id !== id),
      ),
    );
  }
  return {
    dialog,
    editing,
    canEditDialog,
    normalizeDialogDrawing,
    insert,
    edit,
    update,
    confirm,
    remove,
    close,
    requestTextBox,
  };
}
