import { resolvePictureLayout } from "./picture-frame.js";
import {
  shapeFrameLocalToWorld,
  type ResolvedShapeFrame,
  type ShapeFrameRect,
} from "./shape-frame.js";
import { isShapeLinePreset } from "./shape-line-ends.js";
import { normalizeShapePresetParameters } from "./shape-presets/contract.js";
import { evaluateShapePresetAtDisplaySize } from "./shape-presets/display-size.js";
import { assertShapePathBudget } from "./shape-presets/path-budget.js";
import type {
  EvaluatedShapePresetGeometry,
  ShapePathCommand,
  ShapePresetParameters,
} from "./shape-presets/types.js";

export const SHAPE_CONNECTOR_ROUTE_LIMITS = Object.freeze({
  coordinate: 10_000_000,
  extent: 16_384,
  commands: 1024,
  points: 4096,
  spanRelativeError: 1e-8,
});
export type ShapeConnectorPoint = Readonly<{ x: number; y: number }>;
export type ShapeConnectorPaintLayout = Readonly<{
  rect: Readonly<ShapeFrameRect>;
  angleDeg: number;
  collapsed: boolean;
  corners: readonly [
    ShapeConnectorPoint,
    ShapeConnectorPoint,
    ShapeConnectorPoint,
    ShapeConnectorPoint,
  ];
  bounds: Readonly<ShapeFrameRect>;
}>;
export type ReadyShapeConnectorRoute = Readonly<{
  status: "ready";
  /** Exact ordered worksheet tips. Neither frame padding nor paint flips changes them. */
  begin: ShapeConnectorPoint;
  end: ShapeConnectorPoint;
  /** Forward path directions at the ordered tips, in worksheet coordinates. */
  beginTangent: ShapeConnectorPoint;
  endTangent: ShapeConnectorPoint;
  localEndpoints: readonly [ShapeConnectorPoint, ShapeConnectorPoint];
  geometry: EvaluatedShapePresetGeometry;
  /** The only transform applied when painting geometry. */
  paintLayout: ShapeConnectorPaintLayout;
  shapeFlipX: false;
  shapeFlipY: false;
  /** Conservative path/control-point bounds, excluding line width, markers and effects. */
  worldBounds: Readonly<ShapeFrameRect>;
}>;
export type ShapeConnectorRoute =
  | ReadyShapeConnectorRoute
  | Readonly<{ status: "degenerate"; begin: ShapeConnectorPoint; end: ShapeConnectorPoint }>;

type Command = Exclude<
  ShapePathCommand,
  readonly ["Z"] | readonly ["A", number, number, number, number, number, number]
>;

function coordinate(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > SHAPE_CONNECTOR_ROUTE_LIMITS.coordinate)
    throw new RangeError("Shape connector route exceeds its coordinate budget.");
  return value === 0 ? 0 : value;
}
function point(value: ShapeConnectorPoint): ShapeConnectorPoint {
  return Object.freeze({ x: coordinate(value.x), y: coordinate(value.y) });
}
function rotationVector(angle: number): ShapeConnectorPoint {
  if (!Number.isFinite(angle) || Math.abs(angle) > 360)
    throw new RangeError("Shape connector route angle must be finite within one full turn.");
  const turn = ((angle % 360) + 360) % 360;
  if (turn === 0) return { x: 1, y: 0 };
  if (turn === 90) return { x: 0, y: 1 };
  if (turn === 180) return { x: -1, y: 0 };
  if (turn === 270) return { x: 0, y: -1 };
  const radians = (turn * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}
function rotate(value: ShapeConnectorPoint, vector: ShapeConnectorPoint): ShapeConnectorPoint {
  return point({
    x: value.x * vector.x - value.y * vector.y,
    y: value.x * vector.y + value.y * vector.x,
  });
}
function commandPoint(command: Command): ShapeConnectorPoint {
  return point({
    x: command[command.length - 2] as number,
    y: command[command.length - 1] as number,
  });
}
function commandPoints(commands: readonly Command[]): ShapeConnectorPoint[] {
  const result: ShapeConnectorPoint[] = [];
  for (const command of commands)
    for (let index = 1; index < command.length; index += 2)
      result.push(point({ x: command[index] as number, y: command[index + 1] as number }));
  if (result.length > SHAPE_CONNECTOR_ROUTE_LIMITS.points)
    throw new RangeError("Shape connector route exceeds its point budget.");
  return result;
}
function mapCommands(
  commands: readonly Command[],
  project: (value: ShapeConnectorPoint) => ShapeConnectorPoint,
): readonly Command[] {
  return Object.freeze(
    commands.map((command): Command => {
      const mapped: (string | number)[] = [command[0]];
      for (let index = 1; index < command.length; index += 2) {
        const value = project({ x: command[index] as number, y: command[index + 1] as number });
        mapped.push(value.x, value.y);
      }
      return Object.freeze(mapped) as Command;
    }),
  );
}
function bounds(points: readonly ShapeConnectorPoint[]): ShapeFrameRect {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const value of points) {
    left = Math.min(left, coordinate(value.x));
    top = Math.min(top, coordinate(value.y));
    right = Math.max(right, value.x);
    bottom = Math.max(bottom, value.y);
  }
  return { x: left, y: top, width: coordinate(right - left), height: coordinate(bottom - top) };
}
function freezeLayout(layout: ResolvedShapeFrame): ShapeConnectorPaintLayout {
  return Object.freeze({
    rect: Object.freeze({ ...layout.rect }),
    angleDeg: layout.angleDeg,
    collapsed: layout.collapsed,
    corners: Object.freeze(layout.corners.map(point)) as ShapeConnectorPaintLayout["corners"],
    bounds: Object.freeze({ ...layout.bounds }),
  });
}
function tangent(
  from: ShapeConnectorPoint,
  to: ShapeConnectorPoint,
  rotation: ShapeConnectorPoint,
): ShapeConnectorPoint {
  const x = to.x - from.x,
    y = to.y - from.y,
    length = Math.hypot(x, y);
  if (!Number.isFinite(length) || !length)
    throw new RangeError("A nondegenerate connector must have a representable endpoint tangent.");
  return rotate({ x: x / length, y: y / length }, rotation);
}

