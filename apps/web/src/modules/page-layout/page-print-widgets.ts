import { getFormControlItems } from "@sheetcraft/core/form-controls";
import {
  normalizeSheetDrawing,
  isSheetDrawingVisible,
  type SheetLegacyDrawing,
  type SheetDrawing,
  type SheetControlDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { tracePictureShapePath } from "../../shared/images/picture-shape-mask";
import { getLegacyShapeGeometry } from "../sheet-drawings/legacy-shape-geometry";
import { attachmentText } from "../attachments/attachment-file";
import { paintCameraContent } from "../camera/camera-painter";
import type { CanvasImageCache } from "../sheet-grid/canvas/image-painter";

function isWidget(drawing: SheetDrawing): drawing is SheetLegacyDrawing {
  return (
    drawing.kind === "icon" ||
    drawing.kind === "wordArt" ||
    drawing.kind === "camera" ||
    drawing.kind === "attachment" ||
    drawing.kind === "control"
  );
}

export function capturePrintWidgets(
  sheet: Sheet,
  evaluator: SheetEvaluator,
  metrics: PictureSheetMetrics,
) {
  return (sheet.drawings ?? []).flatMap((source, order) => {
    if (!isWidget(source) || !isSheetDrawingVisible(source)) return [];
    const drawing = normalizeSheetDrawing(source);
    const layout = resolvePictureLayout(
      {
        x: metrics.columns.visiblePrefix(drawing.anchor.column) + drawing.offsetX,
        y: metrics.rows.visiblePrefix(drawing.anchor.row) + drawing.offsetY,
        width: drawing.width,
        height: drawing.height,
      },
      drawing.rotation,
    );
    if (layout.collapsed) return [];
    return [
      {
        drawing,
        order,
        layout,
        value:
          drawing.kind === "control" && drawing.control.linkedCell
            ? evaluator.getComputedValue(drawing.control.linkedCell)
            : null,
        items: drawing.kind === "control" ? getFormControlItems(drawing.control, evaluator) : [],
      },
    ];
  });
}
export type PrintWidget = ReturnType<typeof capturePrintWidgets>[number];

export function getPrintWidgetExtent(
  entries: readonly PrintWidget[],
  metrics: PictureSheetMetrics,
) {
  function count(position: number, axis: PictureSheetMetrics["rows"]) {
    let low = 0,
      high = axis.count;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (axis.visiblePrefix(middle) < position) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  return entries.reduce(
    (extent, { layout: { bounds } }) => ({
      rowCount: Math.max(extent.rowCount, count(bounds.y + bounds.height, metrics.rows)),
      columnCount: Math.max(extent.columnCount, count(bounds.x + bounds.width, metrics.columns)),
    }),
    { rowCount: 0, columnCount: 0 },
  );
}

/** Bounded wrapping inside the object's own clipping rectangle. */
function lines(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  lineHeight: number,
): void {
  let line = "",
    baseline = y + lineHeight;
  for (const char of text) {
    if (char === "\n" || (line && context.measureText(line + char).width > width)) {
      context.fillText(line, x, baseline);
      baseline += lineHeight;
      if (baseline > y + height) return;
      line = "";
    }
    if (char !== "\n") line += char;
  }
  if (baseline <= y + height) context.fillText(line, x, baseline);
}

function paintControl(
  context: CanvasRenderingContext2D,
  drawing: SheetControlDrawing,
  entry: PrintWidget,
): void {
  const { control, width, height } = drawing;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#9ca3af";
  context.fillStyle = "#202124";
  context.font = "12px sans-serif";
  if (control.type === "label") {
    lines(context, control.label, 8, 4, width - 16, height - 8, 18);
    return;
  }
  if (control.type === "group") {
    context.strokeRect(8, 12, Math.max(1, width - 16), Math.max(1, height - 16));
    context.fillStyle = "#fff";
    context.fillRect(16, 2, context.measureText(control.label).width + 8, 18);
    context.fillStyle = "#202124";
    context.fillText(control.label, 20, 16);
    return;
  }
  context.fillStyle = "#666";
  context.fillText(drawing.name, 8, 16, Math.max(1, width - 16));
  context.fillStyle = "#202124";
  const top = 24,
    mid = top + Math.max(14, (height - top) / 2);
  if (control.type === "checkbox" || control.type === "radio") {
    context.beginPath();
    if (control.type === "radio") context.arc(16, mid, 7, 0, Math.PI * 2);
    else context.rect(9, mid - 7, 14, 14);
    context.stroke();
    const checked =
      control.type === "checkbox" ? entry.value === true : entry.value === control.optionValue;
    if (checked) {
      context.fillStyle = "#2563eb";
      if (control.type === "radio") {
        context.beginPath();
        context.arc(16, mid, 4, 0, Math.PI * 2);
        context.fill();
      } else {
        context.strokeStyle = "#2563eb";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(11, mid);
        context.lineTo(15, mid + 4);
        context.lineTo(22, mid - 4);
        context.stroke();
      }
    }
    context.fillStyle = "#202124";
    context.fillText(control.label, 30, mid + 4, Math.max(1, width - 38));
  } else if (control.type === "scrollbar") {
    const value = typeof entry.value === "number" ? entry.value : control.min;
    const fraction = Math.max(
      0,
      Math.min(1, (value - control.min) / Math.max(1, control.max - control.min)),
    );
    context.fillStyle = "#d1d5db";
    context.fillRect(10, mid - 2, Math.max(1, width - 20), 4);
    context.fillStyle = "#2563eb";
    context.beginPath();
    context.arc(10 + fraction * Math.max(1, width - 20), mid, 6, 0, Math.PI * 2);
    context.fill();
  } else {
    context.strokeRect(8, top, Math.max(1, width - 16), Math.max(1, height - top - 4));
    if (control.type === "list") {
      entry.items.forEach((label, index) => {
        const y = top + index * 20;
        if (y + 20 > height) return;
        if (entry.value === index + 1) {
          context.fillStyle = "#dbeafe";
          context.fillRect(9, y + 1, Math.max(1, width - 18), 20);
        }
        context.fillStyle = "#202124";
        context.fillText(label, 12, y + 15, Math.max(1, width - 24));
      });
    } else {
      const text =
        control.type === "combo"
          ? (entry.items[Number(entry.value) - 1] ?? control.label)
          : control.type === "spinner"
            ? String(typeof entry.value === "number" ? entry.value : control.min)
            : control.label;
      context.fillText(text, 14, mid + 4, Math.max(1, width - 42));
      if (control.type === "combo") context.fillText("▾", width - 24, mid + 4);
      if (control.type === "spinner") {
        context.fillText("▴", width - 24, top + 12);
        context.fillText("▾", width - 24, height - 6);
      }
    }
  }
}

export function paintPrintWidget(
  context: CanvasRenderingContext2D,
  entry: PrintWidget,
  options: {
    viewport: { x: number; y: number; width: number; height: number };
    sheet: Sheet;
    evaluator: SheetEvaluator;
    revision: number;
    images: CanvasImageCache;
    theme?: WorkbookTheme;
    imageAssetUrls?: ReadonlyMap<string, string>;
    locale: string;
    dateSystem: "1900" | "1904";
  },
): void {
  const { drawing, layout } = entry;
  const { bounds, rect } = layout,
    viewport = options.viewport;
  if (
    bounds.x + bounds.width < viewport.x ||
    bounds.y + bounds.height < viewport.y ||
    bounds.x > viewport.x + viewport.width ||
    bounds.y > viewport.y + viewport.height
  )
    return;
  context.save();
  try {
    context.translate(rect.x - viewport.x + rect.width / 2, rect.y - viewport.y + rect.height / 2);
    context.rotate((drawing.rotation * Math.PI) / 180);
    context.translate(-rect.width / 2, -rect.height / 2);
    context.beginPath();
    context.rect(0, 0, rect.width, rect.height);
    context.clip();
    context.lineWidth = 1;
    if (drawing.kind === "camera") {
      const canvas = document.createElement("canvas");
      paintCameraContent(canvas, { ...options, drawing }, options.images);
      context.drawImage(canvas, 0, 0, rect.width, rect.height);
      canvas.width = canvas.height = 1;
    } else if (drawing.kind === "attachment") {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, rect.width, rect.height);
      context.strokeStyle = "#d1d5db";
      context.strokeRect(0.5, 0.5, rect.width - 1, rect.height - 1);
      context.strokeStyle = "#2563eb";
      context.strokeRect(12, 11, 20, 26);
      context.beginPath();
      context.moveTo(16, 19);
      context.lineTo(28, 19);
      context.moveTo(16, 25);
      context.lineTo(28, 25);
      context.stroke();
      context.fillStyle = "#202124";
      context.font = "12px sans-serif";
      context.fillText(drawing.attachment.filename, 46, 28, Math.max(1, rect.width - 56));
      const text =
        drawing.attachment.display === "document" ? attachmentText(drawing.attachment) : undefined;
      context.font = "12px monospace";
      lines(
        context,
        text ?? `${(drawing.attachment.size / 1024).toFixed(1)} KB`,
        10,
        42,
        rect.width - 20,
        rect.height - 52,
        18,
      );
    } else if (drawing.kind === "control") paintControl(context, drawing, entry);
    else if (drawing.kind === "icon" || drawing.kind === "wordArt") {
      if (drawing.kind === "icon") {
        const geometry = getLegacyShapeGeometry(drawing.shape, rect.width, rect.height);
        if (!geometry) throw new Error("Icon geometry is unavailable.");
        context.fillStyle = drawing.fill;
        context.strokeStyle = drawing.stroke;
        context.lineWidth = drawing.strokeWidth;
        context.lineJoin = "round";
        for (const path of geometry.paths) {
          context.beginPath();
          tracePictureShapePath(context, path);
          if (path.filled) context.fill();
          if (path.stroke && drawing.strokeWidth) context.stroke();
        }
      }
      context.fillStyle = drawing.color;
      context.font = `${drawing.italic ? "italic " : ""}${drawing.kind === "wordArt" ? 800 : drawing.bold ? 700 : 400} ${drawing.fontSize}px sans-serif`;
      context.textAlign = "center";
      if (drawing.kind === "wordArt") {
        context.shadowColor = "#dbeafe";
        context.shadowOffsetX = 2;
        context.shadowOffsetY = 3;
      }
      lines(
        context,
        drawing.text,
        rect.width / 2,
        Math.max(0, (rect.height - drawing.fontSize * 1.2) / 2 - drawing.fontSize * 0.2),
        rect.width - 12,
        rect.height - 6,
        drawing.fontSize * 1.2,
      );
    }
  } finally {
    context.restore();
  }
}
