import { createDuplicateHighlightResolver } from "@idea10/core/duplicate-values";
import {
  applyConditionalFormatStyle,
  createConditionalFormatResolver,
  createConditionalFormatVisualResolver,
} from "@idea10/core/conditional-formatting";
import type { ConditionalFormatVisual } from "@idea10/core/conditional-formatting";
import { mergeCellStyle, type CellStyle } from "@idea10/core/style";
import { getTableAtAddress, resolveTableCellStyle } from "@idea10/core/table-styles";
import type { ExcelDateSystem } from "@idea10/core/formula";
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
  getCellStyle: (address: CellAddress) => Readonly<CellStyle> | undefined;
  getConditionalFormatVisual: (address: CellAddress) => ConditionalFormatVisual | undefined;
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
  dateSystem?: ExcelDateSystem;
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

  const resolveHighlight = createDuplicateHighlightResolver(options.sheet, options.evaluator);
  const resolveConditionalFormat = createConditionalFormatResolver(
    options.sheet,
    options.evaluator,
    { dateSystem: options.dateSystem },
  );
  const resolveConditionalFormatVisual = createConditionalFormatVisualResolver(
    options.sheet,
    options.evaluator,
    { dateSystem: options.dateSystem },
  );
  const styles = new Map<string, Readonly<CellStyle> | undefined>();
  function getCellStyle(address: CellAddress): Readonly<CellStyle> | undefined {
    const key = addressKey(address);
    if (styles.has(key)) return styles.get(key);
    const direct =
      options.sheet.cells.get(key)?.style ??
      (spills.get(key)
        ? options.sheet.cells.get(addressKey(spills.get(key)!.root))?.style
        : undefined);
    const table = getTableAtAddress(options.sheet, address);
    const base = table
      ? mergeCellStyle(resolveTableCellStyle(table, address), direct ?? {})
      : direct;
    const highlight = resolveHighlight(address);
    let style = base;
    if (highlight) {
      style = { ...base, ...highlight };
      if (highlight.fillColor) {
        delete style.fillGradient;
        delete style.fillPattern;
        delete style.fillPatternColor;
      }
    }
    // Conditional rules override product duplicate highlights, while the stored
    // manual style stays untouched and is revealed again when no rule matches.
    const effectiveStyle = applyConditionalFormatStyle(style, resolveConditionalFormat(address));
    styles.set(key, effectiveStyle);
    return effectiveStyle;
  }

  return {
    sheet: options.sheet,
    evaluator: options.evaluator,
    revision: options.revision,
    contentExtent,
    getComputedValue: (address) =>
      computedValues.get(addressKey(address)) ?? options.evaluator.getComputedValue(address),
    getSpill: (address) => spills.get(addressKey(address)),
    getCellStyle,
    getConditionalFormatVisual: resolveConditionalFormatVisual,
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
  void sheet.defaultColumnWidth;
  for (const row of sheet.hiddenRows ?? []) void row;
  for (const column of sheet.hiddenColumns ?? []) void column;
  void sheet.mergedCells;
  void sheet.freezePanes;
  void sheet.filter;
  void sheet.floatingImages;
  void sheet.duplicateRules;
  void sheet.conditionalFormats;
  void sheet.tables;
}

export function useSheetDisplaySnapshot(options: {
  getSheet: () => Sheet;
  getEvaluator: () => SheetEvaluator;
  getRevision?: () => number | undefined;
  getDateSystem?: () => ExcelDateSystem;
}): ComputedRef<SheetDisplaySnapshot> {
  return computed(() => {
    const sheet = options.getSheet();
    const evaluator = options.getEvaluator();
    const revision = options.getRevision?.();
    trackSheetDisplayDocument(sheet);
    return createSheetDisplaySnapshot({
      sheet,
      evaluator,
      revision,
      dateSystem: options.getDateSystem?.(),
    });
  });
}
