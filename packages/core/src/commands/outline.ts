import { MAX_OUTLINE_LEVEL, normalizeOutlineGroups } from "../data-outline.js";
import {
  createSheetSparseState,
  replaceSheetSparseState,
  type SheetDimensionAxis,
  type SheetOutlineGroup,
  type Workbook,
} from "../workbook.js";
import type {
  AddSheetOutlineGroupCommand,
  RemoveSheetOutlineGroupCommand,
  RestoreFullSheetStateCommand,
  SetSheetOutlineGroupCollapsedCommand,
  SetSheetOutlineLevelCommand,
} from "./contracts.js";
import { getSheetOrThrow, validateCommandPayload } from "./helpers.js";
function apply(
  workbook: Workbook,
  sheetId: string,
  groups: SheetOutlineGroup[],
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, sheetId),
    state = createSheetSparseState(sheet);
  validateCommandPayload("outlineGroups", groups, () => normalizeOutlineGroups(groups));
  if (JSON.stringify(state.outlineGroups) === JSON.stringify(groups)) return null;
  replaceSheetSparseState(sheet, { ...state, outlineGroups: groups });
  return { type: "restoreSheetState", sheetId, state };
}
export function createAddSheetOutlineGroupCommand(
  sheetId: string,
  group: SheetOutlineGroup,
): AddSheetOutlineGroupCommand {
  return { type: "addSheetOutlineGroup", sheetId, group: { ...group } };
}
export function createRemoveSheetOutlineGroupCommand(
  sheetId: string,
  id: string,
): RemoveSheetOutlineGroupCommand {
  return { type: "removeSheetOutlineGroup", sheetId, id };
}
export function createSetSheetOutlineGroupCollapsedCommand(
  sheetId: string,
  id: string,
  collapsed: boolean,
): SetSheetOutlineGroupCollapsedCommand {
  return { type: "setSheetOutlineGroupCollapsed", sheetId, id, collapsed };
}
export function createSetSheetOutlineLevelCommand(
  sheetId: string,
  axis: SheetDimensionAxis,
  level: number,
): SetSheetOutlineLevelCommand {
  return { type: "setSheetOutlineLevel", sheetId, axis, level };
}
export function applyAddSheetOutlineGroupCommand(w: Workbook, c: AddSheetOutlineGroupCommand) {
  const s = getSheetOrThrow(w, c.sheetId);
  return apply(w, c.sheetId, [...(s.outlineGroups ?? []), c.group]);
}
export function applyRemoveSheetOutlineGroupCommand(
  w: Workbook,
  c: RemoveSheetOutlineGroupCommand,
) {
  const s = getSheetOrThrow(w, c.sheetId);
  return apply(
    w,
    c.sheetId,
    (s.outlineGroups ?? []).filter((g) => g.id !== c.id),
  );
}
export function applySetSheetOutlineGroupCollapsedCommand(
  w: Workbook,
  c: SetSheetOutlineGroupCollapsedCommand,
) {
  const s = getSheetOrThrow(w, c.sheetId);
  return apply(
    w,
    c.sheetId,
    (s.outlineGroups ?? []).map((g) => (g.id === c.id ? { ...g, collapsed: c.collapsed } : g)),
  );
}
export function applySetSheetOutlineLevelCommand(w: Workbook, c: SetSheetOutlineLevelCommand) {
  if (!Number.isInteger(c.level) || c.level < 0 || c.level > MAX_OUTLINE_LEVEL)
    throw new RangeError("Outline level must be 0 through 8.");
  const s = getSheetOrThrow(w, c.sheetId),
    groups = s.outlineGroups ?? [];
  return apply(
    w,
    c.sheetId,
    groups.map((g) =>
      g.axis === c.axis
        ? {
            ...g,
            collapsed:
              groups.filter(
                (parent) =>
                  parent.axis === c.axis && parent.start <= g.start && parent.end >= g.end,
              ).length > c.level,
          }
        : g,
    ),
  );
}
