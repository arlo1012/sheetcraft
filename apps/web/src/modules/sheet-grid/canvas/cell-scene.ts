import { getSparklineValues, type CellSparkline } from "@sheetcraft/core/sparklines";
import type { Cell, CellAddress, CellRange } from "@sheetcraft/core/workbook";
import type { CellTextFontRun } from "@sheetcraft/core/formula";
import type { ExcelDateSystem, FormulaValue } from "@sheetcraft/core/formula";
import type { CellStyle } from "@sheetcraft/core/style";
import type { ConditionalFormatVisual } from "@sheetcraft/core/conditional-formatting";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { TextMeasurer } from "@sheetcraft/sheet-engine/text-layout";
import { layoutCellText, type CellTextLayout } from "../../../shared/cell-text/text-presentation";
import { getCellValuePresentationForGrid } from "../cell-value-presentation";
import { createCellTextSpanResolver, type CellTextSpan } from "../cell-text-spans";
import type { SheetDisplaySnapshot } from "./sheet-display-snapshot";
import { getConditionalFormatIconSlot } from "../../../shared/conditional-formatting/conditional-format-painter";

export const SHEET_PANE_IDS = ["topLeft", "top", "left", "body"] as const;

export type CanvasCellContent = {
  sparkline?: { definition: CellSparkline; values: Array<number | null> };
  text: string;
  fontRuns?: readonly CellTextFontRun[];
  fontProjectionUnavailable?: true;
  style: Readonly<CellStyle> | undefined;
  textLayout?: CellTextLayout;
  image?: Extract<NonNullable<Cell["content"]>, { kind: "image" }>["image"];
  conditionalFormatVisual?: ConditionalFormatVisual;
};

export type CanvasCell = {
  address: CellAddress;
  hasNote: boolean;
  /** Sheet coordinates, before a pane's scroll transform. */
  rect: Rect;
  contentRect: Rect;
  content: CanvasCellContent;
  style: Readonly<CellStyle> | undefined;
  span?: CellTextSpan;
};

export type SheetCanvasScene = {
  panes: Array<{ id: FrozenPaneId; cells: CanvasCell[] }>;
};

type PresentationOptions = {
  display: SheetDisplaySnapshot;
  locale: string;
  dateSystem: ExcelDateSystem;
  fontRevision: number;
};

type CachedContent = {
  cell: Cell | undefined;
  source: Cell | undefined;
  width: number;
  height: number;
  display?: SheetDisplaySnapshot;
  spillRoot?: CellAddress;
  spillValue?: FormulaValue;
  content: CanvasCellContent;
};

/** Display formatting and text wrapping survive scrolling and selection changes. */
export function createCellPresentationCache(measurer: TextMeasurer) {
  const contents = new Map<string, CachedContent>();
  let previous: PresentationOptions | undefined;
  let spans: ReturnType<typeof createCellTextSpanResolver>;
  let previousMerges: readonly CellRange[] | undefined;
  let previousColumnCount = 0;

  function prepare(options: PresentationOptions, layout: SheetViewportLayout, columnCount: number) {
    if (
      previous?.display.sheet !== options.display.sheet ||
      previous.locale !== options.locale ||
      previous.dateSystem !== options.dateSystem ||
      previous.fontRevision !== options.fontRevision
    ) {
      contents.clear();
    }
    if (
      !previous ||
      previous.display !== options.display ||
      previous.display.sheet !== options.display.sheet ||
      previousMerges !== options.display.sheet.mergedCells ||
      previousColumnCount !== columnCount
    ) {
      spans = createCellTextSpanResolver(
        options.display.sheet,
        (address) => Boolean(layout.getMergedRangeAt(address)),
        columnCount,
        (address) =>
          Boolean(options.display.sheet.cells.get(`${address.row}:${address.column}`)?.content) ||
          Boolean(options.display.getSpill(address)),
      );
    }
    previous = options;
    previousMerges = options.display.sheet.mergedCells;
    previousColumnCount = columnCount;
  }

  function getContent(address: CellAddress, rect: Rect, span?: CellTextSpan): CanvasCellContent {
    const options = previous!;
    const key = `${address.row}:${address.column}`;
    const cell = options.display.sheet.cells.get(key);
    const spill = options.display.getSpill(address);
    const sourceAddress = span?.kind === "fill" ? span.source : (spill?.root ?? address);
    const source = options.display.sheet.cells.get(`${sourceAddress.row}:${sourceAddress.column}`);
    const formulaEvaluator =
      source?.sparkline ||
      source?.content?.kind === "formula" ||
      spill ||
      options.display.sheet.duplicateRules?.length ||
      options.display.sheet.conditionalFormats?.length ||
      options.display.sheet.tables?.length
        ? options.display
        : undefined;
    const cached = contents.get(key);
    if (
      cached &&
      cached.cell === cell &&
      cached.source === source &&
      cached.width === rect.width &&
      cached.height === rect.height &&
      cached.display === formulaEvaluator &&
      cached.spillRoot?.row === spill?.root.row &&
      cached.spillRoot?.column === spill?.root.column &&
      cached.spillValue === spill?.value
    ) {
      return cached.content;
    }
    const displayCell = cell ?? source;
    const image = displayCell?.content?.kind === "image" ? displayCell.content.image : undefined;
    const value = image ? null : (spill?.value ?? options.display.getComputedValue(sourceAddress));
    // A spill projection inherits the root's persisted style, but its display-only
    // rules resolve against the projected address and value.
    const styleAddress = spill ? address : cell ? address : sourceAddress;
    const displayStyle = options.display.getCellStyle(styleAddress);
    const presentation = getCellValuePresentationForGrid(
      value,
      displayStyle,
      options.locale,
      options.dateSystem,
      source?.content,
    );
    const style = presentation.color
      ? { ...displayStyle, textColor: presentation.color }
      : displayStyle;
    const conditionalFormatVisual = options.display.getConditionalFormatVisual(
      spill ? address : sourceAddress,
    );
    const hideValue =
      conditionalFormatVisual?.dataBar?.showValue === false ||
      conditionalFormatVisual?.iconSet?.showValue === false;
    const iconSlot = getConditionalFormatIconSlot(rect, conditionalFormatVisual);
    const textWidth = Math.max(0, rect.width - 1 - iconSlot);
    const content: CanvasCellContent = {
      text: hideValue ? "" : presentation.text,
      ...(!hideValue && presentation.fontRuns ? { fontRuns: presentation.fontRuns } : {}),
      ...(!hideValue && presentation.fontProjectionUnavailable
        ? { fontProjectionUnavailable: true as const }
        : {}),
      style,
      ...(conditionalFormatVisual ? { conditionalFormatVisual } : {}),
      ...(image ? { image } : {}),
      ...(displayCell?.sparkline
        ? {
            sparkline: {
              definition: displayCell.sparkline,
              values: getSparklineValues(
                options.display.sheet,
                displayCell.sparkline,
                options.display.evaluator,
              ),
            },
          }
        : {}),
      ...(presentation.text && !hideValue
        ? {
            textLayout: (() => {
              const textLayout = layoutCellText({
                text: presentation.text,
                value,
                style,
                fill: presentation.fill,
                fontRuns: presentation.fontRuns,
                fillFontRuns: presentation.fillFontRuns,
                width: textWidth,
                height: Math.max(0, rect.height - 1),
                measurer,
              });
              return iconSlot ? { ...textLayout, x: textLayout.x + iconSlot } : textLayout;
            })(),
          }
        : {}),
    };
    contents.set(key, {
      cell,
      source,
      width: rect.width,
      height: rect.height,
      display: formulaEvaluator,
      ...(spill ? { spillRoot: { ...spill.root }, spillValue: spill.value } : {}),
      content,
    });
    return content;
  }

  function getSpan(address: CellAddress): CellTextSpan | undefined {
    const options = previous!;
    return options.display.getSpill(address) ? undefined : spans(address);
  }

  function retain(keys: ReadonlySet<string>): void {
    for (const key of contents.keys()) if (!keys.has(key)) contents.delete(key);
  }

  return { prepare, getContent, getSpan, retain };
}

