import {
  MAX_OUTLINE_LEVEL,
  getOutlineHiddenIntervals,
  normalizeOutlineGroups,
  type HiddenAxisInterval,
} from "../data-outline.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "../sheet-limits.js";
import {
  createSheetSparseState,
  replaceSheetSparseState,
  type SheetDimensionAxis,
  type SheetOutlineGroup,
  type Workbook,
} from "../workbook.js";
import type {
  AddSheetOutlineGroupCommand,
  ClearSheetOutlineCommand,
  RemoveSheetOutlineGroupCommand,
  RestoreFullSheetStateCommand,
  SetSheetOutlineGroupCollapsedCommand,
  SetSheetOutlineGroupsCollapsedCommand,
  SetSheetOutlineLevelCommand,
  UngroupSheetRangeCommand,
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

function applyState(
  workbook: Workbook,
  sheetId: string,
  next: ReturnType<typeof createSheetSparseState>,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, sheetId),
    state = createSheetSparseState(sheet),
    outlineGroups = normalizeOutlineGroups(next.outlineGroups ?? []),
    normalizedNext = { ...next, outlineGroups };
  validateCommandPayload("outlineGroups", next.outlineGroups ?? [], () => outlineGroups);
  if (JSON.stringify(state) === JSON.stringify(normalizedNext)) return null;
  replaceSheetSparseState(sheet, normalizedNext);
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
export function createSetSheetOutlineGroupsCollapsedCommand(
  sheetId: string,
  ids: readonly string[],
  collapsed: boolean,
): SetSheetOutlineGroupsCollapsedCommand {
  return { type: "setSheetOutlineGroupsCollapsed", sheetId, ids: [...ids], collapsed };
}
export function createSetSheetOutlineLevelCommand(
  sheetId: string,
  axis: SheetDimensionAxis,
  level: number,
): SetSheetOutlineLevelCommand {
  return { type: "setSheetOutlineLevel", sheetId, axis, level };
}
export function createClearSheetOutlineCommand(sheetId: string): ClearSheetOutlineCommand {
  return { type: "clearSheetOutline", sheetId };
}
export function createUngroupSheetRangeCommand(
  sheetId: string,
  axis: SheetDimensionAxis,
  start: number,
  end: number,
): UngroupSheetRangeCommand {
  return { type: "ungroupSheetRange", sheetId, axis, start, end };
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
export function applySetSheetOutlineGroupsCollapsedCommand(
  w: Workbook,
  c: SetSheetOutlineGroupsCollapsedCommand,
) {
  if (!c.ids.length || c.ids.some((id) => !id.trim()) || new Set(c.ids).size !== c.ids.length) {
    throw new TypeError("Outline group IDs must be a non-empty, unique list.");
  }
  const s = getSheetOrThrow(w, c.sheetId),
    ids = new Set(c.ids);
  return apply(
    w,
    c.sheetId,
    (s.outlineGroups ?? []).map((g) => (ids.has(g.id) ? { ...g, collapsed: c.collapsed } : g)),
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

export function applyClearSheetOutlineCommand(w: Workbook, c: ClearSheetOutlineCommand) {
  const sheet = getSheetOrThrow(w, c.sheetId),
    state = createSheetSparseState(sheet),
    groups = sheet.outlineGroups ?? [];
  return applyState(w, c.sheetId, {
    ...state,
    hiddenRows: addIntervals(state.hiddenRows ?? [], getOutlineHiddenIntervals(groups, "row")),
    hiddenColumns: addIntervals(
      state.hiddenColumns ?? [],
      getOutlineHiddenIntervals(groups, "column"),
    ),
    outlineGroups: [],
  });
}

function assertOutlineRange(axis: SheetDimensionAxis, start: number, end: number): void {
  if (axis !== "row" && axis !== "column")
    throw new TypeError("Outline axis must be row or column.");
  const limit = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end >= limit
  )
    throw new RangeError("Outline range is outside the sheet.");
}

function createFragmentId(
  ids: Set<string>,
  axis: SheetDimensionAxis,
  start: number,
  end: number,
  level: number,
): string {
  const base = `outline-${axis}-${start}-${end}-${level}`;
  let id = base,
    suffix = 2;
  while (ids.has(id)) id = `${base}:${suffix++}`;
  ids.add(id);
  return id;
}

function addIntervals(
  indexes: readonly number[],
  intervals: readonly HiddenAxisInterval[],
): number[] {
  const result = new Set(indexes);
  for (const { start, end } of intervals)
    for (let index = start; index <= end; index++) result.add(index);
  return [...result].sort((left, right) => left - right);
}

function subtractIntervals(
  source: readonly HiddenAxisInterval[],
  covered: readonly HiddenAxisInterval[],
): HiddenAxisInterval[] {
  const result: HiddenAxisInterval[] = [];
  let coveredIndex = 0;
  for (const interval of source) {
    let start = interval.start;
    while (coveredIndex < covered.length && covered[coveredIndex]!.end < start) coveredIndex++;
    for (let index = coveredIndex; index < covered.length; index++) {
      const current = covered[index]!;
      if (current.start > interval.end) break;
      if (current.start > start)
        result.push({ start, end: Math.min(interval.end, current.start - 1) });
      start = Math.max(start, current.end + 1);
      if (start > interval.end) break;
    }
    if (start <= interval.end) result.push({ start, end: interval.end });
  }
  return result;
}

type OutlineDepthSegment = {
  start: number;
  end: number;
  depth: number;
  groups: readonly SheetOutlineGroup[];
};

function getOutlineDepthSegments(
  groups: readonly SheetOutlineGroup[],
  axis: SheetDimensionAxis,
  start: number,
  end: number,
): OutlineDepthSegment[] {
  const starts = new Map<number, SheetOutlineGroup[]>(),
    ends = new Map<number, SheetOutlineGroup[]>();
  const addEvent = (
    events: Map<number, SheetOutlineGroup[]>,
    index: number,
    group: SheetOutlineGroup,
  ) => {
    const entries = events.get(index) ?? [];
    entries.push(group);
    events.set(index, entries);
  };
  for (const group of groups) {
    if (group.axis !== axis) continue;
    addEvent(starts, group.start, group);
    addEvent(ends, group.end + 1, group);
  }
  const points = new Set([...starts.keys(), ...ends.keys(), start, end + 1]),
    active = new Map<string, SheetOutlineGroup>();
  const result: OutlineDepthSegment[] = [];
  const sortedPoints = [...points].sort((left, right) => left - right);
  for (let index = 0; index < sortedPoints.length - 1; index++) {
    const segmentStart = sortedPoints[index]!;
    for (const group of ends.get(segmentStart) ?? []) active.delete(group.id);
    for (const group of starts.get(segmentStart) ?? []) active.set(group.id, group);
    const segmentEnd = sortedPoints[index + 1]! - 1,
      activeGroups = [...active.values()].sort(
        (left, right) =>
          left.start - right.start || right.end - left.end || left.id.localeCompare(right.id),
      );
    if (segmentStart > segmentEnd || activeGroups.length === 0) continue;
    const depth =
      segmentStart >= start && segmentStart <= end ? activeGroups.length - 1 : activeGroups.length;
    if (depth > 0)
      result.push({ start: segmentStart, end: segmentEnd, depth, groups: activeGroups });
  }
  return result;
}

function rebuildGroupsAtLoweredDepth(
  groups: readonly SheetOutlineGroup[],
  axis: SheetDimensionAxis,
  start: number,
  end: number,
): SheetOutlineGroup[] {
  const segments = getOutlineDepthSegments(groups, axis, start, end);
  if (!segments.length) return [];
  const ids = new Set(groups.map((group) => group.id)),
    emittedSourceIds = new Set<string>();
  const rebuilt: SheetOutlineGroup[] = [];
  const maximumDepth = Math.max(0, ...segments.map((segment) => segment.depth));
  for (let level = 1; level <= maximumDepth; level++) {
    let interval: (HiddenAxisInterval & { source: SheetOutlineGroup }) | null = null;
    const flush = () => {
      if (!interval) return;
      const retained = !emittedSourceIds.has(interval.source.id);
      emittedSourceIds.add(interval.source.id);
      rebuilt.push({
        ...interval.source,
        id: retained
          ? interval.source.id
          : createFragmentId(ids, axis, interval.start, interval.end, level),
        start: interval.start,
        end: interval.end,
      });
      ids.add(interval.source.id);
      interval = null;
    };
    for (const segment of segments) {
      if (segment.depth < level) {
        flush();
        continue;
      }
      const source = segment.groups[level - 1]!;
      if (interval && interval.source.id === source.id && interval.end + 1 === segment.start)
        interval.end = segment.end;
      else {
        flush();
        interval = { start: segment.start, end: segment.end, source };
      }
    }
    flush();
  }
  return rebuilt;
}

/** Lowers exactly one outline level across the selected band and preserves unaffected nesting. */
export function applyUngroupSheetRangeCommand(w: Workbook, c: UngroupSheetRangeCommand) {
  assertOutlineRange(c.axis, c.start, c.end);
  const sheet = getSheetOrThrow(w, c.sheetId),
    state = createSheetSparseState(sheet),
    groups = sheet.outlineGroups ?? [];
  if (
    !groups.some((group) => group.axis === c.axis && group.start <= c.end && group.end >= c.start)
  )
    return null;
  const nextGroups = [
      ...groups.filter((group) => group.axis !== c.axis),
      ...rebuildGroupsAtLoweredDepth(groups, c.axis, c.start, c.end),
    ],
    oldHidden = getOutlineHiddenIntervals(groups, c.axis),
    retainedHidden = getOutlineHiddenIntervals(nextGroups, c.axis),
    newlyManual = subtractIntervals(oldHidden, retainedHidden),
    hiddenKey = c.axis === "row" ? "hiddenRows" : "hiddenColumns";
  return applyState(w, c.sheetId, {
    ...state,
    [hiddenKey]: addIntervals(state[hiddenKey] ?? [], newlyManual),
    outlineGroups: nextGroups,
  });
}
