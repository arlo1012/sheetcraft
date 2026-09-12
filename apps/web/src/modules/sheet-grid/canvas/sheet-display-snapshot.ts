import { computed, type ComputedRef } from "vue";
import type { CellAddress, Sheet, SheetEvaluator } from "@idea10/core/workbook";
import type { FormulaValue } from "@idea10/core/formula";
import { getSheetContentExtent, type GridExtent } from "@idea10/sheet-engine/extent";

export type SpillProjection = Readonly<{
  root: CellAddress;
  value: FormulaValue;
}>;

/**
 * Document-derived data used by the sheet surface.
 *
 * Building a snapshot is deliberately the only place that walks every formula.
 * Viewport changes consume this immutable result, so scrolling and zooming never
 * turn into document-wide calculation work.
 */
export type SheetDisplaySnapshot = Readonly<{
  sheet: Sheet;
  evaluator: SheetEvaluator;
  revision: number | undefined;
  contentExtent: GridExtent;
  getComputedValue: (address: CellAddress) => FormulaValue;
  getSpill: (address: CellAddress) => SpillProjection | undefined;
}>;

function addressKey(address: CellAddress): string {
  return `${address.row}:${address.column}`;
}

function parseAddress(key: string): CellAddress | undefined {
  const separator = key.indexOf(":");
  if (separator < 1) return undefined;
  const row = Number(key.slice(0, separator));
  const column = Number(key.slice(separator + 1));
  return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : undefined;
}

export function createSheetDisplaySnapshot(options: {
  sheet: Sheet;
  evaluator: SheetEvaluator;
  revision?: number;
}): SheetDisplaySnapshot {
  const contentExtent = getSheetContentExtent(options.sheet);

  // Evaluation creates the evaluator's spill projection index. This belongs to
  // document refreshes, never to canvas scene construction.
  const computedValues = new Map<string, FormulaValue>();
  for (const [key, cell] of options.sheet.cells) {
    if (cell.content?.kind !== "formula") continue;
    const address = parseAddress(key);
    if (address) computedValues.set(key, options.evaluator.getComputedValue(address));
  }

  const spills = new Map<string, SpillProjection>();
  for (const projection of options.evaluator.getSpillProjections?.() ?? []) {
    spills.set(addressKey(projection.address), {
      root: projection.root,
      value: projection.value,
    });
    contentExtent.rowCount = Math.max(contentExtent.rowCount, projection.address.row + 1);
    contentExtent.columnCount = Math.max(contentExtent.columnCount, projection.address.column + 1);
  }

  return {
    sheet: options.sheet,
    evaluator: options.evaluator,
    revision: options.revision,
    contentExtent,
    getComputedValue: (address) =>
      computedValues.get(addressKey(address)) ?? options.evaluator.getComputedValue(address),
    getSpill: (address) => spills.get(addressKey(address)),
  };
}

/**
 * Tracks the persisted sheet members that can change calculation input or the
 * reachable document extent. `workbookRevision` remains the authoritative
 * invalidation signal when it is supplied; this tracking keeps isolated Grid
 * mounts correct when they omit that prop.
 */
function trackSheetDisplayDocument(sheet: Sheet): void {
  for (const [key, cell] of sheet.cells) {
    void key;
    void cell.content;
    void cell.style;
  }
  for (const [index, size] of sheet.rowHeights) {
    void index;
    void size;
  }
  for (const [index, size] of sheet.columnWidths) {
    void index;
    void size;
  }
  void sheet.mergedCells;
  void sheet.freezePanes;
  void sheet.filter;
  void sheet.floatingImages;
}

export function useSheetDisplaySnapshot(options: {
  getSheet: () => Sheet;
  getEvaluator: () => SheetEvaluator;
  getRevision?: () => number | undefined;
}): ComputedRef<SheetDisplaySnapshot> {
  return computed(() => {
    const sheet = options.getSheet();
    const evaluator = options.getEvaluator();
    const revision = options.getRevision?.();
    trackSheetDisplayDocument(sheet);
    return createSheetDisplaySnapshot({ sheet, evaluator, revision });
  });
}
