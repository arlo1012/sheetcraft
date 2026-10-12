import {
  isShapeFreePathClosed,
  MAX_SHAPE_FREE_PATH_COMMANDS,
  MAX_SHAPE_FREE_PATH_VIEWBOX_SIZE,
  normalizeShapeFreePath,
  type ShapeFreePath,
  type ShapeFreePathCommand,
} from "@sheetcraft/core/shape-free-path";
import type { EvaluatedShapePresetGeometry } from "@sheetcraft/core/shape-presets";

export const FREE_SHAPE_GEOMETRY_LIMITS = Object.freeze({
  extent: MAX_SHAPE_FREE_PATH_VIEWBOX_SIZE,
  commands: MAX_SHAPE_FREE_PATH_COMMANDS,
  cache: 128,
});
const geometryCache = new Map<string, EvaluatedShapePresetGeometry>();

function scaledCommand(
  command: ShapeFreePathCommand,
  scaleX: number,
  scaleY: number,
): ShapeFreePathCommand {
  if (command[0] === "Z") return Object.freeze(["Z"] as const);
  return Object.freeze(
    command.map((value, index) => {
      if (index === 0) return value;
      const scaled = (value as number) * (index % 2 === 1 ? scaleX : scaleY);
      if (!Number.isFinite(scaled) || Math.abs(scaled) > FREE_SHAPE_GEOMETRY_LIMITS.extent)
        throw new RangeError("Free shape exceeds its local-coordinate budget.");
      return scaled === 0 ? 0 : scaled;
    }),
  ) as ShapeFreePathCommand;
}

/**
 * One numeric contour in the actual unflipped drawing frame. Closure is an
 * explicit final Z: coincident endpoints never silently gain fill or a closing
 * stroke. No SVG strings, arbitrary evaluators or legacy fallbacks are accepted.
 * The bounded LRU contains only detached, deeply frozen numeric geometry.
 */
export function getFreeShapeGeometry(
  path: ShapeFreePath | undefined,
  width: number,
  height: number,
): EvaluatedShapePresetGeometry | undefined {
  if (
    !path ||
    ![width, height].every(
      (value) => Number.isFinite(value) && value >= 1 && value <= FREE_SHAPE_GEOMETRY_LIMITS.extent,
    )
  )
    return;
  try {
    const normalized = normalizeShapeFreePath(path);
    const key = JSON.stringify([normalized, width, height]);
    const cached = geometryCache.get(key);
    if (cached) {
      geometryCache.delete(key);
      geometryCache.set(key, cached);
      return cached;
    }
    const closed = isShapeFreePathClosed(normalized);
    const geometry: EvaluatedShapePresetGeometry = Object.freeze({
      width,
      height,
      paths: Object.freeze([
        Object.freeze({
          filled: closed,
          fillMode: closed ? "norm" : "none",
          stroke: true,
          commands: Object.freeze(
            normalized.commands.map((command) =>
              scaledCommand(
                command,
                width / normalized.viewBox.width,
                height / normalized.viewBox.height,
              ),
            ),
          ),
        }),
      ]),
      handles: Object.freeze([]),
      adjustments: Object.freeze({}),
      textRect: closed ? Object.freeze({ left: 0, top: 0, right: width, bottom: height }) : null,
      connectionSites: Object.freeze([]),
    });
    geometryCache.set(key, geometry);
    if (geometryCache.size > FREE_SHAPE_GEOMETRY_LIMITS.cache)
      geometryCache.delete(geometryCache.keys().next().value!);
    return geometry;
  } catch {
    return;
  }
}