export type CellPresentationCache = ReturnType<typeof createCellPresentationCache>;

/** Only row/column membership invalidates the scene; pixel scrolling is a paint transform. */
export function getCanvasViewportKey(layout: SheetViewportLayout): string {
  return SHEET_PANE_IDS.map((id) => {
    const pane = layout.panes[id];
    return `${pane.rows.map((row) => row.index).join(",")}/${pane.columns.map((column) => column.index).join(",")}`;
  }).join(";");
}

function getPaneRange(range: CellRange, id: FrozenPaneId, layout: SheetViewportLayout): CellRange {
  const frozenRows = id === "topLeft" || id === "top";
  const frozenColumns = id === "topLeft" || id === "left";
  return {
    start: {
      row: frozenRows ? range.start.row : Math.max(range.start.row, layout.freeze.rows),
      column: frozenColumns
        ? range.start.column
        : Math.max(range.start.column, layout.freeze.columns),
    },
    end: {
      row: frozenRows ? Math.min(range.end.row, layout.freeze.rows - 1) : range.end.row,
      column: frozenColumns
        ? Math.min(range.end.column, layout.freeze.columns - 1)
        : range.end.column,
    },
  };
}

export function createSheetCanvasScene(
  options: PresentationOptions & {
    layout: SheetViewportLayout;
    columnCount: number;
    cache: CellPresentationCache;
  },
): SheetCanvasScene {
  const { layout, cache } = options;
  cache.prepare(options, layout, options.columnCount);
  const retained = new Set<string>();
  const panes = SHEET_PANE_IDS.map((id) => {
    const cells: CanvasCell[] = [];
    const visited = new Set<string>();
    const pane = layout.panes[id];
    for (const row of pane.rows) {
      for (const column of pane.columns) {
        const address = { row: row.index, column: column.index };
        const merged = layout.getMergedRangeAt(address);
        const anchor = merged?.start ?? address;
        const key = `${anchor.row}:${anchor.column}`;
        if (visited.has(key)) continue;
        visited.add(key);
        retained.add(key);
        const rect = merged
          ? layout.getRangeRect(getPaneRange(merged, id, layout))
          : {
              x: column.offset,
              y: row.offset,
              width: column.size,
              height: row.size,
            };
        if (!rect) continue;
        const span = merged ? undefined : cache.getSpan(anchor);
        const contentRect =
          (merged
            ? layout.getRangeRect(merged)
            : span?.kind === "centerContinuous"
              ? layout.getRangeRect(span.range)
              : rect) ?? rect;
        const source = span?.kind === "centerContinuous" ? span.source : anchor;
        retained.add(`${source.row}:${source.column}`);
        cells.push({
          address: anchor,
          hasNote: Boolean(options.display.sheet.cells.get(key)?.note),
          rect,
          contentRect,
          content: cache.getContent(source, contentRect, span),
          style: options.display.getCellStyle(anchor),
          span,
        });
      }
    }
    return { id, cells };
  });
  cache.retain(retained);
  return { panes };
}
