import { createSheetFilterHiddenRowIntervals } from "@idea10/core/commands";
import { getOutlineHiddenIntervals } from "@idea10/core";
import type { Sheet, SheetEvaluator } from "@idea10/core/workbook";

export type HiddenAxisInterval = Readonly<{ start: number; end: number }>;

export function mergeHiddenAxisIntervals(
  ...sources: ReadonlyArray<readonly HiddenAxisInterval[]>
): HiddenAxisInterval[] {
  const intervals = sources
    .flat()
    .map((interval) => ({ start: interval.start, end: interval.end }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end + 1)
      previous.end = Math.max(previous.end, interval.end);
    else merged.push(interval);
  }
  return merged;
}

/** The same collapsed row union used by viewport, clipboard, fills, and summaries. */
export function createSheetHiddenRowIntervals(
  sheet: Sheet,
  evaluator?: SheetEvaluator,
): HiddenAxisInterval[] {
  return mergeHiddenAxisIntervals(
    createSheetFilterHiddenRowIntervals(sheet, evaluator),
    getOutlineHiddenIntervals(sheet.outlineGroups ?? [], "row"),
  );
}

export function createSheetHiddenColumnIntervals(sheet: Sheet): HiddenAxisInterval[] {
  return getOutlineHiddenIntervals(sheet.outlineGroups ?? [], "column");
}

export function isInHiddenAxisIntervals(
  index: number,
  intervals: readonly HiddenAxisInterval[],
): boolean {
  return intervals.some((interval) => index >= interval.start && index <= interval.end);
}
