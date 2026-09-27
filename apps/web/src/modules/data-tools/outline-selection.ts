import type {
  CellRange,
  Sheet,
  SheetDimensionAxis,
  SheetOutlineGroup,
} from "@idea10/core/workbook";
import type { SelectionMode } from "@idea10/sheet-engine/selection";

export type OutlineSelection = { range: CellRange; mode?: SelectionMode };

function includesAxis(selection: OutlineSelection, axis: SheetDimensionAxis): boolean {
  return selection.mode !== (axis === "row" ? "columns" : "rows");
}

function bounds(range: CellRange, axis: SheetDimensionAxis) {
  return {
    start: Math.min(range.start[axis], range.end[axis]),
    end: Math.max(range.start[axis], range.end[axis]),
  };
}

function contains(parent: SheetOutlineGroup, child: SheetOutlineGroup): boolean {
  return parent.axis === child.axis && parent.start <= child.start && parent.end >= child.end;
}

function isParent(parent: SheetOutlineGroup, child: SheetOutlineGroup): boolean {
  return (
    parent.id !== child.id &&
    contains(parent, child) &&
    (parent.start !== child.start || parent.end !== child.end || parent.id < child.id)
  );
}

function summaryIndex(sheet: Sheet, group: SheetOutlineGroup): number {
  const separator = group.id.lastIndexOf("-group-");
  const metadata =
    group.axis === "row" && separator > 0
      ? sheet.subtotalMetadata?.find((entry) => entry.id === group.id.slice(0, separator))
      : undefined;
  return metadata?.summaryBelow === false ? group.start - 1 : group.end + 1;
}

export function canUngroupOutlineRange(
  sheet: Sheet,
  selection: OutlineSelection,
  axis: SheetDimensionAxis,
): boolean {
  if (!includesAxis(selection, axis)) return false;
  const { start, end } = bounds(selection.range, axis);
  return (sheet.outlineGroups ?? []).some(
    (group) => group.axis === axis && group.start <= end && group.end >= start,
  );
}

/** Summary headers and fully selected groups take precedence over enclosing detail groups. */
export function getOutlineSelectionRoots(
  sheet: Sheet,
  selection: OutlineSelection,
): SheetOutlineGroup[] {
  const groups = sheet.outlineGroups ?? [];
  return (["row", "column"] as const).flatMap((axis) => {
    if (!includesAxis(selection, axis)) return [];
    const { start, end } = bounds(selection.range, axis);
    const axisGroups = groups.filter((group) => group.axis === axis);
    const explicit = axisGroups.filter((group) => {
      const summary = summaryIndex(sheet, group);
      return (summary >= start && summary <= end) || (group.start >= start && group.end <= end);
    });
    const detail = axisGroups.filter(
      (group) =>
        group.start <= end &&
        group.end >= start &&
        !explicit.some((target) => contains(group, target) || contains(target, group)),
    );
    const nearest = detail.filter((group) => !detail.some((child) => isParent(group, child)));
    const candidates = [...explicit, ...nearest];
    return candidates.filter((group) => !candidates.some((parent) => isParent(parent, group)));
  });
}

/** A summary action includes its descendants; expanding also opens any enclosing collapsed group. */
export function getOutlineDetailTargets(
  sheet: Sheet,
  roots: readonly SheetOutlineGroup[],
  collapsed: boolean,
): SheetOutlineGroup[] {
  const groups = sheet.outlineGroups ?? [];
  if (collapsed && roots.every((root) => root.collapsed)) return [];
  return groups.filter(
    (group) =>
      group.collapsed !== collapsed &&
      roots.some((root) => contains(root, group) || (!collapsed && contains(group, root))),
  );
}
