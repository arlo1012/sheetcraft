import { columnIndexToLabel } from "@idea10/core/coordinates";
import type { SheetDimensionAxis } from "@idea10/core/workbook";
import type { SelectionMode } from "@idea10/sheet-engine/selection";
import type { Rect } from "@idea10/sheet-engine/geometry";
import { createCanvasPixelGrid } from "../../../shared/canvas/pixel-grid";
import type { HeaderItem, HeaderPane, SheetRenderFrame } from "./sheet-render-frame";
import { paintGripIcon } from "./grip-painter";

export type HeaderFocus = Readonly<{
  axis: SheetDimensionAxis | "corner";
  index?: number;
  action: "axis" | "resize" | "quickInsert" | "grip" | "corner";
}>;

export type HeaderHit = HeaderFocus &
  Readonly<{
    /** The item that owns a boundary control.  This keeps quick tools visible while crossing it. */
    ownerIndex?: number;
  }>;

export type HeaderSelectionState = Readonly<{
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  mode: SelectionMode;
  activeRow?: number;
  activeColumn?: number;
}>;

export type HeaderQuickToolsState = Readonly<{
  /** Whether controls can be used; dragging may temporarily disable them. */
  enabled: boolean;
  /** Reserved layout space, independent of the current interaction state. */
  gutter: number;
  /** Outline controls occupy a separate lane before the fixed-width row labels. */
  rowOutlineGutter?: number;
  /** Column outline tracks sit above the fixed-height column labels. */
  columnOutlineGutter?: number;
}>;

/** Colors and text metrics read once by the surface from its computed style. */
export type SheetHeaderPalette = Readonly<{
  background: string;
  hover: string;
  border: string;
  subtleBorder: string;
  text: string;
  mutedText: string;
  cornerText: string;
  action: string;
  actionSubtle: string;
  actionFocus: string;
  panel: string;
  font: string;
}>;

export const DEFAULT_SHEET_HEADER_PALETTE: SheetHeaderPalette = {
  background: "#f5f6f7",
  hover: "#eceef0",
  border: "#dcdfe4",
  subtleBorder: "#e7e9ed",
  text: "#24272b",
  mutedText: "#60656d",
  cornerText: "#60656d",
  action: "#0052d9",
  actionSubtle: "#e8f0ff",
  actionFocus: "#dce8ff",
  panel: "#ffffff",
  font: "400 12px system-ui, sans-serif",
};

export type HeaderPaintState = Readonly<{
  frame: SheetRenderFrame;
  selection: HeaderSelectionState;
  quickTools: HeaderQuickToolsState;
  hovered?: HeaderHit;
  focused?: HeaderFocus;
  palette: SheetHeaderPalette;
  /** Separated paper keeps non-heading space on the desktop backdrop. */
  backdrop?: string;
}>;

function isAxisSelected(
  axis: SheetDimensionAxis,
  index: number,
  selection: HeaderSelectionState,
): boolean {
  if (selection.mode !== "all" && selection.mode !== (axis === "row" ? "rows" : "columns")) {
    return false;
  }
  const start = axis === "row" ? selection.startRow : selection.startColumn;
  const end = axis === "row" ? selection.endRow : selection.endColumn;
  return index >= start && index <= end;
}

function isInSelectionRange(
  axis: SheetDimensionAxis,
  index: number,
  selection: HeaderSelectionState,
): boolean {
  const start = axis === "row" ? selection.startRow : selection.startColumn;
  const end = axis === "row" ? selection.endRow : selection.endColumn;
  return index >= start && index <= end;
}

function isFocusedItem(
  focused: HeaderFocus | undefined,
  axis: SheetDimensionAxis,
  index: number,
): boolean {
  return focused?.axis === axis && focused.index === index;
}

function isRevealedItem(
  axis: SheetDimensionAxis,
  index: number,
  hovered: HeaderHit | undefined,
  focused: HeaderFocus | undefined,
): boolean {
  return (
    (hovered?.axis === axis && (hovered.ownerIndex ?? hovered.index) === index) ||
    (focused?.axis === axis && focused.index === index)
  );
}

function clip(context: CanvasRenderingContext2D, rect: Rect): void {
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
}

function paintPlus(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  palette: SheetHeaderPalette,
  active: boolean,
  pixelGrid: ReturnType<typeof createCanvasPixelGrid>,
): void {
  context.save();
  context.beginPath();
  context.arc(x, y, active ? 7 : 3, 0, Math.PI * 2);
  context.fillStyle = active ? palette.action : palette.panel;
  context.fill();
  context.strokeStyle = active ? palette.action : palette.border;
  context.lineWidth = pixelGrid.screenStrokeWidth(1);
  context.stroke();
  if (active) {
    context.strokeStyle = palette.panel;
    context.beginPath();
    context.moveTo(x - 3, y);
    context.lineTo(x + 3, y);
    context.moveTo(x, y - 3);
    context.lineTo(x, y + 3);
    context.stroke();
  }
  context.restore();
}

