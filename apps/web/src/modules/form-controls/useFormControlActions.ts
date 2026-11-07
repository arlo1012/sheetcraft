import { ref } from "vue";
import { canEditCell } from "@sheetcraft/core";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import {
  createSetSheetDrawingsCommand,
  createSetCellContentCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import { normalizeSheetDrawing, type SheetControlDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  getFormControlItems,
  getFormControlValue,
  normalizeLocalControlValue,
  resolveFormControlValue,
  type FormControlType,
} from "@sheetcraft/core/form-controls";
import type { Workbook, Sheet, CellAddress, SheetEvaluator } from "@sheetcraft/core/workbook";
import { useDrawingDialogTarget } from "../../shared/drawing-dialog/useDrawingDialogTarget";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { resolveRangeReference } from "../../shared/range-reference/formatRangeReference";
export function useFormControlActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration?: () => number;
  getRevision?: () => number;
  getAddress: () => CellAddress;
  getEvaluator: () => SheetEvaluator;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  name: (type: FormControlType) => string;
}) {
  const error = ref(false);
  const idFactory = createBrowserIdFactory();
  const targets = useDrawingDialogTarget<SheetControlDrawing, [linked: string, source: string]>({
    ...options,
    onReset: () => {
      error.value = false;
    },
  });
  const { dialog, editing, close } = targets;
  function open(drawing?: SheetControlDrawing, type: FormControlType = "checkbox") {
    const target = targets.prepare(drawing);
    if (!target) return;
    const initial = drawing ?? {
      id: idFactory("control"),
      kind: "control",
      name: options.name(type),
      anchor: { ...options.getAddress() },
      offsetX: 8,
      offsetY: 8,
      width: 220,
      height: type === "list" || type === "group" ? 160 : 64,
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
      control: {
        type,
        label: options.name(type),
        linkedCell: null,
        source: null,
        items: [],
        min: 0,
        max: 100,
        step: 1,
        optionValue: 1,
        resetValue: 0,
      },
    };
    targets.open(target, initial, (current, next, linked, source) =>
      confirm(next, linked, source, current),
    );
  }
  function confirm(
    drawing: SheetControlDrawing,
    linkedReference: string,
    sourceReference: string,
    target = dialog.value,
  ) {
    targets.run(target, (currentTarget) => {
      const sheet = currentTarget.sheet;
      if (drawing.id !== currentTarget.initial.id || drawing.kind !== "control") return;
      const passive = drawing.control.type === "label" || drawing.control.type === "group";
      const hasItems = drawing.control.type === "combo" || drawing.control.type === "list";
      const linked =
        !passive && linkedReference.trim()
          ? resolveRangeReference(currentTarget.workbook, linkedReference, sheet.id)
          : undefined;
      const source =
        hasItems && sourceReference.trim()
          ? resolveRangeReference(currentTarget.workbook, sourceReference, sheet.id)
          : undefined;
      if (
        (!passive && linkedReference.trim() && !linked) ||
        (linked &&
          (linked.sheetId !== sheet.id ||
            linked.range.start.row !== linked.range.end.row ||
            linked.range.start.column !== linked.range.end.column)) ||
        (hasItems && sourceReference.trim() && (!source || source.sheetId !== sheet.id))
      ) {
        error.value = true;
        return;
      }
      try {
        const control = {
          ...drawing.control,
          linkedCell: linked?.range.start ?? null,
          source: source?.range ?? null,
          items: hasItems ? drawing.control.items : [],
        };
        const previous = currentTarget.existing && currentTarget.initial.control;
        if (previous && !linked && previous.type === control.type)
          control.localValue = normalizeLocalControlValue(
            control,
            getFormControlValue(previous, options.getEvaluator()),
          );
        else delete control.localValue;
        const next = normalizeSheetDrawing({
          ...drawing,
          control,
        });
        const current = sheet.drawings ?? [];
        if (
          !targets.commit(
            currentTarget,
            createSetSheetDrawingsCommand(
              sheet.id,
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
  function change(id: string, requested: unknown) {
    const sheet = options.getSheet();
    if (options.isBusy() || !options.flush() || sheet !== options.getSheet()) return;
    const drawings = sheet.drawings ?? [];
    const drawing = drawings.find((item) => item.id === id);
    if (drawing?.kind !== "control") return;
    const { linkedCell } = drawing.control;
    if (linkedCell ? !canEditCell(sheet, linkedCell) : !canEditShapeObject(sheet, drawing)) return;
    const value = resolveFormControlValue(
      drawing.control,
      requested,
      getFormControlItems(drawing.control, options.getEvaluator()).length,
    );
    if (value === undefined) return;
    if (!linkedCell) {
      if (drawing.control.type === "button") return;
      const localValue = normalizeLocalControlValue(drawing.control, value);
      if (localValue === drawing.control.localValue) return;
      options.execute(
        createSetSheetDrawingsCommand(
          sheet.id,
          drawings.map((item) =>
            item === drawing ? { ...drawing, control: { ...drawing.control, localValue } } : item,
          ),
        ),
      );
      return;
    }
    options.execute(
      createSetCellContentCommand(
        sheet.id,
        linkedCell,
        value === null ? null : { kind: "literal", value },
      ),
    );
  }
  return {
    dialog,
    editing,
    error,
    open,
    insert: (type: FormControlType) => open(undefined, type),
    confirm,
    change,
    close,
  };
}
