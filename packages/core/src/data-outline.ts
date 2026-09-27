import type { SheetDimensionAxis, SheetOutlineGroup } from "./workbook.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
export type HiddenAxisInterval = { start: number; end: number };
export const MAX_OUTLINE_LEVEL = 8;
export function normalizeOutlineGroups(groups: readonly SheetOutlineGroup[]): SheetOutlineGroup[] {
  const ids = new Set<string>();
  const result = groups
    .map((group) => {
      if (
        !group ||
        !group.id.trim() ||
        (group.axis !== "row" && group.axis !== "column") ||
        !Number.isInteger(group.start) ||
        !Number.isInteger(group.end) ||
        group.start < 0 ||
        group.end < group.start ||
        group.end >= (group.axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS) ||
        typeof group.collapsed !== "boolean"
      )
        throw new TypeError("Invalid outline group.");
      if (ids.has(group.id)) throw new Error(`Duplicate outline group ${group.id}.`);
      ids.add(group.id);
      return { ...group };
    })
    .sort(
      (a, b) =>
        a.axis.localeCompare(b.axis) ||
        a.start - b.start ||
        b.end - a.end ||
        a.id.localeCompare(b.id),
    );
  for (const axis of ["row", "column"] as const) {
    const same = result.filter((group) => group.axis === axis);
    for (let i = 0; i < same.length; i++)
      for (let j = i + 1; j < same.length; j++)
        if (same[j]!.start <= same[i]!.end && same[j]!.end > same[i]!.end)
          throw new Error("Outline groups cannot cross.");
    for (const group of same)
      if (getOutlineLevelAt(result, axis, group.start) > MAX_OUTLINE_LEVEL)
        throw new RangeError("Outline nesting cannot exceed 8 levels.");
  }
  return result;
}
export function getOutlineLevelAt(
  groups: readonly SheetOutlineGroup[],
  axis: SheetDimensionAxis,
  index: number,
): number {
  return groups.filter((g) => g.axis === axis && g.start <= index && g.end >= index).length;
}
export function getOutlineHiddenIntervals(
  groups: readonly SheetOutlineGroup[],
  axis: SheetDimensionAxis,
): HiddenAxisInterval[] {
  const intervals: HiddenAxisInterval[] = [];
  for (const group of groups
    .filter((g) => g.axis === axis && g.collapsed)
    .sort((a, b) => a.start - b.start || b.end - a.end)) {
    const last = intervals.at(-1);
    if (last && group.start <= last.end + 1) last.end = Math.max(last.end, group.end);
    else intervals.push({ start: group.start, end: group.end });
  }
  return intervals;
}
