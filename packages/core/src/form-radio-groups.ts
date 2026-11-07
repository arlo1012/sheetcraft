import { createPictureSheetMetrics, type PictureSheetMetrics } from "./picture-axis-metrics.js";
import type { SheetControlDrawing, SheetDrawing } from "./sheet-drawings.js";
import type { CellAddress, Sheet, SheetEvaluator } from "./workbook.js";

export type FormRadioGroup = {
  boxId?: string;
  members: SheetControlDrawing[];
  linkedCell: CellAddress | null;
  localSelection?: string;
};

function isRadio(item: SheetDrawing): item is SheetControlDrawing {
  return item.kind === "control" && item.control.type === "radio";
}
function participatesInGrouping(item: SheetDrawing): item is SheetControlDrawing {
  return (
    item.kind === "control" && (item.control.type === "radio" || item.control.type === "group")
  );
}
function inCreationOrder(a: SheetControlDrawing, b: SheetControlDrawing) {
  return (
    (a.control.creationOrder ?? Number.MAX_SAFE_INTEGER) -
    (b.control.creationOrder ?? Number.MAX_SAFE_INTEGER)
  );
}

function bounds(item: SheetControlDrawing, metrics: PictureSheetMetrics) {
  const x = metrics.columns.visiblePrefix(item.anchor.column) + item.offsetX;
  const y = metrics.rows.visiblePrefix(item.anchor.row) + item.offsetY;
  return { x, y, right: x + item.width, bottom: y + item.height };
}

/** WPS uses the first-created group box that fully contains the option.
 * Options outside all boxes share the worksheet's default group. */
export function getFormRadioGroups(
  sheet: Sheet,
  drawings: readonly SheetDrawing[] = sheet.drawings ?? [],
  metrics?: PictureSheetMetrics,
) {
  const groups = new Map<string | undefined, FormRadioGroup>();
  const radios = drawings.filter(isRadio);
  if (!radios.length) return groups;
  const axes = metrics ?? createPictureSheetMetrics(sheet);
  const boxes = drawings
    .filter(
      (item): item is SheetControlDrawing =>
        item.kind === "control" && item.control.type === "group",
    )
    .sort(inCreationOrder)
    .map((box) => ({ id: box.id, rect: bounds(box, axes) }));
  // Creation order stays stable when an object moves in the drawing stack.
  radios.sort(inCreationOrder);
  for (const radio of radios) {
    const rect = bounds(radio, axes);
    const boxId = boxes.find(
      (box) =>
        box.rect.x <= rect.x &&
        box.rect.y <= rect.y &&
        rect.right <= box.rect.right &&
        rect.bottom <= box.rect.bottom,
    )?.id;
    let group = groups.get(boxId);
    if (!group) {
      group = { boxId, members: [], linkedCell: null };
      groups.set(boxId, group);
    }
    group.members.push(radio);
    if (radio.control.radioGroupId === boxId && radio.control.linkedCell)
      group.linkedCell ??= radio.control.linkedCell;
    if (radio.control.localValue !== undefined) group.localSelection ??= radio.id;
  }
  return groups;
}

export function findFormRadioGroup(groups: Map<string | undefined, FormRadioGroup>, id: string) {
  for (const group of groups.values())
    if (group.members.some((item) => item.id === id)) return group;
}

export function selectedFormRadio(group: FormRadioGroup, evaluator: SheetEvaluator) {
  if (!group.linkedCell) return group.localSelection;
  const value = evaluator.getComputedValue(group.linkedCell);
  return typeof value === "number" && Number.isInteger(value)
    ? group.members[value - 1]?.id
    : undefined;
}

/** Prepare a single collection edit, before history records it. Its inverse
 * restores the original collection verbatim, including selection and links. */
export function prepareFormRadioDrawings(
  sheet: Sheet,
  proposed: readonly SheetDrawing[],
  edit?: { id: string; linkedCell: CellAddress | null; evaluator: SheetEvaluator },
): SheetDrawing[] {
  if (!proposed.some(participatesInGrouping)) return [...proposed];
  const previous = sheet.drawings ?? [];
  const previousControls = previous.filter(participatesInGrouping);
  let lastOrder = previousControls.reduce(
    (last, item) => Math.max(last, item.control.creationOrder ?? 0),
    0,
  );
  const orders = new Map(
    previousControls.map((item) => [item.id, item.control.creationOrder ?? ++lastOrder]),
  );
  const next = proposed.map((item) => {
    if (!participatesInGrouping(item)) return item;
    const creationOrder = orders.get(item.id) ?? ++lastOrder;
    const control = { ...item.control, creationOrder };
    if (!orders.has(item.id)) delete control.localValue;
    return { ...item, control };
  });
  const metrics = createPictureSheetMetrics(sheet);
  const oldGroups = getFormRadioGroups(sheet, previous, metrics);
  const updates = new Map<string, SheetControlDrawing>();
  for (const group of getFormRadioGroups(sheet, next, metrics).values()) {
    const oldGroup = oldGroups.get(group.boxId);
    let link = oldGroup?.linkedCell ?? group.linkedCell;
    let selected = group.localSelection;
    if (edit && group.members.some((item) => item.id === edit.id)) {
      if (oldGroup && !edit.linkedCell && oldGroup.linkedCell)
        selected = selectedFormRadio(oldGroup, edit.evaluator);
      // A newly inserted option inherits the link of its destination group.
      if (edit.linkedCell || previousControls.some((item) => item.id === edit.id && isRadio(item)))
        link = edit.linkedCell;
    }
    group.members.forEach((item, index) => {
      const control = { ...item.control, optionValue: index + 1, linkedCell: link };
      if (group.boxId) control.radioGroupId = group.boxId;
      else delete control.radioGroupId;
      if (!link && item.id === selected) control.localValue = index + 1;
      else delete control.localValue;
      updates.set(item.id, { ...item, control });
    });
  }
  return next.map((item) => updates.get(item.id) ?? item);
}
