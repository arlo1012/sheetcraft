import type { Point, Size } from "@sheetcraft/sheet-engine/geometry";

/**
 * The browser reports client coordinates after CSS zoom/transforms while sheet
 * geometry stays in unscaled surface units. This is the single conversion seam
 * for pointer controllers and viewport adapters.
 */
export function getElementEffectiveScale(
  element: HTMLElement,
  fallback = 1,
): Readonly<{ x: number; y: number }> {
  const bounds = element.getBoundingClientRect();
  return {
    x: element.offsetWidth > 0 && bounds.width > 0 ? bounds.width / element.offsetWidth : fallback,
    y:
      element.offsetHeight > 0 && bounds.height > 0
        ? bounds.height / element.offsetHeight
        : fallback,
  };
}

export function clientPointToElementSurface(
  point: Point,
  element: HTMLElement,
  fallbackScale = 1,
): Point {
  const bounds = element.getBoundingClientRect();
  const scale = getElementEffectiveScale(element, fallbackScale);
  return {
    x: (point.x - bounds.left) / scale.x,
    y: (point.y - bounds.top) / scale.y,
  };
}

export function surfacePointToBody(point: Point, headerSize: Size): Point {
  return { x: point.x - headerSize.width, y: point.y - headerSize.height };
}

export function clientPointToElementBody(
  point: Point,
  element: HTMLElement,
  headerSize: Size,
  fallbackScale = 1,
): Point {
  return surfacePointToBody(clientPointToElementSurface(point, element, fallbackScale), headerSize);
}

export function clientDistanceToSurface(
  startClientPosition: number,
  endClientPosition: number,
  scale = 1,
): number {
  return (endClientPosition - startClientPosition) / scale;
}

export function clientVectorToSurface(
  vector: Point,
  scale: Readonly<{ x: number; y: number }>,
): Point {
  return { x: vector.x / scale.x, y: vector.y / scale.y };
}
