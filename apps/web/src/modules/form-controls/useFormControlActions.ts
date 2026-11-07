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
  findFormRadioGroup,
  getFormRadioGroups,
  prepareFormRadioDrawings,
  selectedFormRadio,
} from "@sheetcraft/core/form-radio-groups";
import {
  getFormControlItems,
  getFormControlValue,
  normalizeLocalControlValue,
  resolveFormControlValue,
  type FormControlType,
} from "@sheetcraft/core/form-controls";
import type { Workbook, Sheet, CellAddress, SheetEvaluator } from "@sheetcraft/core/workbook";
import { getCellContent } from "@sheetcraft/core/workbook";
import { useDrawingDialogTarget } from "../../shared/drawing-dialog/useDrawingDialogTarget";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { resolveRangeReference } from "../../shared/range-reference/formatRangeReference";
import { useReferencePickerOwner } from "../../shared/range-reference/useReferencePickerOwner";
export function useFormControlActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration?: () => number;
  getRevision?: () => number;
  getAddress: () => CellAddress;
  getEvaluator: () => SheetEvaluator;
  selectSheet?: (id: string) => void;
  selectDrawing?: (id: string) => void;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  name: (type: FormControlType) => string;
}) {
  const error = ref(false);
  const idFactory = createBrowserIdFactory();
  const { owner: pickerOwner, pick } = useReferencePickerOwner(options.selectSheet);
  const targets = useDrawingDialogTarget<SheetControlDrawing, [linked: string, source: string]>({
    ...options,
    getSheet: () => pickerOwner.value ?? options.getSheet(),
    onReset: () => {
      error.value = false;
    },
  });
  const { dialog, editing, close } = targets;
  async function pickReference(select: () => Promise<string | undefined>) {
    const target = dialog.value;
    if (!target) return;
    return pick(
      target.sheet,
      () =>
        dialog.value === target &&
        target.workbook === options.getWorkbook() &&
        target.workbook.sheets.get(target.sheet.id) === target.sheet,
      select,
      target.existing ? () => options.selectDrawing?.(target.initial.id) : undefined,
    );
  }
  function open(drawing?: SheetControlDrawing, type: FormControlType = "checkbox") {
    if (pickerOwner.value) return;
    const target = targets.prepare(drawing);
    if (!target) return;
    let initial: SheetControlDrawing = drawing ?? {
      id: idFactory("control"),
      kind: "control",
      name: options.name(type),
      anchor: { ...options.getAddress() },
      offsetX: 8,
      offsetY: 8,
      width: type === "group" ? 320 : 220,
      height: type === "group" ? 240 : type === "list" ? 160 : 64,
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
    if (initial.control.type === "radio") {
      const current = target.sheet.drawings ?? [];
      const preview = prepareFormRadioDrawings(
        target.sheet,
        drawing ? current : [...current, initial],
      );
      initial = preview.find(
        (item): item is SheetControlDrawing => item.kind === "control" && item.id === initial.id,
      )!;
    }
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
    if (pickerOwner.value) return;
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
      const initial = currentTarget.initial.control;
      const keepBrokenLink =
        !passive &&
        linkedReference.trim() === "#REF!" &&
        initial.linkedSheetId &&
        (!initial.linkedCell || !currentTarget.workbook.sheets.has(initial.linkedSheetId));
      const keepBrokenSource =
        hasItems &&
        sourceReference.trim() === "#REF!" &&
        initial.sourceSheetId &&
        (!initial.source || !currentTarget.workbook.sheets.has(initial.sourceSheetId));
      if (
        (!passive && linkedReference.trim() && !linked && !keepBrokenLink) ||
        (linked &&
          (currentTarget.workbook.sheets.get(linked.sheetId)?.dashboard ||
            linked.range.start.row !== linked.range.end.row ||
            linked.range.start.column !== linked.range.end.column)) ||
        (hasItems &&
          sourceReference.trim() &&
          !keepBrokenSource &&
          (!source || currentTarget.workbook.sheets.get(source.sheetId)?.dashboard))
      ) {
        error.value = true;
        return;
      }
      try {
        const control = {
          ...drawing.control,
          linkedCell: linked?.range.start ?? null,
          linkedSheetId: keepBrokenLink
            ? initial.linkedSheetId
            : linked && linked.sheetId !== sheet.id
              ? linked.sheetId
              : undefined,
          source: source?.range ?? null,
          sourceSheetId: keepBrokenSource
            ? initial.sourceSheetId
            : source && source.sheetId !== sheet.id
              ? source.sheetId
              : undefined,
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
        const proposed = currentTarget.existing
          ? current.map((item) => (item === currentTarget.existing ? next : item))
          : control.type === "group"
            ? [next, ...current]
            : [...current, next];
        const drawings = prepareFormRadioDrawings(
          sheet,
          proposed,
          control.type === "radio"
            ? {
                id: drawing.id,
                linkedCell: control.linkedCell,
                linkedSheetId: control.linkedSheetId,
                evaluator: options.getEvaluator(),
              }
            : undefined,
        );
        const command = createSetSheetDrawingsCommand(sheet.id, drawings);
        if (control.type === "radio" && linked) {
          const group = findFormRadioGroup(getFormRadioGroups(sheet, drawings), drawing.id)!;
          const previousGroup = getFormRadioGroups(sheet).get(group.boxId);
          const address = linked.range.start;
          const oldLink = previousGroup?.linkedCell;
          if (
            !oldLink ||
            address.row !== oldLink.row ||
            address.column !== oldLink.column ||
            previousGroup?.linkedSheetId !== control.linkedSheetId
          ) {
            const selected =
              previousGroup && selectedFormRadio(previousGroup, options.getEvaluator());
            const index = group.members.findIndex((item) => item.id === selected) + 1;
            if (
              index ||
              getCellContent(currentTarget.workbook.sheets.get(linked.sheetId)!, address) !== null
            )
              command.radioLinkWrite = createSetCellContentCommand(linked.sheetId, address, {
                kind: "literal",
                value: index,
              });
          }
        }
        if (!targets.commit(currentTarget, command) && dialog.value === currentTarget)
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
    const radioGroup =
      drawing.control.type === "radio"
        ? findFormRadioGroup(getFormRadioGroups(sheet), id)
        : undefined;
    const linkedCell = radioGroup ? radioGroup.linkedCell : drawing.control.linkedCell;
    const linkedSheetId = radioGroup ? radioGroup.linkedSheetId : drawing.control.linkedSheetId;
    const linkedSheet = linkedSheetId ? options.getWorkbook().sheets.get(linkedSheetId) : sheet;
    if (
      !linkedSheet ||
      (linkedCell
        ? !canEditCell(linkedSheet, linkedCell)
        : linkedSheetId || !canEditShapeObject(sheet, drawing))
    )
      return;
    const value = radioGroup
      ? radioGroup.members.findIndex((item) => item.id === id) + 1
      : resolveFormControlValue(
          drawing.control,
          requested,
          getFormControlItems(drawing.control, options.getEvaluator()).length,
        );
    if (value === undefined) return;
    if (!linkedCell) {
      if (drawing.control.type === "button") return;
      if (radioGroup) {
        const ids = new Set(radioGroup.members.map((item) => item.id));
        const next = prepareFormRadioDrawings(sheet, drawings).map((item) => {
          if (item.kind !== "control" || !ids.has(item.id)) return item;
          const control = { ...item.control };
          if (item.id === id) control.localValue = control.optionValue;
          else delete control.localValue;
          return { ...item, control };
        });
        options.execute(createSetSheetDrawingsCommand(sheet.id, next));
        return;
      }
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
        linkedSheet.id,
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
    pickReference,
    close,
  };
}
