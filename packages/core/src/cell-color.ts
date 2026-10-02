import {
  applyConditionalFormatStyle,
  createConditionalFormatResolver,
  type ConditionalFormatResolverOptions,
} from "./conditional-formatting.js";
import { createDuplicateHighlightResolver } from "./duplicate-values.js";
import { DEFAULT_CELL_TEXT_COLOR, type CellStyle } from "./style.js";
import { getCellStyle, type CellAddress, type Sheet, type SheetEvaluator } from "./workbook.js";

export type CellColorTarget = "fill" | "text";

function styleColor(
  style: Readonly<CellStyle> | undefined,
  target: CellColorTarget,
): string | null | undefined {
  if (target === "text") return (style?.textColor ?? DEFAULT_CELL_TEXT_COLOR).toLowerCase();
  if (style?.fillGradient) return undefined;
  return style?.fillColor ? style.fillColor.toLowerCase() : null;
}

/** Resolves direct formatting, duplicate highlighting, and conditional-format overlays. */
export function createCellColorResolver(
  sheet: Sheet,
  evaluator: SheetEvaluator,
  options?: ConditionalFormatResolverOptions,
): (address: CellAddress, target: CellColorTarget) => string | null | undefined {
  const duplicate = createDuplicateHighlightResolver(sheet, evaluator);
  const conditional = createConditionalFormatResolver(sheet, evaluator, options);
  return (address, target) =>
    styleColor(
      applyConditionalFormatStyle(
        { ...getCellStyle(sheet, address), ...duplicate(address) },
        conditional(address),
      ),
      target,
    );
}

export function getCellColor(
  sheet: Sheet,
  address: CellAddress,
  target: CellColorTarget,
): string | null | undefined {
  return styleColor(getCellStyle(sheet, address), target);
}
