import type { Rect } from "@idea10/sheet-engine/geometry";
import type { SheetViewportRangeFragment } from "@idea10/sheet-engine/viewport-layout";
import type { SheetRenderFrame } from "./sheet-render-frame";
import type { FreezeHandleTarget, SheetOverlayPalette, SheetOverlayState } from "./overlay-types";

import { paintGripIcon } from "./grip-painter";

const BODY_PANES = ["topLeft", "top", "left", "body"] as const;

type Edge = "top" | "right" | "bottom" | "left";

function overlap(start: number, size: number, otherStart: number, otherSize: number): boolean {
  return otherStart < start + size && start < otherStart + otherSize;
}

function hasNeighbour(
  rect: Rect,
  fragments: readonly SheetViewportRangeFragment[],
  edge: Edge,
): boolean {
  return fragments.some(({ rect: other }) => {
    if (other === rect) return false;
    if (edge === "left")
      return (
        other.x + other.width === rect.x && overlap(rect.y, rect.height, other.y, other.height)
      );
    if (edge === "right")
      return rect.x + rect.width === other.x && overlap(rect.y, rect.height, other.y, other.height);
    if (edge === "top")
      return other.y + other.height === rect.y && overlap(rect.x, rect.width, other.x, other.width);
    return rect.y + rect.height === other.y && overlap(rect.x, rect.width, other.x, other.width);
  });
}

function withBodyFragment(
  context: CanvasRenderingContext2D,
  frame: SheetRenderFrame,
  fragment: SheetViewportRangeFragment,
  paint: () => void,
): void {
  const clip = frame.panes[fragment.paneId].clip;
  if (clip.width <= 0 || clip.height <= 0 || fragment.rect.width <= 0 || fragment.rect.height <= 0)
    return;
  context.save();
  context.translate(frame.body.x, frame.body.y);
  context.beginPath();
  context.rect(clip.x, clip.y, clip.width, clip.height);
  context.clip();
  paint();
  context.restore();
}

function paintRangeFill(
  context: CanvasRenderingContext2D,
  frame: SheetRenderFrame,
  fragments: readonly SheetViewportRangeFragment[],
  color: string,
  alpha: number,
): void {
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  for (const fragment of fragments) {
    withBodyFragment(context, frame, fragment, () => {
      const { x, y, width, height } = fragment.rect;
      context.fillRect(x, y, width, height);
    });
  }
  context.restore();
}

function paintRangeOutline(
  context: CanvasRenderingContext2D,
  frame: SheetRenderFrame,
  fragments: readonly SheetViewportRangeFragment[],
  color: string,
  width: number,
  dash?: readonly number[],
  dashOffset = 0,
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "square";
  context.setLineDash(dash ? [...dash] : []);
  context.lineDashOffset = dashOffset;
  for (const fragment of fragments) {
    const { rect } = fragment;
    withBodyFragment(context, frame, fragment, () => {
      // Match the former CSS border box (x - 1, y - 1, width + 1, height + 1),
      // with stroke edges aligned to backing pixels at the current zoom and DPR.
      const transform = context.getTransform();
      const strokeWidth = Math.max(1, Math.round(width * transform.a)) / transform.a;
      const snapX = (x: number) =>
        (Math.round(x * transform.a + transform.e) - transform.e) / transform.a;
      const snapY = (y: number) =>
        (Math.round(y * transform.d + transform.f) - transform.f) / transform.d;
      const half = strokeWidth / 2;
      const left = hasNeighbour(rect, fragments, "left") ? rect.x : snapX(rect.x - 1) + half;
      const top = hasNeighbour(rect, fragments, "top") ? rect.y : snapY(rect.y - 1) + half;
      const right = hasNeighbour(rect, fragments, "right")
        ? rect.x + rect.width
        : snapX(rect.x + rect.width) - half;
      const bottom = hasNeighbour(rect, fragments, "bottom")
        ? rect.y + rect.height
        : snapY(rect.y + rect.height) - half;
      context.lineWidth = strokeWidth;
      const edges: readonly Edge[] = ["top", "right", "bottom", "left"];
      for (const edge of edges) {
        if (hasNeighbour(rect, fragments, edge)) continue;
        context.beginPath();
        if (edge === "top") {
          context.moveTo(left, top);
          context.lineTo(right, top);
        } else if (edge === "right") {
          context.moveTo(right, top);
          context.lineTo(right, bottom);
        } else if (edge === "bottom") {
          context.moveTo(right, bottom);
          context.lineTo(left, bottom);
        } else {
          context.moveTo(left, bottom);
          context.lineTo(left, top);
        }
        context.stroke();
      }
    });
  }
  context.restore();
}

