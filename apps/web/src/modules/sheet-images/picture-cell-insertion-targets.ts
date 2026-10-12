import {
  canEditRange,
  doMergedCellRangesIntersect,
  expandSelectionToMergedCellRanges,
  getMergedCellAnchor,
  normalizeMergedCellRange,
} from "@sheetcraft/core";
import { areCellImagesEqual } from "@sheetcraft/core/cell-picture-frame";
import type { CellContent } from "@sheetcraft/core/formula";
import { areCellTextFontRunsEqual } from "@sheetcraft/core/text-font-runs";
import {
  cloneCellContent,
  createCellKey,
  isCellAddressInBounds,
  type CellAddress,
  type CellRange,
  type Sheet,
} from "@sheetcraft/core/workbook";

export const MAX_PICTURE_CELL_INSERTION_TARGETS = 100;

/** Detached content and geometry; the caller owns workbook/session identity. */
export type PictureCellInsertionTargetLease = {
  readonly addresses: readonly CellAddress[];
  readonly ranges: readonly CellRange[];
  readonly occupiedAddresses: readonly CellAddress[];
  readonly requestedAddresses: readonly CellAddress[];
  readonly contents: readonly ReadonlyMap<string, CellContent>[];
  readonly merges: readonly (readonly CellRange[])[];
};

function captureAddress(address: CellAddress): CellAddress {
  if (!address || typeof address !== "object" || !isCellAddressInBounds(address))
    throw new RangeError("Picture cell insertion requires an address inside the sheet.");
  return { row: address.row, column: address.column };
}

function contains(range: CellRange, address: CellAddress): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}

function compareRanges(left: CellRange, right: CellRange): number {
  return (
    left.start.row - right.start.row ||
    left.start.column - right.start.column ||
    left.end.row - right.end.row ||
    left.end.column - right.end.column
  );
}

function sameAddress(left: CellAddress, right: CellAddress): boolean {
  return left.row === right.row && left.column === right.column;
}

function sameRange(left: CellRange, right: CellRange): boolean {
  return sameAddress(left.start, right.start) && sameAddress(left.end, right.end);
}

function sameContent(left: CellContent, right: CellContent): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "literal" && right.kind === "literal")
    return (
      Object.is(left.value, right.value) && areCellTextFontRunsEqual(left.fontRuns, right.fontRuns)
    );
  if (left.kind === "formula" && right.kind === "formula")
    return left.formula.source === right.formula.source;
  if (left.kind === "error" && right.kind === "error") return left.error.code === right.error.code;
  return (
    left.kind === "image" && right.kind === "image" && areCellImagesEqual(left.image, right.image)
  );
}

/** Capture every destination before decoding or storing the first local image. */
export function capturePictureCellInsertionTargets(
  sheet: Sheet,
  addresses: readonly CellAddress[],
): PictureCellInsertionTargetLease {
  if (
    !Array.isArray(addresses) ||
    !addresses.length ||
    addresses.length > MAX_PICTURE_CELL_INSERTION_TARGETS
  )
    throw new RangeError("Picture cell insertion requires between 1 and 100 targets.");
  const requestedAddresses = Array.from(addresses, captureAddress);
  const mergedCells = sheet.mergedCells.map(normalizeMergedCellRange);
  const canonicalAddresses: CellAddress[] = [],
    ranges: CellRange[] = [],
    merges: CellRange[][] = [];
  for (const address of requestedAddresses) {
    const range = expandSelectionToMergedCellRanges({ start: address, end: address }, mergedCells);
    if (ranges.some((previous) => doMergedCellRangesIntersect(previous, range)))
      throw new RangeError("Picture cell insertion targets must not overlap.");
    if (!canEditRange(sheet, range))
      throw new Error("Picture cell insertion requires every destination cell to be editable.");
    canonicalAddresses.push({ ...(getMergedCellAnchor(mergedCells, address) ?? address) });
    ranges.push(range);
    merges.push(
      mergedCells
        .filter((merged) => doMergedCellRangesIntersect(merged, range))
        .sort(compareRanges),
    );
  }

  const contents = ranges.map(() => new Map<string, CellContent>());
  // Core createCellKey is `${row}:${column}`. Walk sparse records once, never
  // a merged rectangle's area, which may span the entire worksheet.
  for (const [key, cell] of sheet.cells) {
    if (cell.content === undefined) continue;
    const parts = key.split(":"),
      address = { row: Number(parts[0]), column: Number(parts[1]) };
    if (parts.length !== 2 || !isCellAddressInBounds(address) || createCellKey(address) !== key)
      throw new RangeError("Picture cell insertion encountered an invalid sparse cell address.");
    const index = ranges.findIndex((range) => contains(range, address));
    if (index >= 0) contents[index]!.set(key, cloneCellContent(cell.content));
  }
  return {
    addresses: canonicalAddresses,
    ranges,
    occupiedAddresses: canonicalAddresses
      .filter((_, index) => contents[index]!.size > 0)
      .map((address) => ({ ...address })),
    requestedAddresses,
    contents,
    merges,
  };
}

/** Styles and unrelated cells may advance; captured content/merge topology may not. */
export function isPictureCellInsertionTargetsCurrent(
  sheet: Sheet,
  lease: PictureCellInsertionTargetLease,
): boolean {
  try {
    const current = capturePictureCellInsertionTargets(sheet, lease.requestedAddresses);
    return (
      current.addresses.length === lease.addresses.length &&
      current.addresses.every((address, index) => {
        const capturedContent = lease.contents[index]!,
          currentContent = current.contents[index]!,
          capturedMerges = lease.merges[index]!,
          currentMerges = current.merges[index]!;
        return (
          sameAddress(address, lease.addresses[index]!) &&
          sameRange(current.ranges[index]!, lease.ranges[index]!) &&
          currentMerges.length === capturedMerges.length &&
          currentMerges.every((merged, mergeIndex) =>
            sameRange(merged, capturedMerges[mergeIndex]!),
          ) &&
          currentContent.size === capturedContent.size &&
          [...currentContent].every(([key, content]) => {
            const previous = capturedContent.get(key);
            return !!previous && sameContent(content, previous);
          })
        );
      })
    );
  } catch {
    return false;
  }
}
