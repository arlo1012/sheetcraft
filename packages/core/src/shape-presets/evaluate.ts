import { SHAPE_PRESET_DEFINITIONS } from "./definitions.js";
import { SHAPE_PRESET_DEFAULTS } from "./catalog.js";
import { normalizeShapePresetParameters } from "./contract.js";
import { evaluateShapeGuide, readShapeGuide, shapeGuideVariables } from "./formula.js";
import type {
  PictureCropShape,
  ShapeAdjustmentHandle,
  ShapePathCommand,
  ShapePresetGeometry,
  ShapePresetPath,
} from "./types.js";

const TURN = 2 * Math.PI;
const ANGLE_RADIAN = Math.PI / 10_800_000;
function coordinate(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > 10_000_000)
    throw new RangeError("Preset geometry exceeds its logical-coordinate budget.");
  return value === 0 ? 0 : value;
}
/** DrawingML arc angles are radial directions, not ellipse parameters. */
function ellipseParameter(angle: number, rx: number, ry: number): number {
  const turns = Math.floor((angle + Math.PI) / TURN);
  const reduced = angle - turns * TURN;
  return Math.atan2(rx * Math.sin(reduced), ry * Math.cos(reduced)) + turns * TURN;
}

export function evaluateShapePreset(
  input: PictureCropShape | undefined,
  width: number,
  height: number,
): ShapePresetGeometry {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0 && value <= 10_000))
    throw new RangeError("Preset extents must be positive and at most 10,000 pixels.");
  const shape = normalizeShapePresetParameters(input) ?? { preset: "rect" as const };
  const definition = SHAPE_PRESET_DEFINITIONS[shape.preset];
  if (
    definition.guides.length > 512 ||
    definition.paths.length > 16 ||
    definition.handles.length > 16
  )
    throw new RangeError("Preset definition exceeds its work budget.");
  const adjustments = { ...SHAPE_PRESET_DEFAULTS[shape.preset], ...shape.adjustments };
  const variables = { ...shapeGuideVariables(width, height), ...adjustments };
  for (const guide of definition.guides)
    variables[guide[0]!] = evaluateShapeGuide(guide.slice(1), variables);
  const read = (token: string) => readShapeGuide(token, variables);
  let commandCount = 0;
  const paths: ShapePresetPath[] = definition.paths.map((path) => {
    const sx = path.width ? width / read(path.width) : 1;
    const sy = path.height ? height / read(path.height) : 1;
    if (![sx, sy].every((value) => Number.isFinite(value) && value > 0))
      throw new RangeError("Preset path coordinate space must be positive.");
    const commands: ShapePathCommand[] = [];
    let x = 0,
      y = 0,
      startX = 0,
      startY = 0;
    for (const raw of path.commands) {
      if (++commandCount > 1024) throw new RangeError("Preset path exceeds its command budget.");
      const args = raw.slice(1).map(read);
      if (raw[0] === "moveTo" || raw[0] === "lnTo") {
        if (args.length !== 2) throw new TypeError("Invalid preset point.");
        x = coordinate(args[0]! * sx);
        y = coordinate(args[1]! * sy);
        commands.push([raw[0] === "moveTo" ? "M" : "L", x, y]);
        if (raw[0] === "moveTo") {
          startX = x;
          startY = y;
        }
      } else if (raw[0] === "quadBezTo") {
        if (args.length !== 4) throw new TypeError("Invalid preset quadratic curve.");
        x = coordinate(args[2]! * sx);
        y = coordinate(args[3]! * sy);
        commands.push(["Q", coordinate(args[0]! * sx), coordinate(args[1]! * sy), x, y]);
      } else if (raw[0] === "cubicBezTo") {
        if (args.length !== 6) throw new TypeError("Invalid preset cubic curve.");
        x = coordinate(args[4]! * sx);
        y = coordinate(args[5]! * sy);
        commands.push([
          "C",
          coordinate(args[0]! * sx),
          coordinate(args[1]! * sy),
          coordinate(args[2]! * sx),
          coordinate(args[3]! * sy),
          x,
          y,
        ]);
      } else if (raw[0] === "arcTo") {
        if (args.length !== 4) throw new TypeError("Invalid preset arc.");
        const rx = coordinate(Math.abs(args[0]!)),
          ry = coordinate(Math.abs(args[1]!));
        const start = ellipseParameter(args[2]! * ANGLE_RADIAN, rx, ry),
          end = ellipseParameter((args[2]! + args[3]!) * ANGLE_RADIAN, rx, ry);
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          Math.abs(end - start) > 2 * TURN + 1e-8
        )
          throw new RangeError("Preset arc exceeds its angular budget.");
        const cx = coordinate(x - rx * Math.cos(start) * sx),
          cy = coordinate(y - ry * Math.sin(start) * sy);
        const scaledRx = coordinate(rx * sx),
          scaledRy = coordinate(ry * sy);
        x = coordinate(cx + scaledRx * Math.cos(end));
        y = coordinate(cy + scaledRy * Math.sin(end));
        if (scaledRx === 0 || scaledRy === 0) commands.push(["L", x, y]);
        else commands.push(["A", scaledRx, scaledRy, cx, cy, start, end]);
      } else if (raw[0] === "close") {
        if (args.length) throw new TypeError("Invalid preset close command.");
        commands.push(["Z"]);
        x = startX;
        y = startY;
      } else throw new TypeError("Unknown preset path command.");
    }
    return { filled: path.fill !== "none", stroke: path.stroke, commands };
  });
  const handles: ShapeAdjustmentHandle[] = definition.handles.map((handle) => {
    const refs =
      handle.kind === "ahXY"
        ? ([
            ["X", "x"],
            ["Y", "y"],
          ] as const)
        : ([
            ["R", "radius"],
            ["Ang", "angle"],
          ] as const);
    const fields = refs.flatMap(([suffix, axis]) => {
      const name = handle.fields[`gdRef${suffix}`];
      if (!name) return [];
      if (!Object.hasOwn(adjustments, name))
        throw new TypeError("Handle refers to an undeclared adjustment.");
      const minimum = handle.fields[`min${suffix}`]
        ? read(handle.fields[`min${suffix}`]!)
        : -2_147_483_647;
      const maximum = handle.fields[`max${suffix}`]
        ? read(handle.fields[`max${suffix}`]!)
        : 2_147_483_647;

      return [
        {
          name,
          axis,
          minimum,
          maximum,
          value: adjustments[name]!,
          ...(minimum > maximum ? { disabled: true } : {}),
        },
      ];
    });
    return {
      kind: handle.kind === "ahXY" ? "xy" : "polar",
      position: {
        x: coordinate(read(handle.position[0])),
        y: coordinate(read(handle.position[1])),
      },
      fields,
    };
  });
  return { width, height, paths, handles, adjustments };
}
