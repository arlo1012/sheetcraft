import { evaluateShapePreset } from "./evaluate.js";
import type {
  EvaluatedShapePresetGeometry,
  ShapePathCommand,
  ShapePresetParameters,
} from "./types.js";

/** Actual drawing frames may exceed the low-level preset evaluator's extent budget. */
export const SHAPE_PRESET_DISPLAY_SIZE_LIMITS = Object.freeze({
  extent: 16_384,
  evaluatorExtent: 10_000,
  coordinate: 10_000_000,
});

type Point = Readonly<{ x: number; y: number }>;

function extentScale(width: number, height: number): number {
  if (
    ![width, height].every(
      (value) =>
        Number.isFinite(value) && value > 0 && value <= SHAPE_PRESET_DISPLAY_SIZE_LIMITS.extent,
    )
  )
    throw new RangeError("Preset display extents must be positive and at most 16,384 pixels.");
  // One common scale preserves ss/ls and every guide's aspect-dependent calculation.
  return Math.max(1, Math.max(width, height) / SHAPE_PRESET_DISPLAY_SIZE_LIMITS.evaluatorExtent);
}

function coordinate(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > SHAPE_PRESET_DISPLAY_SIZE_LIMITS.coordinate)
    throw new RangeError("Preset display geometry exceeds its local-coordinate budget.");
  return value === 0 ? 0 : value;
}

function scaledPoint(point: Point, scale: number): Point {
  return Object.freeze({
    x: coordinate(point.x * scale),
    y: coordinate(point.y * scale),
  });
}

function scaledCommand(command: ShapePathCommand, scale: number): ShapePathCommand {
  if (command[0] === "Z") return Object.freeze(["Z"] as const);
  // Arc radii and center scale; continuous ellipse angles remain angular quantities.
  return Object.freeze(
    command.map((value, index) =>
      index === 0 || (command[0] === "A" && index >= 5)
        ? value
        : coordinate((value as number) * scale),
    ),
  ) as ShapePathCommand;
}

function detachGeometry(
  geometry: EvaluatedShapePresetGeometry,
  width: number,
  height: number,
  scale: number,
): EvaluatedShapePresetGeometry {
  return Object.freeze({
    width,
    height,
    paths: Object.freeze(
      geometry.paths.map((path) =>
        Object.freeze({
          filled: path.filled,
          fillMode: path.fillMode,
          stroke: path.stroke,
          commands: Object.freeze(path.commands.map((command) => scaledCommand(command, scale))),
        }),
      ),
    ),
    handles: Object.freeze(
      geometry.handles.map((handle) =>
        Object.freeze({
          kind: handle.kind,
          position: scaledPoint(handle.position, scale),
          // Adjustment values/intervals are ratios or angles, not local pixels.
          fields: Object.freeze(handle.fields.map((field) => Object.freeze({ ...field }))),
        }),
      ),
    ),
    adjustments: Object.freeze({ ...geometry.adjustments }),
    textRect: geometry.textRect
      ? Object.freeze({
          left: coordinate(geometry.textRect.left * scale),
          top: coordinate(geometry.textRect.top * scale),
          right: coordinate(geometry.textRect.right * scale),
          bottom: coordinate(geometry.textRect.bottom * scale),
        })
      : null,
    connectionSites: Object.freeze(
      geometry.connectionSites.map((site) =>
        Object.freeze({
          position: scaledPoint(site.position, scale),
          angle: site.angle,
        }),
      ),
    ),
  });
}

/** Evaluate in one uniformly scaled frame, then return detached, deeply frozen geometry
 * in the actual drawing frame. Ratios and angles retain their original units. */
export function evaluateShapePresetAtDisplaySize(
  input: ShapePresetParameters | undefined,
  width: number,
  height: number,
): EvaluatedShapePresetGeometry {
  const scale = extentScale(width, height);
  return detachGeometry(
    evaluateShapePreset(input, width / scale, height / scale),
    width,
    height,
    scale,
  );
}
