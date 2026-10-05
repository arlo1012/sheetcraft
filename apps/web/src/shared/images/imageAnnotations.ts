import type { ImageAnnotation } from "@idea10/core/workbook";

export function paintImageAnnotations(
  context: CanvasRenderingContext2D,
  annotations: readonly ImageAnnotation[] | undefined,
  width: number,
  height: number,
): void {
  if (!annotations?.length) return;
  context.save();
  context.shadowColor = "transparent";
  context.lineCap = "round";
  context.lineJoin = "round";
  const size = Math.min(width, height);
  for (const annotation of annotations) {
    const points = annotation.points.map((point) => ({ x: point.x * width, y: point.y * height }));
    const first = points[0]!;
    const last = points.at(-1)!;
    context.strokeStyle = annotation.color;
    context.fillStyle = annotation.color;
    context.lineWidth = annotation.width * size;
    context.beginPath();
    if (annotation.kind === "text") {
      const fontSize = (annotation.fontSize ?? 0.05) * size;
      context.font = `${fontSize}px sans-serif`;
      context.textBaseline = "top";
      for (const [index, line] of (annotation.text ?? "").split("\n").entries())
        context.fillText(line, first.x, first.y + index * fontSize * 1.2);
    } else if (annotation.kind === "rectangle") {
      context.strokeRect(first.x, first.y, last.x - first.x, last.y - first.y);
    } else if (annotation.kind === "ellipse") {
      context.ellipse(
        (first.x + last.x) / 2,
        (first.y + last.y) / 2,
        Math.abs(last.x - first.x) / 2,
        Math.abs(last.y - first.y) / 2,
        0,
        0,
        Math.PI * 2,
      );
      context.stroke();
    } else {
      context.moveTo(first.x, first.y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
      if (points.length === 1) context.lineTo(first.x + 0.01, first.y);
      context.stroke();
      if (annotation.kind === "arrow") {
        const angle = Math.atan2(last.y - first.y, last.x - first.x);
        const length = Math.max(context.lineWidth * 4, size * 0.02);
        context.beginPath();
        context.moveTo(
          last.x - length * Math.cos(angle - Math.PI / 6),
          last.y - length * Math.sin(angle - Math.PI / 6),
        );
        context.lineTo(last.x, last.y);
        context.lineTo(
          last.x - length * Math.cos(angle + Math.PI / 6),
          last.y - length * Math.sin(angle + Math.PI / 6),
        );
        context.stroke();
      }
    }
  }
  context.restore();
}
