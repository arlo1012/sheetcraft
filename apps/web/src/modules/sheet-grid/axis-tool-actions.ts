import {
  createResizeSheetDimensionsCommand,
  createSetSheetDefaultColumnWidthCommand,
  createSetSheetDimensionHiddenCommand,
  createSetSheetDimensionSizesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type Cell,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetDimensionAxis,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import type { ExcelDateSystem } from "@sheetcraft/core/formula";
import type { CellStyle } from "@sheetcraft/core/style";
import { resolveThemeFontFamily, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { TextMeasurer } from "@sheetcraft/sheet-engine/row-height";
import {
  getAutoFitColumnWidths,
  getAutoFitRowHeights,
  getAxisAutoFitFontFamilies,
  type AxisAutoFitInput,
} from "./axis-auto-fit";
import { getCellValuePresentationForGrid } from "./cell-value-presentation";
import {
  cellFontResourceNeedsLoading,
  ensureCellFontResource,
  getCellFontResourceFamilies,
} from "../../shared/cell-text/font-resources";

type AxisSpan = { axis: SheetDimensionAxis; index: number; count: number };

function axisMaximum(axis: SheetDimensionAxis): number {
  return axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
}

function validateSpan(span: AxisSpan): void {
  if (
    !Number.isInteger(span.index) ||
    !Number.isInteger(span.count) ||
    span.index < 0 ||
    span.count < 1 ||
    span.index + span.count > axisMaximum(span.axis)
  )
    throw new RangeError("Invalid row or column span.");
}

function indexesForSpan(span: AxisSpan): number[] {
  validateSpan(span);
  return Array.from({ length: span.count }, (_, offset) => span.index + offset);
}

/** Restore a selected hidden span, or the hidden block adjoining a visible selection. */
function indexesToUnhide(sheet: Sheet, span: AxisSpan): number[] {
  const hidden = span.axis === "row" ? sheet.hiddenRows : sheet.hiddenColumns;
  if (!hidden?.size) return [];
  const end = span.index + span.count - 1;
  const indexes = [...hidden].filter((index) => index >= span.index && index <= end);
  if (indexes.length) return indexes;
  for (let index = span.index - 1; index >= 0 && hidden.has(index); index--) indexes.push(index);
  for (let index = end + 1; index < axisMaximum(span.axis) && hidden.has(index); index++)
    indexes.push(index);
  return indexes;
}

export function createAxisToolActions(options: {
  getSheet: () => Sheet;
  getEvaluator: () => SheetEvaluator;
  getLocale: () => string;
  getDateSystem: () => ExcelDateSystem;
  getCellStyle?: (address: CellAddress, cell: Readonly<Cell>) => Readonly<CellStyle> | undefined;
  getTheme?: () => WorkbookTheme | undefined;
  /** Workbook/session ownership and document edits cancel a delayed AutoFit. */
  getGeneration?: () => unknown;
  getRevision?: () => unknown;
  measurer: TextMeasurer;
  flushPendingEdits: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  onError: () => void;
}) {
  let actionVersion = 0;

  function run(create: (sheet: Sheet) => WorkbookCommand | undefined): void {
    actionVersion++;
    if (!options.flushPendingEdits()) return;
    try {
      const command = create(options.getSheet());
      if (command) options.execute(command);
    } catch {
      options.onError();
    }
  }

  function resize(payload: AxisSpan & { size: number }): void {
    run((sheet) =>
      createResizeSheetDimensionsCommand(
        sheet.id,
        payload.axis,
        indexesForSpan(payload),
        payload.size,
      ),
    );
  }

  async function autoFit(payload: { axis: SheetDimensionAxis; range: CellRange }): Promise<void> {
    const version = ++actionVersion;
    if (!options.flushPendingEdits()) return;
    let isCurrent: (() => boolean) | undefined;
    try {
      const sheet = options.getSheet();
      const sheetId = sheet.id;
      const generation = options.getGeneration?.();
      const revision = options.getRevision?.();
      const axis = payload.axis;
      isCurrent = () =>
        version === actionVersion &&
        options.getSheet() === sheet &&
        options.getSheet().id === sheetId &&
        Object.is(options.getGeneration?.(), generation) &&
        Object.is(options.getRevision?.(), revision);
      // The ribbon sizes whole axes, including cells outside the selection's other dimension.
      const range: CellRange =
        axis === "row"
          ? {
              start: { row: payload.range.start.row, column: 0 },
              end: { row: payload.range.end.row, column: MAX_SHEET_COLUMNS - 1 },
            }
          : {
              start: { row: 0, column: payload.range.start.column },
              end: { row: MAX_SHEET_ROWS - 1, column: payload.range.end.column },
            };
      const createInput = (currentSheet: Sheet): AxisAutoFitInput => {
        const theme = options.getTheme?.();
        const locale = options.getLocale();
        const dateSystem = options.getDateSystem();
        return {
          sheet: currentSheet,
          range,
          getComputedValue: options.getEvaluator().getComputedValue,
          getCellStyle: (address, cell) => {
            const style = options.getCellStyle ? options.getCellStyle(address, cell) : cell.style;
            if (theme && (style?.fontTheme || !style?.fontFamily))
              return {
                ...style,
                fontFamily: resolveThemeFontFamily(theme, style?.fontTheme ?? "minor"),
              };
            return style;
          },
          formatPresentation: (_address, cell, value) =>
            getCellValuePresentationForGrid(value, cell.style, locale, dateSystem, cell.content),
          measurer: options.measurer,
        };
      };
      const initialInput = createInput(sheet);
      const families = new Set(
        [...getAxisAutoFitFontFamilies(initialInput, axis)].flatMap(getCellFontResourceFamilies),
      );
      const pending = [...families].filter(cellFontResourceNeedsLoading);
      let input = initialInput;
      if (pending.length) {
        await Promise.all(pending.map((family) => ensureCellFontResource(family)));
        if (!isCurrent()) return;
        // Never execute a command captured before font loading or against a new owner.
        input = createInput(options.getSheet());
      }
      const sizes = axis === "row" ? getAutoFitRowHeights(input) : getAutoFitColumnWidths(input);
      if (sizes.size && isCurrent())
        options.execute(
          createSetSheetDimensionSizesCommand(
            sheetId,
            axis,
            [...sizes].map(([index, size]) => ({ index, size })),
          ),
        );
    } catch {
      if (!isCurrent || isCurrent()) options.onError();
    }
  }

  function standardWidth(payload: { size: number }): void {
    run((sheet) => createSetSheetDefaultColumnWidthCommand(sheet.id, payload.size));
  }

  function visibility(payload: AxisSpan & { hidden: boolean }): void {
    run((sheet) => {
      validateSpan(payload);
      const indexes = payload.hidden ? indexesForSpan(payload) : indexesToUnhide(sheet, payload);
      if (!indexes.length) return undefined;
      if (payload.hidden) {
        const hidden = payload.axis === "row" ? sheet.hiddenRows : sheet.hiddenColumns;
        const additional = indexes.filter((index) => !hidden?.has(index)).length;
        if ((hidden?.size ?? 0) + additional >= axisMaximum(payload.axis)) {
          throw new RangeError("At least one row and column must remain visible.");
        }
      }
      return createSetSheetDimensionHiddenCommand(sheet.id, payload.axis, indexes, payload.hidden);
    });
  }

  return { resize, autoFit, standardWidth, visibility };
}