function paintFocus(
  context: CanvasRenderingContext2D,
  rect: Rect,
  palette: SheetHeaderPalette,
  pixelGrid: ReturnType<typeof createCanvasPixelGrid>,
): void {
  context.save();
  context.strokeStyle = palette.action;
  const width = pixelGrid.screenStrokeWidth(2);
  const left = pixelGrid.strokeX(rect.x + 1, width);
  const top = pixelGrid.strokeY(rect.y + 1, width);
  context.lineWidth = width;
  context.strokeRect(
    left,
    top,
    Math.max(0, pixelGrid.strokeX(rect.x + rect.width - 1, width) - left),
    Math.max(0, pixelGrid.strokeY(rect.y + rect.height - 1, width) - top),
  );
  context.restore();
}

function shouldShowBoundary(
  axis: SheetDimensionAxis,
  index: number,
  before: boolean,
  selection: HeaderSelectionState,
): boolean {
  // An all-sheet selection is highlighted in both axes but does not collapse
  // per-item insertion affordances into the sheet's outer boundaries.
  if (selection.mode !== (axis === "row" ? "rows" : "columns")) return true;
  if (!isAxisSelected(axis, index, selection)) return true;
  const start = axis === "row" ? selection.startRow : selection.startColumn;
  const end = axis === "row" ? selection.endRow : selection.endColumn;
  return before ? index === start : index === end;
}

function paintAxisItem(
  context: CanvasRenderingContext2D,
  axis: SheetDimensionAxis,
  item: HeaderItem,
  frame: SheetRenderFrame,
  state: HeaderPaintState,
  pixelGrid: ReturnType<typeof createCanvasPixelGrid>,
): void {
  const { palette, quickTools, selection, hovered, focused } = state;
  const gutter = quickTools.gutter;
  const rowLabelInset = gutter + (quickTools.rowOutlineGutter ?? 0);
  const columnLabelInset = gutter + (quickTools.columnOutlineGutter ?? 0);
  const rowLabelStart = frame.headingOrigin.x + rowLabelInset;
  const columnLabelStart = frame.headingOrigin.y + columnLabelInset;
  const rect =
    axis === "row"
      ? {
          x: rowLabelStart,
          y: item.offset,
          width: Math.max(0, frame.headingSize.width - rowLabelInset - 1),
          height: item.size,
        }
      : {
          x: item.offset,
          y: columnLabelStart,
          width: item.size,
          height: Math.max(0, frame.headingSize.height - columnLabelInset - 1),
        };
  if (rect.width <= 0 || rect.height <= 0) return;
  const axisSelected = isAxisSelected(axis, item.index, selection);
  const selected = isInSelectionRange(axis, item.index, selection);
  context.fillStyle = axisSelected
    ? palette.actionFocus
    : selected
      ? palette.actionSubtle
      : palette.background;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.fillStyle = selected ? palette.action : palette.mutedText;
  context.font = axisSelected ? state.palette.font.replace(/^400/, "500") : state.palette.font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    axis === "row" ? String(item.index + 1) : columnIndexToLabel(item.index),
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
  );
  context.beginPath();
  context.strokeStyle = palette.subtleBorder;
  const separatorWidth = pixelGrid.screenStrokeWidth(1);
  context.lineWidth = separatorWidth;
  if (axis === "row") {
    const y = pixelGrid.strokeY(item.offset + item.size - separatorWidth / 2, separatorWidth);
    context.moveTo(pixelGrid.snapX(rect.x), y);
    context.lineTo(pixelGrid.snapX(rect.x + rect.width), y);
  } else {
    const x = pixelGrid.strokeX(item.offset + item.size - separatorWidth / 2, separatorWidth);
    context.moveTo(x, pixelGrid.snapY(rect.y));
    context.lineTo(x, pixelGrid.snapY(rect.y + rect.height));
  }
  context.stroke();
  if (selected) {
    context.fillStyle = palette.action;
    const selectedWidth = pixelGrid.screenStrokeWidth(2);
    if (axis === "row") {
      context.fillRect(
        pixelGrid.snapX(rect.x + rect.width) - selectedWidth,
        rect.y,
        selectedWidth,
        rect.height,
      );
    } else {
      context.fillRect(
        rect.x,
        pixelGrid.snapY(rect.y + rect.height) - selectedWidth,
        rect.width,
        selectedWidth,
      );
    }
  }

  const revealed = quickTools.enabled && isRevealedItem(axis, item.index, hovered, focused);
  if (revealed) {
    const gripX = axis === "row" ? frame.headingOrigin.x + gutter / 2 : item.offset + item.size / 2;
    const gripY = axis === "row" ? item.offset + item.size / 2 : frame.headingOrigin.y + gutter / 2;
    paintGripIcon(
      context,
      gripX,
      gripY,
      axis === "column",
      selected ? palette.action : palette.mutedText,
      frame.scale,
    );
    const hoverIsBoundary = hovered?.axis === axis && hovered.action === "quickInsert";
    if (shouldShowBoundary(axis, item.index, true, selection)) {
      paintPlus(
        context,
        axis === "row" ? frame.headingOrigin.x + gutter / 2 : item.offset,
        axis === "row" ? item.offset : frame.headingOrigin.y + gutter / 2,
        palette,
        hoverIsBoundary && hovered?.index === item.index,
        pixelGrid,
      );
    }
    if (shouldShowBoundary(axis, item.index, false, selection)) {
      paintPlus(
        context,
        axis === "row" ? frame.headingOrigin.x + gutter / 2 : item.offset + item.size,
        axis === "row" ? item.offset + item.size : frame.headingOrigin.y + gutter / 2,
        palette,
        hoverIsBoundary && hovered?.index === item.index + 1,
        pixelGrid,
      );
    }
  }
  if (isFocusedItem(focused, axis, item.index)) paintFocus(context, rect, palette, pixelGrid);
}