/** Paint below explicit cell borders. */
export function paintSheetUnderlay(
  context: CanvasRenderingContext2D,
  frame: SheetRenderFrame,
  state: SheetOverlayState,
  palette: SheetOverlayPalette,
): void {
  if (state.readingRects?.length) {
    paintRangeFill(
      context,
      frame,
      state.readingRects,
      state.readingColor ?? palette.readingColor ?? palette.actionPrimary,
      0.12,
    );
  }
  if (!state.editing && state.rangeRects?.length) {
    paintRangeFill(context, frame, state.rangeRects, palette.actionPrimary, 0.08);
  }
}

/** Paint after explicit borders and before native editors. */
export function paintSheetForeground(
  context: CanvasRenderingContext2D,
  frame: SheetRenderFrame,
  state: SheetOverlayState,
  palette: SheetOverlayPalette,
  time: number,
): void {
  if (!state.editing && state.rangeRects?.length)
    paintRangeOutline(context, frame, state.rangeRects, palette.actionPrimary, 1);
  if (!state.editing && state.activeRects?.length) {
    const matchesRange =
      state.activeRects.length === state.rangeRects?.length &&
      state.activeRects.every(({ paneId, rect }) =>
        state.rangeRects?.some(
          (range) =>
            range.paneId === paneId &&
            range.rect.x === rect.x &&
            range.rect.y === rect.y &&
            range.rect.width === rect.width &&
            range.rect.height === rect.height,
        ),
      );
    if (!matchesRange)
      paintRangeOutline(context, frame, state.activeRects, palette.actionPrimary, 1);
  }
  for (const group of state.referenceGroups ?? []) {
    const color =
      palette.formulaReferenceColors[group.colorIndex % palette.formulaReferenceColors.length];
    if (!color) continue;
    if (group.active) paintRangeFill(context, frame, group.rects, color, 0.12);
    paintRangeOutline(context, frame, group.rects, color, 2);
  }
  if (state.clipboardRects?.length) {
    paintRangeOutline(
      context,
      frame,
      state.clipboardRects,
      palette.actionPrimary,
      2,
      [5, 3],
      -(time / 60),
    );
  }
  if (state.fillPreviewRects?.length) {
    paintRangeFill(context, frame, state.fillPreviewRects, palette.actionPrimary, 0.06);
    paintRangeOutline(context, frame, state.fillPreviewRects, palette.actionPrimary, 2, [4, 3]);
  }
}

function isHandleActive(state: SheetOverlayState, target: FreezeHandleTarget): boolean {
  const handles = state.freezeHandles;
  return Boolean(
    handles && !handles.disabled && (handles.hovered === target || handles.focused === target),
  );
}

function paintFreezeHandles(
  context: CanvasRenderingContext2D,
  frame: SheetRenderFrame,
  state: SheetOverlayState,
  palette: SheetOverlayPalette,
): void {
  const handles = state.freezeHandles;
  if (!handles?.visible) return;
  const rowStarter = { x: frame.headerSize.width - 10, y: 10 };
  const columnStarter = { x: 10, y: frame.headerSize.height - 10 };
  const disabled = handles.disabled;
  for (const [target, point, horizontal] of [
    ["rowStarter", rowStarter, true],
    ["columnStarter", columnStarter, false],
  ] as const) {
    const active = isHandleActive(state, target);
    context.save();
    if (active) {
      context.fillStyle = palette.iconHover;
      context.beginPath();
      context.roundRect(point.x - 8, point.y - 8, 16, 16, 3);
      context.fill();
    }
    const color = disabled ? palette.mutedText : active ? palette.actionPrimary : palette.mutedText;
    context.globalAlpha = disabled ? 0.45 : 1;
    paintGripIcon(context, point.x, point.y, horizontal, color);
    context.restore();
  }
  const rowBoundary = frame.body.y + frame.layout.frozenSize.height;
  const columnBoundary = frame.body.x + frame.layout.frozenSize.width;
  if (frame.layout.freeze.rows > 0 && isHandleActive(state, "rowBoundary")) {
    context.fillStyle = palette.actionPrimary;
    context.fillRect(0, rowBoundary - 0.5, frame.size.width, 1);
  }
  if (frame.layout.freeze.columns > 0 && isHandleActive(state, "columnBoundary")) {
    context.fillStyle = palette.actionPrimary;
    context.fillRect(columnBoundary - 0.5, 0, 1, frame.size.height);
  }
}

