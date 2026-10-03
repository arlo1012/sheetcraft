import {
  applyConditionalFormatStyle,
  createConditionalFormatResolver,
  type ConditionalFormatResolverOptions,
} from "./conditional-formatting.js";
import { createDuplicateHighlightResolver } from "./duplicate-values.js";
import { getTableAtAddress, resolveTableCellStyle } from "./table-styles.js";
import { DEFAULT_CELL_TEXT_COLOR, mergeCellStyle, type CellStyle } from "./style.js";
import { getCellStyle, type CellAddress, type Sheet, type SheetEvaluator } from "./workbook.js";

export type CellColorTarget = "fill" | "text";

export function normalizeCellColor(color: string): string {
  return color.toLowerCase();
}

function getStyleColor(
  style: Readonly<CellStyle> | undefined,
  target: CellColorTarget,
): string | null | undefined {
  if (target === "text") return normalizeCellColor(style?.textColor ?? DEFAULT_CELL_TEXT_COLOR);
  if (style?.fillGradient) return undefined;
  return style?.fillColor ? normalizeCellColor(style.fillColor) : null;
}

/** Resolves the solid color currently visible in a cell, including display overlays. */
export function createCellColorResolver(
  sheet: Sheet,
  evaluator: SheetEvaluator,
  options?: ConditionalFormatResolverOptions,
): (address: CellAddress, target: CellColorTarget) => string | null | undefined {
  const resolveDuplicateHighlight = createDuplicateHighlightResolver(sheet, evaluator);
  const resolveConditionalFormat = createConditionalFormatResolver(sheet, evaluator, options);
  return (address, target) => {
    const direct = getCellStyle(sheet, address);
    const table = getTableAtAddress(sheet, address);
    const base = table
      ? mergeCellStyle(resolveTableCellStyle(table, address), direct ?? {})
      : direct;
    const highlight = resolveDuplicateHighlight(address);
    let style: CellStyle | undefined = base ? { ...base } : undefined;
    if (highlight) {
      style = { ...base, ...highlight };
      if (highlight.fillColor) {
        delete style.fillGradient;
        delete style.fillPattern;
        delete style.fillPatternColor;
      }
    }
    return getStyleColor(
      applyConditionalFormatStyle(style, resolveConditionalFormat(address)),
      target,
    );
  };
}

/** Resolves only the directly persisted cell color, without display overlays. */
export function getCellColor(
  sheet: Sheet,
  address: CellAddress,
  target: CellColorTarget,
): string | null | undefined {
  return getStyleColor(getCellStyle(sheet, address), target);
}