function paintAxisHeaders(
  context: CanvasRenderingContext2D,
  axis: SheetDimensionAxis,
  panes: readonly HeaderPane[],
  state: HeaderPaintState,
  pixelGrid: ReturnType<typeof createCanvasPixelGrid>,
): void {
  for (const pane of panes) {
    if (pane.clip.width <= 0 || pane.clip.height <= 0) continue;
    context.save();
    clip(context, pixelGrid.snapRect(pane.clip));
    for (const item of pane.items)
      paintAxisItem(context, axis, item, state.frame, state, pixelGrid);
    context.restore();
  }
}

/** Paint the entire row/column heading surface from the same frame used by the body. */
export function paintSheetHeaders(
  context: CanvasRenderingContext2D,
  state: HeaderPaintState,
): void {
  const { frame, palette, quickTools, selection, focused, hovered } = state;
  const pixelGrid = createCanvasPixelGrid(context, frame.scale);
  const { width, height } = frame.size;
  context.save();
  context.fillStyle = state.backdrop ?? palette.background;
  context.fillRect(0, 0, width, frame.headerSize.height);
  context.fillRect(0, 0, frame.headerSize.width, height);
  paintAxisHeaders(context, "column", frame.columnHeaders, state, pixelGrid);
  paintAxisHeaders(context, "row", frame.rowHeaders, state, pixelGrid);

  const rowLabelInset = quickTools.gutter + (quickTools.rowOutlineGutter ?? 0);
  const columnLabelInset = quickTools.gutter + (quickTools.columnOutlineGutter ?? 0);
  const rowLabelStart = frame.headingOrigin.x + rowLabelInset;
  const columnLabelStart = frame.headingOrigin.y + columnLabelInset;
  const corner = {
    x: rowLabelStart,
    y: columnLabelStart,
    width: Math.max(0, frame.headingSize.width - rowLabelInset),
    height: Math.max(0, frame.headingSize.height - columnLabelInset),
  };
  context.fillStyle =
    selection.mode === "all"
      ? palette.actionFocus
      : hovered?.axis === "corner"
        ? palette.hover
        : (state.backdrop ?? palette.background);
  context.fillRect(corner.x, corner.y, corner.width, corner.height);
  context.strokeStyle = palette.border;
  const separatorWidth = pixelGrid.screenStrokeWidth(1);
  context.lineWidth = separatorWidth;
  if (!state.backdrop) {
    context.beginPath();
    const x = pixelGrid.strokeX(frame.headerSize.width - separatorWidth / 2, separatorWidth);
    const y = pixelGrid.strokeY(frame.headerSize.height - separatorWidth / 2, separatorWidth);
    context.moveTo(x, pixelGrid.snapY(corner.y));
    context.lineTo(x, pixelGrid.snapY(height));
    context.moveTo(pixelGrid.snapX(corner.x), y);
    context.lineTo(pixelGrid.snapX(width), y);
    context.stroke();
  }
  context.fillStyle = selection.mode === "all" ? palette.action : palette.cornerText;
  context.beginPath();
  const triangleRight = corner.x + corner.width - 7;
  const triangleBottom = corner.y + corner.height - 7;
  context.moveTo(triangleRight, triangleBottom - 8);
  context.lineTo(triangleRight, triangleBottom);
  context.lineTo(triangleRight - 8, triangleBottom);
  context.closePath();
  context.fill();
  if (focused?.axis === "corner") paintFocus(context, corner, palette, pixelGrid);
  context.restore();
}
