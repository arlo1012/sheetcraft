import {
  resolveSparklineScale,
  type CellSparkline,
  type SparklineScale,
} from "@sheetcraft/core/sparklines";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
export function paintSparkline(
  context: CanvasRenderingContext2D,
  rect: Rect,
  sparkline: CellSparkline,
  values: readonly (number | null)[],
  scale = resolveSparklineScale(sparkline, values),
): void {
  const numbers = values.filter((value): value is number => value !== null);
  if (!numbers.length || rect.width < 4 || rect.height < 4) return;
  const dataMin = Math.min(...numbers);
  const dataMax = Math.max(...numbers);
  const first = values.findIndex((value) => value !== null);
  let last = values.length - 1;
  while (last >= 0 && values[last] === null) last--;
  const pointColor = (value: number, index: number): string | undefined => {
    if (sparkline.highPoint?.show && value === dataMax) return sparkline.highPoint.color;
    if (sparkline.lowPoint?.show && value === dataMin) return sparkline.lowPoint.color;
    if (sparkline.firstPoint?.show && index === first) return sparkline.firstPoint.color;
    if (sparkline.lastPoint?.show && index === last) return sparkline.lastPoint.color;
    if (value < 0 && sparkline.negativePoints !== false) return sparkline.negativeColor;
    return undefined;
  };
  const explicitPoint = (value: number, index: number): boolean =>
    !!(
      (sparkline.highPoint?.show && value === dataMax) ||
      (sparkline.lowPoint?.show && value === dataMin) ||
      (sparkline.firstPoint?.show && index === first) ||
      (sparkline.lastPoint?.show && index === last) ||
      (sparkline.negativePoints === true && value < 0)
    );
  const left = rect.x + 3,
    top = rect.y + 3,
    width = rect.width - 6,
    height = rect.height - 6;
  const { min, max }: SparklineScale = scale;
  const pointX = (index: number) =>
    left +
    (values.length === 1
      ? width / 2
      : (width * (sparkline.rightToLeft ? values.length - 1 - index : index)) /
        (values.length - 1));
  const y = (value: number) =>
    max === min
      ? value === min
        ? top + height / 2
        : value > max
          ? rect.y - 4
          : rect.y + rect.height + 4
      : top + height - ((value - min) / (max - min)) * height;
  const zero =
    sparkline.type === "winLoss" ? top + height / 2 : Math.max(top, Math.min(top + height, y(0)));
  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  if (
    sparkline.type !== "winLoss" &&
    (sparkline.minAxis?.type === "custom" || sparkline.maxAxis?.type === "custom")
  ) {
    context.beginPath();
    context.rect(left, top, width, height);
    context.clip();
  }
  if (sparkline.axis && min <= 0 && max >= 0) {
    context.strokeStyle = "#a3a3a3";
    context.lineWidth = 0.5;
    context.beginPath();
    context.moveTo(left, zero);
    context.lineTo(left + width, zero);
    context.stroke();
  }
  if (sparkline.type === "line") {
    context.strokeStyle = sparkline.color;
    context.lineWidth = 1.5;
    context.beginPath();
    let active = false;
    values.forEach((value, index) => {
      if (value === null) {
        if (sparkline.empty !== "connect") active = false;
        return;
      }
      const x = pointX(index);
      if (active) context.lineTo(x, y(value));
      else context.moveTo(x, y(value));
      active = true;
    });
    context.stroke();
    values.forEach((value, index) => {
      if (
        value === null ||
        !(sparkline.markers || values.length === 1 || explicitPoint(value, index))
      )
        return;
      const x = pointX(index);
      context.fillStyle = pointColor(value, index) ?? sparkline.markerColor ?? sparkline.color;
      context.beginPath();
      context.arc(x, y(value), 2, 0, 2 * Math.PI);
      context.fill();
    });
  } else {
    const slot = width / Math.max(1, values.length);
    const barWidth = Math.max(0.5, slot * 0.72);
    values.forEach((value, index) => {
      if (value === null || value === 0) return;
      context.fillStyle = pointColor(value, index) ?? sparkline.color;
      const base = zero;
      const end = sparkline.type === "winLoss" ? (value > 0 ? top : top + height) : y(value);
      context.fillRect(
        left +
          slot * (sparkline.rightToLeft ? values.length - 1 - index : index) +
          (slot - barWidth) / 2,
        Math.min(base, end),
        barWidth,
        Math.max(1, Math.abs(base - end)),
      );
    });
  }
  context.restore();
}
