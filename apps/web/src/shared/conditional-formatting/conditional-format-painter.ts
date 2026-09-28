import type { ConditionalFormatVisual } from "@idea10/core/conditional-formatting";
import type { Rect } from "@idea10/sheet-engine/geometry";

import { paintConditionalFormatIcon } from "./conditional-format-icons";

const ICON_GAP = 4;

/** Width reserved for a conditional-format icon before cell text is laid out. */
export function getConditionalFormatIconSlot(
  rect: Rect,
  visual: ConditionalFormatVisual | undefined,
): number {
  if (!visual?.iconSet) return 0;
  return Math.max(0, Math.min(rect.height - 4, 18) + ICON_GAP);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function paintDataBar(
  context: CanvasRenderingContext2D,
  rect: Rect,
  visual: NonNullable<ConditionalFormatVisual["dataBar"]>,
): void {
  const inset = 2;
  const width = Math.max(0, rect.width - inset * 2);
  const start = clamp(visual.start, 0, 1) * width + rect.x + inset;
  const end = clamp(visual.end, 0, 1) * width + rect.x + inset;
  const axis = clamp(visual.axis, 0, 1) * width + rect.x + inset;
  const x = Math.min(start, end);
  const barWidth = Math.abs(end - start);
  const y = rect.y + 3;
  const height = Math.max(0, rect.height - 6);
  if (barWidth > 0 && height > 0) {
    const negative = Math.min(start, end) < axis;
    const color = negative ? (visual.negativeColor ?? visual.color) : visual.color;
    context.fillStyle = visual.gradient
      ? (() => {
          const gradient = context.createLinearGradient(x, y, x + barWidth, y);
          gradient.addColorStop(0, negative ? `${color}66` : color);
          gradient.addColorStop(1, negative ? color : `${color}66`);
          return gradient;
        })()
      : color;
    context.fillRect(x, y, barWidth, height);
  }
  if (axis > rect.x + inset && axis < rect.x + rect.width - inset) {
    context.strokeStyle = "rgba(69, 76, 85, 0.6)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(Math.round(axis) + 0.5, y);
    context.lineTo(Math.round(axis) + 0.5, y + height);
    context.stroke();
  }
}

/** Paints visual conditional formats after fills and before text. */
export function paintConditionalFormatVisual(
  context: CanvasRenderingContext2D,
  rect: Rect,
  visual: ConditionalFormatVisual | undefined,
): void {
  if (!visual) return;
  if (visual.dataBar) paintDataBar(context, rect, visual.dataBar);
  if (visual.iconSet)
    paintConditionalFormatIcon(context, rect, visual.iconSet.iconSet, visual.iconSet.iconIndex);
}
