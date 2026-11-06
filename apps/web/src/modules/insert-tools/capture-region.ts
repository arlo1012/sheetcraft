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