function paintLabel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  palette: SheetOverlayPalette,
): void {
  context.save();
  context.font = "12px sans-serif";
  context.textBaseline = "middle";
  const width = Math.ceil(context.measureText(label).width) + 14;
  context.fillStyle = palette.panel;
  context.strokeStyle = palette.actionPrimary;
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x, y, width, 24, 3);
  context.fill();
  context.stroke();
  context.fillStyle = palette.actionPrimary;
  context.fillText(label, x + 7, y + 12);
  context.restore();
}

function paintFreezeDragLabel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  palette: SheetOverlayPalette,
): void {
  context.save();
  context.font = "12px sans-serif";
  context.textBaseline = "middle";
  const width = Math.ceil(context.measureText(label).width) + 12;
  context.fillStyle = palette.actionPrimary;
  context.beginPath();
  context.roundRect(x, y, width, 22, 3);
  context.fill();
  context.fillStyle = palette.inverseText;
  context.fillText(label, x + 6, y + 11);
  context.restore();
}

/** Paint above floating images and headers. */
export function paintSheetChrome(
  context: CanvasRenderingContext2D,
  frame: SheetRenderFrame,
  state: SheetOverlayState,
  palette: SheetOverlayPalette,
): void {
  context.save();
  context.fillStyle = palette.mutedText;
  context.globalAlpha = 0.72;
  if (frame.layout.freeze.rows > 0)
    context.fillRect(0, frame.body.y + frame.layout.frozenSize.height - 0.5, frame.size.width, 1);
  if (frame.layout.freeze.columns > 0)
    context.fillRect(frame.body.x + frame.layout.frozenSize.width - 0.5, 0, 1, frame.size.height);
  context.restore();

  paintFreezeHandles(context, frame, state, palette);
  const freezeDrag = state.freezeDrag;
  if (freezeDrag) {
    context.fillStyle = palette.actionPrimary;
    if (freezeDrag.axis === "row") {
      const y = frame.body.y + freezeDrag.previewPosition;
      context.fillRect(frame.body.x, y - 1, frame.body.width, 2);
      context.save();
      context.font = "12px sans-serif";
      const width = Math.ceil(context.measureText(freezeDrag.label).width) + 12;
      context.restore();
      paintFreezeDragLabel(context, frame.size.width - width - 8, y + 4, freezeDrag.label, palette);
    } else {
      const x = frame.body.x + freezeDrag.previewPosition;
      context.fillRect(x - 1, frame.body.y, 2, frame.body.height);
      paintFreezeDragLabel(context, x + 4, frame.size.height - 30, freezeDrag.label, palette);
    }
    return;
  }
  const preview = state.axisOperationPreview;
  if (!preview) return;
  context.fillStyle = palette.actionPrimary;
  if (preview.axis === "row") {
    const y = frame.body.y + preview.offset;
    context.fillRect(frame.body.x, y - 1, frame.body.width, 2);
    paintLabel(
      context,
      frame.body.x + 8,
      frame.body.y + Math.min(preview.offset + 6, Math.max(0, frame.body.height - 28)),
      preview.label,
      palette,
    );
  } else {
    const x = frame.body.x + preview.offset;
    context.fillRect(x - 1, frame.body.y, 2, frame.body.height);
    paintLabel(
      context,
      frame.body.x + Math.min(preview.offset + 6, Math.max(0, frame.body.width - 180)),
      frame.body.y + 8,
      preview.label,
      palette,
    );
  }
}

export const sheetOverlayPaneOrder = BODY_PANES;
