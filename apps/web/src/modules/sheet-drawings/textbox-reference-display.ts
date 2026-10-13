import {
  applyConditionalFormatStyle,
  createConditionalFormatResolver,
} from "@sheetcraft/core/conditional-formatting";
import { formatCellNumberValue } from "@sheetcraft/core/number-format";
import { SHAPE_TEXT_CHARACTER_LIMITS } from "@sheetcraft/core/shape-text-character-runs";
import type { TextBoxTextReference } from "@sheetcraft/core/sheet-drawings";
import { mergeCellStyle } from "@sheetcraft/core/style";
import { getTableAtAddress, resolveTableCellStyle } from "@sheetcraft/core/table-styles";
import {
  isCellAddressInBounds,
  type CellAddress,
  type SheetEvaluator,
  type Workbook,
} from "@sheetcraft/core/workbook";

export type TextBoxReferenceDisplay =
  | Readonly<{ status: "ready"; text: string }>
  | Readonly<{
      status: "unavailable";
      reason: "evaluator-unavailable" | "evaluation-failed" | "display-budget";
      message: string;
    }>;
export class TextBoxReferenceUnavailableError extends Error {
  readonly code = "text-box-reference-display-unavailable";
  constructor(readonly display?: Extract<TextBoxReferenceDisplay, { status: "unavailable" }>) {
    super(display?.message ?? "Linked text requires its workbook display resolver.");
    this.name = "TextBoxReferenceUnavailableError";
  }
}
export type TextBoxReferenceResolver = Readonly<{
  /** A current read, suitable for an explicit unlink or user-requested AutoFit. */
  resolve(reference: TextBoxTextReference): TextBoxReferenceDisplay;
  /** One synchronous render pass can share target/style work without retaining stale display text. */
  createPass?(): TextBoxReferenceResolver;
}>;
const ready = (text: string): TextBoxReferenceDisplay => Object.freeze({ status: "ready", text });
function unavailable(
  reason: Extract<TextBoxReferenceDisplay, { status: "unavailable" }>["reason"],
  message: string,
): TextBoxReferenceDisplay {
  return Object.freeze({ status: "unavailable", reason, message });
}
const cellKey = (address: CellAddress) => `${address.row}:${address.column}`;

/** Read-only projection over the caller's existing workbook calculation cycle. It
 * does not create an independent evaluator, walk every formula or own history. */
export function createTextBoxReferenceResolver(options: {
  workbook: Workbook;
  evaluator: SheetEvaluator;
  locale: string;
}): TextBoxReferenceResolver {
  function createPass(): TextBoxReferenceResolver {
    const targets = new Map<string, TextBoxReferenceDisplay>();
    const sheets = new Map<
      string,
      {
        evaluator: SheetEvaluator;
        conditionalFormat: ReturnType<typeof createConditionalFormatResolver>;
      }
    >();
    return Object.freeze({
      resolve(reference: TextBoxTextReference): TextBoxReferenceDisplay {
        const sheet = options.workbook.sheets.get(reference.sheetId);
        if (!reference.cell || !sheet || !isCellAddressInBounds(reference.cell))
          return ready("#REF!");
        const key = JSON.stringify([reference.sheetId, reference.cell.row, reference.cell.column]);
        const cached = targets.get(key);
        if (cached) return cached;
        let display: TextBoxReferenceDisplay;
        try {
          if (!options.evaluator.forSheet)
            display = unavailable(
              "evaluator-unavailable",
              "Linked text requires the current workbook calculation evaluator.",
            );
          else {
            let context = sheets.get(sheet.id);
            if (!context) {
              const evaluator = options.evaluator.forSheet(sheet.id);
              context = {
                evaluator,
                conditionalFormat: createConditionalFormatResolver(sheet, evaluator, {
                  dateSystem: options.workbook.dateSystem,
                }),
              };
              sheets.set(sheet.id, context);
            }
            const value = context.evaluator.getComputedValue(reference.cell);
            let direct = sheet.cells.get(cellKey(reference.cell))?.style;
            // Reading the target discovers its relevant spill through the existing
            // calculation evaluator; no sheet-wide formula evaluation is needed.
            if (!direct)
              for (const projection of context.evaluator.getSpillProjections?.() ?? [])
                if (
                  projection.address.row === reference.cell.row &&
                  projection.address.column === reference.cell.column
                ) {
                  direct = sheet.cells.get(cellKey(projection.root))?.style;
                  break;
                }
            const table = getTableAtAddress(sheet, reference.cell);
            const base = table
              ? mergeCellStyle(resolveTableCellStyle(table, reference.cell), direct ?? {})
              : direct;
            const style = applyConditionalFormatStyle(
              base,
              context.conditionalFormat(reference.cell),
            );
            // Only the source number format travels. Number-format color/fill,
            // cell font runs and every other source appearance stay with the cell.
            const text = formatCellNumberValue(value, style?.numberFormat, {
              locale: options.locale,
              dateSystem: options.workbook.dateSystem,
            }).text;
            display =
              text.length <= SHAPE_TEXT_CHARACTER_LIMITS.textUnits
                ? ready(text)
                : unavailable("display-budget", "Linked text exceeds the shape text-unit budget.");
          }
        } catch (error) {
          display = unavailable(
            "evaluation-failed",
            error instanceof Error ? error.message : String(error),
          );
        }
        targets.set(key, display);
        return display;
      },
    });
  }
  return Object.freeze({
    resolve: (reference: TextBoxTextReference) => createPass().resolve(reference),
    createPass,
  });
}
