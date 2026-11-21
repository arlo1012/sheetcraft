import { columnIndexToLabel } from "@sheetcraft/core/coordinates";
import type { SheetDimensionAxis } from "@sheetcraft/core/workbook";
import type { SelectionMode } from "@sheetcraft/sheet-engine/selection";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import { createCanvasPixelGrid } from "../../../shared/canvas/pixel-grid";
import type { HeaderPane, SheetRenderFrame } from "./sheet-render-frame";
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

type AxisPaintMetrics = Readonly<{
  normalFont: string;
  selectedFont: string;
  separatorWidth: number;
  selectedWidth: number;
  rowLabelStart: number;
  rowLabelWidth: number;
  columnLabelStart: number;
  columnLabelHeight: number;
  fillUnselectedBackground: boolean;
}>;

function paintAxisHeaders(
  context: CanvasRenderingContext2D,
  axis: SheetDimensionAxis,
  panes: readonly HeaderPane[],
  state: HeaderPaintState,
  pixelGrid: ReturnType<typeof createCanvasPixelGrid>,
  metrics: AxisPaintMetrics,
): void {
  const { palette, quickTools, selection, hovered, focused, frame } = state;
  const isRow = axis === "row";
  const fixedSize = isRow ? metrics.rowLabelWidth : metrics.columnLabelHeight;
  if (fixedSize <= 0) return;
  const fixedStart = isRow ? metrics.rowLabelStart : metrics.columnLabelStart;
  const fixedEnd = fixedStart + fixedSize;
  const snappedFixedStart = isRow ? pixelGrid.snapX(fixedStart) : pixelGrid.snapY(fixedStart);
  const snappedFixedEnd = isRow ? pixelGrid.snapX(fixedEnd) : pixelGrid.snapY(fixedEnd);
  const snappedAccentStart = snappedFixedEnd - metrics.selectedWidth;
  const halfSeparator = metrics.separatorWidth / 2;
  const gutter = quickTools.gutter;

  for (const pane of panes) {
    if (pane.clip.width <= 0 || pane.clip.height <= 0 || pane.items.length === 0) continue;
    context.save();
    clip(context, pixelGrid.snapRect(pane.clip));

    // Pass 1: Backgrounds (skip unselected when default background was already painted).
    let lastBgFill = "";
    for (const item of pane.items) {
      if (item.size <= 0) continue;
      const axisSelected = isAxisSelected(axis, item.index, selection);
      const selected = isInSelectionRange(axis, item.index, selection);
      if (!axisSelected && !selected && !metrics.fillUnselectedBackground) continue;
      const fill = axisSelected
        ? palette.actionFocus
        : selected
          ? palette.actionSubtle
          : palette.background;
      if (fill !== lastBgFill) {
        context.fillStyle = fill;
        lastBgFill = fill;
      }
      if (isRow) context.fillRect(fixedStart, item.offset, fixedSize, item.size);
      else context.fillRect(item.offset, fixedStart, item.size, fixedSize);
    }

    // Pass 2: Header text labels with minimal font & fillStyle switches.
    context.textAlign = "center";
    context.textBaseline = "middle";
    let lastFont = "";
    let lastTextFill = "";
    const fixedMid = fixedStart + fixedSize / 2;
    for (const item of pane.items) {
      if (item.size <= 0) continue;
      const axisSelected = isAxisSelected(axis, item.index, selection);
      const selected = isInSelectionRange(axis, item.index, selection);
      const font = axisSelected ? metrics.selectedFont : metrics.normalFont;
      if (font !== lastFont) {
        context.font = font;
        lastFont = font;
      }
      const textFill = selected ? palette.action : palette.mutedText;
      if (textFill !== lastTextFill) {
        context.fillStyle = textFill;
        lastTextFill = textFill;
      }
      const label = isRow ? String(item.index + 1) : columnIndexToLabel(item.index);
      const itemMid = item.offset + item.size / 2;
      if (isRow) context.fillText(label, fixedMid, itemMid);
      else context.fillText(label, itemMid, fixedMid);
    }

    // Pass 3: Batched separator lines in a single stroke call per pane.
    context.beginPath();
    context.strokeStyle = palette.subtleBorder;
    context.lineWidth = metrics.separatorWidth;
    for (const item of pane.items) {
      if (item.size <= 0) continue;
      if (isRow) {
        const y = pixelGrid.strokeY(
          item.offset + item.size - halfSeparator,
          metrics.separatorWidth,
        );
        context.moveTo(snappedFixedStart, y);
        context.lineTo(snappedFixedEnd, y);
      } else {
        const x = pixelGrid.strokeX(
          item.offset + item.size - halfSeparator,
          metrics.separatorWidth,
        );
        context.moveTo(x, snappedFixedStart);
        context.lineTo(x, snappedFixedEnd);
      }
    }
    context.stroke();

    // Pass 4: Selection edge bars, revealed quick-tools, and keyboard focus ring.
    let accentFillSet = false;
    for (const item of pane.items) {
      if (item.size <= 0) continue;
      const selected = isInSelectionRange(axis, item.index, selection);
      if (selected) {
        if (!accentFillSet) {
          context.fillStyle = palette.action;
          accentFillSet = true;
        }
        if (isRow) {
          context.fillRect(snappedAccentStart, item.offset, metrics.selectedWidth, item.size);
        } else {
          context.fillRect(item.offset, snappedAccentStart, item.size, metrics.selectedWidth);
        }
      }
      const revealed = quickTools.enabled && isRevealedItem(axis, item.index, hovered, focused);
      if (revealed) {
        accentFillSet = false;
        const gripX = isRow ? frame.headingOrigin.x + gutter / 2 : item.offset + item.size / 2;
        const gripY = isRow ? item.offset + item.size / 2 : frame.headingOrigin.y + gutter / 2;
        paintGripIcon(
          context,
          gripX,
          gripY,
          !isRow,
          selected ? palette.action : palette.mutedText,
          frame.scale,
        );
        const hoverIsBoundary = hovered?.axis === axis && hovered.action === "quickInsert";
        if (shouldShowBoundary(axis, item.index, true, selection)) {
          paintPlus(
            context,
            isRow ? frame.headingOrigin.x + gutter / 2 : item.offset,
            isRow ? item.offset : frame.headingOrigin.y + gutter / 2,
            palette,
            hoverIsBoundary && hovered?.index === item.index,
            pixelGrid,
          );
        }
        if (shouldShowBoundary(axis, item.index, false, selection)) {
          paintPlus(
            context,
            isRow ? frame.headingOrigin.x + gutter / 2 : item.offset + item.size,
            isRow ? item.offset + item.size : frame.headingOrigin.y + gutter / 2,
            palette,
            hoverIsBoundary && hovered?.index === item.index + 1,
            pixelGrid,
          );
        }
      }
      if (isFocusedItem(focused, axis, item.index)) {
        accentFillSet = false;
        const rect = isRow
          ? { x: fixedStart, y: item.offset, width: fixedSize, height: item.size }
          : { x: item.offset, y: fixedStart, width: item.size, height: fixedSize };
        paintFocus(context, rect, palette, pixelGrid);
      }
    }
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
  const rowLabelInset = quickTools.gutter + (quickTools.rowOutlineGutter ?? 0);
  const columnLabelInset = quickTools.gutter + (quickTools.columnOutlineGutter ?? 0);
  const rowLabelStart = frame.headingOrigin.x + rowLabelInset;
  const columnLabelStart = frame.headingOrigin.y + columnLabelInset;
  const separatorWidth = pixelGrid.screenStrokeWidth(1);
  const metrics: AxisPaintMetrics = {
    normalFont: palette.font,
    selectedFont: palette.font.replace(/^400/, "500"),
    separatorWidth,
    selectedWidth: pixelGrid.screenStrokeWidth(2),
    rowLabelStart,
    rowLabelWidth: Math.max(0, frame.headingSize.width - rowLabelInset - 1),
    columnLabelStart,
    columnLabelHeight: Math.max(0, frame.headingSize.height - columnLabelInset - 1),
    fillUnselectedBackground: Boolean(state.backdrop),
  };
  context.save();
  context.fillStyle = state.backdrop ?? palette.background;
  context.fillRect(0, 0, width, frame.headerSize.height);
  context.fillRect(0, 0, frame.headerSize.width, height);
  paintAxisHeaders(context, "column", frame.columnHeaders, state, pixelGrid, metrics);
  paintAxisHeaders(context, "row", frame.rowHeaders, state, pixelGrid, metrics);

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
