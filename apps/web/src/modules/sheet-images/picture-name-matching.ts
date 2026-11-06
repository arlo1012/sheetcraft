import { doMergedCellRangesIntersect, expandSelectionToMergedCellRanges } from "@sheetcraft/core";
import {
  createWorkbookEvaluator,
  isCellAddressInBounds,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "@sheetcraft/core/workbook";

export type PictureNameMatchStatus =
  | "matched"
  | "unmatched"
  | "duplicateFile"
  | "duplicateName"
  | "invalidTarget";
export type PictureNameMatchEntry = {
  fileIndex: number;
  status: PictureNameMatchStatus;
  nameAddress?: CellAddress;
  pictureAddress?: CellAddress;
};
export type PictureNameMatchPlan = {
  entries: PictureNameMatchEntry[];
  matches: Array<{ fileIndex: number; nameAddress: CellAddress; pictureAddress: CellAddress }>;
  hasConflicts: boolean;
  fingerprint: string;
};
export type PictureNameMatchSource = { range: CellRange; fingerprint: string };
const key = (value: string) => value.trim().normalize("NFC").toLowerCase();

/** Exact filename first, then the filename without its extension. Never pick an arbitrary duplicate. */
export function analyzePictureNameMatches(
  workbook: Workbook,
  sheetId: string,
  fileNames: readonly string[],
  range: CellRange,
  arrangement: "horizontal" | "vertical",
  namePlacement: "before" | "after",
): PictureNameMatchPlan {
  const sheet = workbook.sheets.get(sheetId);
  if (
    !sheet ||
    !isCellAddressInBounds(range.start) ||
    !isCellAddressInBounds(range.end) ||
    range.start.row > range.end.row ||
    range.start.column > range.end.column ||
    (arrangement === "horizontal"
      ? range.start.row !== range.end.row
      : range.start.column !== range.end.column)
  )
    throw new RangeError("Select one row or column of picture names on the current sheet.");
  const fullNames = new Map<string, number[]>(),
    stems = new Map<string, number[]>();
  fileNames.forEach((name, index) => {
    const full = key(name),
      stem = key(name.replace(/\.[^.]+$/, ""));
    fullNames.set(full, [...(fullNames.get(full) ?? []), index]);
    stems.set(stem, [...(stems.get(stem) ?? []), index]);
  });
  const sources: Array<{ address: CellAddress; value: string; range: CellRange }> = [];
  const evaluator = createWorkbookEvaluator(workbook, sheetId);
  for (const cellKey of sheet.cells.keys()) {
    const [row, column] = cellKey.split(":").map(Number);
    if (
      row! < range.start.row ||
      row! > range.end.row ||
      column! < range.start.column ||
      column! > range.end.column
    )
      continue;
    const address = { row: row!, column: column! };
    const merged = expandSelectionToMergedCellRanges(
      { start: address, end: address },
      sheet.mergedCells,
    );
    if (merged.start.row !== address.row || merged.start.column !== address.column) continue;
    const value = evaluator.getComputedValue(address);
    if (value === null || typeof value === "object" || !String(value).trim()) continue;
    sources.push({ address, value: String(value), range: merged });
  }
  sources.sort((a, b) => a.address.row - b.address.row || a.address.column - b.address.column);
  const entries = fileNames.map((_, fileIndex): PictureNameMatchEntry => ({
    fileIndex,
    status: "unmatched",
  }));
  const candidates = new Map<number, typeof sources>();
  for (const source of sources) {
    const indexes = fullNames.get(key(source.value)) ?? stems.get(key(source.value)) ?? [];
    for (const index of indexes) {
      if (indexes.length > 1) entries[index]!.status = "duplicateFile";
      candidates.set(index, [...(candidates.get(index) ?? []), source]);
    }
  }
  const pictureRanges = new Map<number, CellRange>();
  for (const [index, names] of candidates) {
    const entry = entries[index]!;
    if (entry.status === "duplicateFile") continue;
    if (names.length !== 1) {
      entry.status = "duplicateName";
      continue;
    }
    const source = names[0]!;
    const destination =
      arrangement === "horizontal"
        ? {
            row: namePlacement === "before" ? source.range.end.row + 1 : source.range.start.row - 1,
            column: source.range.start.column,
          }
        : {
            row: source.range.start.row,
            column:
              namePlacement === "before"
                ? source.range.end.column + 1
                : source.range.start.column - 1,
          };
    entry.nameAddress = { ...source.address };
    if (!isCellAddressInBounds(destination)) {
      entry.status = "invalidTarget";
      continue;
    }
    const target = expandSelectionToMergedCellRanges(
      { start: destination, end: destination },
      sheet.mergedCells,
    );
    if (
      doMergedCellRangesIntersect(target, range) ||
      sources.some((name) => doMergedCellRangesIntersect(target, name.range))
    ) {
      entry.status = "invalidTarget";
      continue;
    }
    entry.status = "matched";
    entry.pictureAddress = { ...target.start };
    for (const [previousIndex, previousRange] of pictureRanges) {
      if (!doMergedCellRangesIntersect(previousRange, target)) continue;
      entries[previousIndex]!.status = "invalidTarget";
      entry.status = "invalidTarget";
    }
    pictureRanges.set(index, target);
  }
  return {
    entries,
    matches: entries
      .filter((entry) => entry.status === "matched")
      .map((entry) => ({
        fileIndex: entry.fileIndex,
        nameAddress: entry.nameAddress!,
        pictureAddress: entry.pictureAddress!,
      })),
    hasConflicts: entries.some(
      (entry) => entry.status !== "matched" && entry.status !== "unmatched",
    ),
    fingerprint: JSON.stringify({ fileNames, range, arrangement, namePlacement, sources, entries }),
  };
}
