import {
  evaluateShapeGuide,
  readShapeGuide,
  shapeGuideVariables,
} from "../shape-presets/formula.js";
import type { ShapeAdjustmentHandle } from "../shape-presets/types.js";
import { TEXT_WARP_PRESET_DEFAULTS } from "./catalog.js";
import { normalizeShapeTextWarp } from "./contract.js";
import { TEXT_WARP_DEFINITIONS } from "./definitions.js";
import type {
  EvaluatedTextWarpGeometry,
  ShapeTextWarp,
  TextWarpBoundary,
  TextWarpPathCommand,
} from "./types.js";

const TURN = 2 * Math.PI;
const ANGLE_RADIAN = Math.PI / 10_800_000;

/** Text-only limits. The existing ordinary body preset limits are unchanged. */
export const TEXT_WARP_GEOMETRY_LIMITS = Object.freeze({
  maximumExtent: 16_384,
  maximumCoordinate: 10_000_000,
  maximumGuides: 128,
  maximumPaths: 6,
  maximumCommands: 16,
  maximumAdjustments: 2,
  maximumHandles: 2,
});

function coordinate(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > TEXT_WARP_GEOMETRY_LIMITS.maximumCoordinate)
    throw new RangeError("Text warp exceeds its logical-coordinate budget.");
  return value === 0 ? 0 : value;
}

/** DrawingML radial directions become continuous directed ellipse parameters. */
function ellipseParameter(angle: number, rx: number, ry: number): number {
  const turns = Math.floor((angle + Math.PI) / TURN);
  const reduced = angle - turns * TURN;
  return Math.atan2(rx * Math.sin(reduced), ry * Math.cos(reduced)) + turns * TURN;
}

/** Evaluate only a catalog identity in the original, unreflected actual text rectangle. */
export function evaluateTextWarp(
  input: ShapeTextWarp,
  width: number,
  height: number,
): EvaluatedTextWarpGeometry {
  if (
    ![width, height].every(
      (value) =>
        Number.isFinite(value) && value > 0 && value <= TEXT_WARP_GEOMETRY_LIMITS.maximumExtent,
    )
  )
    throw new RangeError("Text warp extents must be positive and at most 16,384 pixels.");
  const warp = normalizeShapeTextWarp(input);
  if (!warp) throw new TypeError("Text warp geometry requires an active preset.");
  const definition = TEXT_WARP_DEFINITIONS[warp.preset];
  const adjustments = { ...TEXT_WARP_PRESET_DEFAULTS[warp.preset], ...warp.adjustments };
  if (
    definition.guides.length + Object.keys(adjustments).length >
      TEXT_WARP_GEOMETRY_LIMITS.maximumGuides ||
    definition.paths.length > TEXT_WARP_GEOMETRY_LIMITS.maximumPaths ||
    definition.handles.length > TEXT_WARP_GEOMETRY_LIMITS.maximumHandles ||
    Object.keys(adjustments).length > TEXT_WARP_GEOMETRY_LIMITS.maximumAdjustments
  )
    throw new RangeError("Text warp definition exceeds its work budget.");
  const variables = { ...shapeGuideVariables(width, height), ...adjustments };
  const guides: Record<string, number> = {};
  for (const guide of definition.guides) {
    const value = evaluateShapeGuide(guide.slice(1), variables);
    variables[guide[0]!] = value;
    guides[guide[0]!] = value;
  }
  const read = (token: string) => readShapeGuide(token, variables);
  let commandCount = 0;
  const boundaries: TextWarpBoundary[] = definition.paths.map((path) => {
    const commands: TextWarpPathCommand[] = [];
    let x = 0,
      y = 0;
    for (const raw of path.commands) {
      if (++commandCount > TEXT_WARP_GEOMETRY_LIMITS.maximumCommands)
        throw new RangeError("Text warp paths exceed their command budget.");
      const args = raw.slice(1).map(read);
      if (raw[0] === "moveTo" || raw[0] === "lnTo") {
        if (args.length !== 2) throw new TypeError("Invalid text warp point.");
        x = coordinate(args[0]!);
        y = coordinate(args[1]!);
        commands.push([raw[0] === "moveTo" ? "M" : "L", x, y]);
      } else if (raw[0] === "quadBezTo") {
        if (args.length !== 4) throw new TypeError("Invalid text warp quadratic curve.");
        x = coordinate(args[2]!);
        y = coordinate(args[3]!);
        commands.push(["Q", coordinate(args[0]!), coordinate(args[1]!), x, y]);
      } else if (raw[0] === "cubicBezTo") {
        if (args.length !== 6) throw new TypeError("Invalid text warp cubic curve.");
        x = coordinate(args[4]!);
        y = coordinate(args[5]!);
        commands.push([
          "C",
          coordinate(args[0]!),
          coordinate(args[1]!),
          coordinate(args[2]!),
          coordinate(args[3]!),
          x,
          y,
        ]);
      } else if (raw[0] === "arcTo") {
        if (args.length !== 4) throw new TypeError("Invalid text warp arc.");
        const rx = coordinate(Math.abs(args[0]!)),
          ry = coordinate(Math.abs(args[1]!));
        const start = ellipseParameter(args[2]! * ANGLE_RADIAN, rx, ry),
          end = ellipseParameter((args[2]! + args[3]!) * ANGLE_RADIAN, rx, ry);
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          Math.abs(end - start) > 2 * TURN + 1e-8
        )
          throw new RangeError("Text warp arc exceeds its angular budget.");
        const cx = coordinate(x - rx * Math.cos(start)),
          cy = coordinate(y - ry * Math.sin(start));
        x = coordinate(cx + rx * Math.cos(end));
        y = coordinate(cy + ry * Math.sin(end));
        if (rx === 0 || ry === 0) commands.push(["L", x, y]);
        else commands.push(["A", rx, ry, cx, cy, start, end]);
      } else throw new TypeError("Unknown or closed text warp boundary command.");
    }
    return { commands };
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
        throw new TypeError("Text warp handle refers to an undeclared adjustment.");
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
  return {
    preset: warp.preset,
    width,
    height,
    family: definition.family,
    boundaries,
    tracks: definition.tracks.map((track) => ({ ...track })),
    bands: definition.bands.map((band) => ({ ...band })),
    guides,
    handles,
    adjustments,
  };
}
