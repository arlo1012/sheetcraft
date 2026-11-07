export type CaptureSize = { width: number; height: number };
export type CapturePoint = { x: number; y: number };
export type CaptureRegion = CapturePoint & CaptureSize;

export function captureRegionBetween(
  start: CapturePoint,
  end: CapturePoint,
  size: CaptureSize,
): CaptureRegion {
  const clampX = (x: number) => Math.max(0, Math.min(size.width, Math.round(x)));
  const clampY = (y: number) => Math.max(0, Math.min(size.height, Math.round(y)));
  const left = clampX(Math.min(start.x, end.x));
  const top = clampY(Math.min(start.y, end.y));
  return {
    x: left,
    y: top,
    width: clampX(Math.max(start.x, end.x)) - left,
    height: clampY(Math.max(start.y, end.y)) - top,
  };
}

export function setCaptureRegionField(
  region: CaptureRegion,
  field: keyof CaptureRegion,
  value: number,
  size: CaptureSize,
): CaptureRegion {
  const next = { ...region, [field]: Math.round(value) };
  next.x = Math.max(0, Math.min(size.width - 1, next.x));
  next.y = Math.max(0, Math.min(size.height - 1, next.y));
  next.width = Math.max(1, Math.min(size.width - next.x, next.width));
  next.height = Math.max(1, Math.min(size.height - next.y, next.height));
  return next;
}

export const captureShapes = ["rectangle", "ellipse", "rounded", "freehand"] as const;
export type CaptureShape = (typeof captureShapes)[number];

/** SVG and Canvas use the same pixel-space path. Freehand vertices are relative to the crop. */
export function captureShapePath(
  shape: CaptureShape,
  region: CaptureRegion,
  points: readonly CapturePoint[],
): string {
  const { x, y, width, height } = region;
  const right = x + width,
    bottom = y + height;
  if (shape === "freehand") {
    if (points.length < 3) return "";
    return (
      points
        .map((p, i) => (i === 0 ? "M" : "L") + (x + p.x * width) + " " + (y + p.y * height))
        .join(" ") + " Z"
    );
  }
  if (shape === "ellipse") {
    const rx = width / 2,
      ry = height / 2,
      cy = y + ry;
    return `M ${x} ${cy} A ${rx} ${ry} 0 1 0 ${right} ${cy} A ${rx} ${ry} 0 1 0 ${x} ${cy} Z`;
  }
  if (shape === "rounded") {
    const r = Math.min(width, height) / 6;
    return `M ${x + r} ${y} H ${right - r} Q ${right} ${y} ${right} ${y + r} V ${bottom - r} Q ${right} ${bottom} ${right - r} ${bottom} H ${x + r} Q ${x} ${bottom} ${x} ${bottom - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
  }
  return `M ${x} ${y} H ${right} V ${bottom} H ${x} Z`;
}