/**
 * Deterministic preset routing in the source carrier's world-angle axes. The
 * existing preset and adjustments supply every segment/control point. Port
 * directions do not choose a route and no obstacle or automatic-site solver is
 * implied. Geometry reflections have already resolved endpoint positions; the
 * disposable paint view neutralizes them instead of applying them twice.
 */
export function resolveShapeConnectorRoute(
  input: ShapePresetParameters,
  carrier: Pick<ResolvedShapeFrame, "rect" | "angleDeg">,
  beginValue: ShapeConnectorPoint,
  endValue: ShapeConnectorPoint,
): ShapeConnectorRoute {
  const shape = normalizeShapePresetParameters(input);
  if (!shape || !isShapeLinePreset(shape.preset))
    throw new TypeError("A live shape connector requires an explicit standard line preset.");
  const begin = point(beginValue),
    end = point(endValue);
  const rotation = rotationVector(carrier.angleDeg);
  // Evaluate/validate source even for coincident endpoints: degeneracy is not
  // permission to accept malformed family or adjustment data.
  const source = evaluateShapePresetAtDisplaySize(shape, carrier.rect.width, carrier.rect.height);
  if (source.paths.length !== 1 || !source.paths[0]!.stroke)
    throw new TypeError("Connector preset must have one ordered stroked path.");
  const sourcePath = source.paths[0]!;
  assertShapePathBudget(sourcePath, SHAPE_CONNECTOR_ROUTE_LIMITS);
  if (
    sourcePath.commands.length < 2 ||
    sourcePath.commands[0]![0] !== "M" ||
    sourcePath.commands
      .slice(1)
      .some((command) => command[0] !== "L" && command[0] !== "Q" && command[0] !== "C")
  )
    throw new TypeError("Connector preset route supports one open M/L/Q/C path only.");
  const commands = sourcePath.commands as readonly Command[];
  const first = commandPoint(commands[0]!),
    last = commandPoint(commands.at(-1)!);
  const dx = last.x - first.x,
    dy = last.y - first.y;
  if (
    !dx ||
    !dy ||
    Math.abs(Math.abs(dx) - source.width) > 1e-8 ||
    Math.abs(Math.abs(dy) - source.height) > 1e-8 ||
    Math.abs(first.x + last.x - source.width) > 1e-8 ||
    Math.abs(first.y + last.y - source.height) > 1e-8
  )
    throw new TypeError("Connector preset tips must span the ordered opposite corners.");
  if (begin.x === end.x && begin.y === end.y)
    return Object.freeze({ status: "degenerate", begin, end });

  const vector = { x: coordinate(end.x - begin.x), y: coordinate(end.y - begin.y) };
  const axisEnd = rotate(vector, { x: rotation.x, y: -rotation.y });
  const map = (value: ShapeConnectorPoint): ShapeConnectorPoint =>
    point({
      // Ratios are evaluated before multiplying, avoiding thin-source overflow.
      x: ((value.x - first.x) / dx) * axisEnd.x,
      y: ((value.y - first.y) / dy) * axisEnd.y,
    });
  const axisCommands = mapCommands(commands, map);
  const axisPoints = commandPoints(axisCommands);
  const axisHandles = source.handles.map((handle) => ({ handle, position: map(handle.position) }));
  const axisBounds = bounds([...axisPoints, ...axisHandles.map((handle) => handle.position)]);
  const width = Math.max(1, axisBounds.width),
    height = Math.max(1, axisBounds.height);
  if (width > SHAPE_CONNECTOR_ROUTE_LIMITS.extent || height > SHAPE_CONNECTOR_ROUTE_LIMITS.extent)
    throw new RangeError("Shape connector route exceeds its render-extent budget.");
  const left = coordinate(axisBounds.x - (width - axisBounds.width) / 2);
  const top = coordinate(axisBounds.y - (height - axisBounds.height) / 2);
  const local = (value: ShapeConnectorPoint) => point({ x: value.x - left, y: value.y - top });
  const localCommands = mapCommands(axisCommands, local);
  const localEndpoints = Object.freeze([local({ x: 0, y: 0 }), local(axisEnd)]) as readonly [
    ShapeConnectorPoint,
    ShapeConnectorPoint,
  ];
  // Container padding can partially quantize a tiny component even when the
  // two tips remain distinct. Refuse material loss; never correct the tips by
  // snapping or creating a replacement vector. Non-cardinal inverse rotation
  // has a bounded cancellation error at the scale of the complete vector.
  const spanScale = Math.max(Math.abs(vector.x), Math.abs(vector.y));
  const basisRoundoff = rotation.x !== 0 && rotation.y !== 0 ? 8 * Number.EPSILON * spanScale : 0;
  for (const axis of ["x", "y"] as const) {
    const actual = localEndpoints[1][axis] - localEndpoints[0][axis];
    const allowed =
      Math.abs(axisEnd[axis]) * SHAPE_CONNECTOR_ROUTE_LIMITS.spanRelativeError + basisRoundoff;
    if (Math.abs(actual - axisEnd[axis]) > allowed)
      throw new RangeError(
        "Connector tips cannot be represented accurately inside the padded paint frame.",
      );
  }
  const center = rotate({ x: left + width / 2, y: top + height / 2 }, rotation);
  const paintRect = {
    x: coordinate(begin.x + center.x - width / 2),
    y: coordinate(begin.y + center.y - height / 2),
    width,
    height,
  };
  const paintLayout = freezeLayout(resolvePictureLayout(paintRect, carrier.angleDeg));
  const paintedBegin = shapeFrameLocalToWorld(paintRect, carrier.angleDeg, localEndpoints[0]);
  const paintedEnd = shapeFrameLocalToWorld(paintRect, carrier.angleDeg, localEndpoints[1]);
  for (const axis of ["x", "y"] as const) {
    const actual = paintedEnd[axis] - paintedBegin[axis];
    // Meaningful nonzero worksheet components retain component-relative
    // precision. An exactly zero component permits only ordinary transform
    // roundoff at the complete span scale, never a fabricated nonzero axis.
    const allowed =
      vector[axis] === 0
        ? 8 * Number.EPSILON * spanScale
        : Math.abs(vector[axis]) * SHAPE_CONNECTOR_ROUTE_LIMITS.spanRelativeError;
    if (Math.abs(actual - vector[axis]) > allowed)
      throw new RangeError(
        "Connector tips cannot be represented accurately in the worksheet paint transform.",
      );
  }
  const geometry: EvaluatedShapePresetGeometry = Object.freeze({
    width,
    height,
    paths: Object.freeze([
      Object.freeze({
        filled: sourcePath.filled,
        fillMode: sourcePath.fillMode,
        stroke: sourcePath.stroke,
        commands: localCommands,
      }),
    ]),
    handles: Object.freeze(
      axisHandles.map(({ handle, position }) =>
        Object.freeze({
          kind: handle.kind,
          position: local(position),
          fields: Object.freeze(handle.fields.map((field) => Object.freeze({ ...field }))),
        }),
      ),
    ),
    adjustments: Object.freeze({ ...source.adjustments }),
    textRect: null,
    connectionSites: Object.freeze([]),
  });
  const firstDifferent = axisPoints.find((value) => value.x !== 0 || value.y !== 0);
  const lastDifferent = [...axisPoints]
    .reverse()
    .find((value) => value.x !== axisEnd.x || value.y !== axisEnd.y);
  if (!firstDifferent || !lastDifferent)
    throw new RangeError("Connector endpoint tangents underflow.");
  const worldPoints = axisPoints.map((value) => {
    const rotated = rotate(value, rotation);
    return point({ x: begin.x + rotated.x, y: begin.y + rotated.y });
  });
  return Object.freeze({
    status: "ready",
    begin,
    end,
    beginTangent: tangent({ x: 0, y: 0 }, firstDifferent, rotation),
    endTangent: tangent(lastDifferent, axisEnd, rotation),
    localEndpoints,
    geometry,
    paintLayout,
    shapeFlipX: false,
    shapeFlipY: false,
    worldBounds: Object.freeze(bounds(worldPoints)),
  });
}
