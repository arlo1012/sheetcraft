import type { Cell, CellAddress, CellRange, Sheet, SheetEvaluator } from "@idea10/core/workbook";
import type { ExcelDateSystem } from "@idea10/core/formula";
import type { CellStyle } from "@idea10/core/style";
import type { FrozenPaneId } from "@idea10/sheet-engine/frozen-layout";
import type { Rect } from "@idea10/sheet-engine/geometry";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { TextMeasurer } from "@idea10/sheet-engine/text-layout";
import { layoutCellText, type CellTextLayout } from "../../../shared/cell-text/text-presentation";
import { getCellValuePresentationForGrid } from "../cell-value-presentation";
import { createCellTextSpanResolver, type CellTextSpan } from "../cell-text-spans";

export const SHEET_PANE_IDS = ["topLeft", "top", "left", "body"] as const;

export type CanvasCellContent = {
  text: string;
  style: Readonly<CellStyle> | undefined;
  textLayout?: CellTextLayout;
  image?: Extract<NonNullable<Cell["content"]>, { kind: "image" }>["image"];
};

export type CanvasCell = {
  address: CellAddress;
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
  sheet: Sheet;
  evaluator: SheetEvaluator;
  locale: string;
  dateSystem: ExcelDateSystem;
  fontRevision: number;
};

type CachedContent = {
  cell: Cell | undefined;
  source: Cell | undefined;
  width: number;
  height: number;
  evaluator: SheetEvaluator | undefined;
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
      previous?.sheet !== options.sheet ||
      previous.locale !== options.locale ||
      previous.dateSystem !== options.dateSystem ||
      previous.fontRevision !== options.fontRevision
    ) {
      contents.clear();
    }
    if (
      !previous ||
      previous.sheet !== options.sheet ||
      previous.evaluator !== options.evaluator ||
      previousMerges !== options.sheet.mergedCells ||
      previousColumnCount !== columnCount
    ) {
      spans = createCellTextSpanResolver(
        options.sheet,
        (address) => Boolean(layout.getMergedRangeAt(address)),
        columnCount,
      );
    }
    previous = options;
    previousMerges = options.sheet.mergedCells;
    previousColumnCount = columnCount;
  }

  function getContent(address: CellAddress, rect: Rect, span?: CellTextSpan): CanvasCellContent {
    const options = previous!;
    const key = `${address.row}:${address.column}`;
    const cell = options.sheet.cells.get(key);
    const sourceAddress = span?.kind === "fill" ? span.source : address;
    const source = options.sheet.cells.get(`${sourceAddress.row}:${sourceAddress.column}`);
    const formulaEvaluator = source?.content?.kind === "formula" ? options.evaluator : undefined;
    const cached = contents.get(key);
    if (
      cached &&
      cached.cell === cell &&
      cached.source === source &&
      cached.width === rect.width &&
      cached.height === rect.height &&
      cached.evaluator === formulaEvaluator
    ) {
      return cached.content;
    }
    const image = cell?.content?.kind === "image" ? cell.content.image : undefined;
    const value = image ? null : options.evaluator.getComputedValue(sourceAddress);
    const presentation = getCellValuePresentationForGrid(
      value,
      cell?.style,
      options.locale,
      options.dateSystem,
    );
    const style = presentation.color
      ? { ...cell?.style, textColor: presentation.color }
      : cell?.style;
    const content: CanvasCellContent = {
      text: presentation.text,
      style,
      ...(image ? { image } : {}),
      ...(presentation.text
        ? {
            textLayout: layoutCellText({
              text: presentation.text,
              value,
              style,
              fill: presentation.fill,
              width: Math.max(0, rect.width - 1),
              height: Math.max(0, rect.height - 1),
              measurer,
            }),
          }
        : {}),
    };
    contents.set(key, {
      cell,
      source,
      width: rect.width,
      height: rect.height,
      evaluator: formulaEvaluator,
      content,
    });
    return content;
  }

  function retain(keys: ReadonlySet<string>): void {
    for (const key of contents.keys()) if (!keys.has(key)) contents.delete(key);
  }

  return { prepare, getContent, getSpan: (address: CellAddress) => spans(address), retain };
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
          : { x: column.offset, y: row.offset, width: column.size, height: row.size };
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
          rect,
          contentRect,
          content: cache.getContent(source, contentRect, span),
          style: options.sheet.cells.get(key)?.style,
          span,
        });
      }
    }
    return { id, cells };
  });
  cache.retain(retained);
  return { panes };
}
