import { ref, shallowRef } from "vue";
import { canEditCell, canUseSheetPermission } from "@sheetcraft/core";
import {
  createSetSheetDrawingsCommand,
  createSetCellContentCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import { normalizeSheetDrawing, type SheetControlDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  getFormControlItems,
  resolveFormControlValue,
  type FormControlType,
} from "@sheetcraft/core/form-controls";
import type { Workbook, Sheet, CellAddress, SheetEvaluator } from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { resolveRangeReference } from "../../shared/range-reference/formatRangeReference";
export function useFormControlActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getAddress: () => CellAddress;
  getEvaluator: () => SheetEvaluator;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  name: (type: FormControlType) => string;
}) {
  const editing = shallowRef<SheetControlDrawing>();
  const error = ref(false);
  const idFactory = createBrowserIdFactory();
  let target: { workbook: Workbook; sheetId: string; existing: boolean } | undefined;
  const allowed = () =>
    !options.isBusy() && canUseSheetPermission(options.getSheet(), "editObjects");
  function open(drawing?: SheetControlDrawing) {
    if (!allowed() || !options.flush()) return;
    target = {
      workbook: options.getWorkbook(),
      sheetId: options.getSheet().id,
      existing: !!drawing,
    };
    error.value = false;
    editing.value = drawing ?? {
      id: idFactory("control"),
      kind: "control",
      name: options.name("checkbox"),
      anchor: { ...options.getAddress() },
      offsetX: 8,
      offsetY: 8,
      width: 220,
      height: 80,
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
        type: "checkbox",
        label: options.name("checkbox"),
        linkedCell: { ...options.getAddress() },
        source: null,
        items: [],
        min: 0,
        max: 100,
        step: 1,
        optionValue: 1,
        resetValue: 0,
      },
    };
  }
  function confirm(drawing: SheetControlDrawing, linkedReference: string, sourceReference: string) {
    const sheet = options.getSheet();
    if (
      !allowed() ||
      !target ||
      target.workbook !== options.getWorkbook() ||
      target.sheetId !== sheet.id ||
      editing.value?.id !== drawing.id
    )
      return;
    const linked = linkedReference.trim()
      ? resolveRangeReference(target.workbook, linkedReference, sheet.id)
      : undefined;
    const source = sourceReference.trim()
      ? resolveRangeReference(target.workbook, sourceReference, sheet.id)
      : undefined;
    const passive = drawing.control.type === "label" || drawing.control.type === "group";
    if (
      (!passive && !linked) ||
      (linked &&
        (linked.sheetId !== sheet.id ||
          linked.range.start.row !== linked.range.end.row ||
          linked.range.start.column !== linked.range.end.column)) ||
      (sourceReference.trim() && (!source || source.sheetId !== sheet.id))
    ) {
      error.value = true;
      return;
    }
    try {
      const next = normalizeSheetDrawing({
        ...drawing,
        control: {
          ...drawing.control,
          linkedCell: linked?.range.start ?? null,
          source: source?.range ?? null,
        },
      });
      const current = sheet.drawings ?? [];
      if (target.existing && !current.some((item) => item.id === next.id)) {
        close();
        return;
      }
      options.execute(
        createSetSheetDrawingsCommand(
          sheet.id,
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
  function change(id: string, requested: unknown) {
    const sheet = options.getSheet();
    const drawing = sheet.drawings?.find((item) => item.id === id);
    if (
      options.isBusy() ||
      drawing?.kind !== "control" ||
      !drawing.control.linkedCell ||
      !canEditCell(sheet, drawing.control.linkedCell) ||
      !options.flush()
    )
      return;
    const value = resolveFormControlValue(
      drawing.control,
      requested,
      getFormControlItems(drawing.control, options.getEvaluator()).length,
    );
    if (value === undefined) return;
    options.execute(
      createSetCellContentCommand(
        sheet.id,
        drawing.control.linkedCell,
        value === null ? null : { kind: "literal", value },
      ),
    );
  }
  function close() {
    editing.value = undefined;
    target = undefined;
    error.value = false;
  }
  return { editing, error, open, confirm, change, close };
}
