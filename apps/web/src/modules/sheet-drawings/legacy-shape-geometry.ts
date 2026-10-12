import type { DrawingShape } from "@sheetcraft/core/sheet-drawings";
import type {
  EvaluatedShapePresetGeometry,
  ShapePathCommand,
} from "@sheetcraft/core/shape-presets";
const cache = new Map<string, EvaluatedShapePresetGeometry>();

/** Exact numeric counterpart of the original nine 100×100 SVGs.
 * Used only for explicitly styled legacy shapes; it never migrates stored data
 * or substitutes a standard preset with a different outline or text rectangle. */
export function getLegacyShapeGeometry(
  shape: DrawingShape,
  width: number,
  height: number,
): EvaluatedShapePresetGeometry | undefined {
  if (![width, height].every((n) => Number.isFinite(n) && n >= 1 && n <= 16384)) return;
  const key = JSON.stringify([shape, width, height]);
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const x = (n: number) => (n * width) / 100;
  const y = (n: number) => (n * height) / 100;
  const m = (a: number, b: number): ShapePathCommand => ["M", x(a), y(b)];
  const l = (a: number, b: number): ShapePathCommand => ["L", x(a), y(b)];
  const arc = (
    rx: number,
    ry: number,
    cx: number,
    cy: number,
    start: number,
    end: number,
  ): ShapePathCommand => ["A", x(rx), y(ry), x(cx), y(cy), start, end];
  let commands: ShapePathCommand[];
  switch (shape) {
    case "rectangle":
      commands = [m(2, 2), l(98, 2), l(98, 98), l(2, 98), ["Z"]];
      break;
    case "roundedRectangle":
      commands = [
        m(14, 2),
        l(86, 2),
        arc(12, 12, 86, 14, -Math.PI / 2, 0),
        l(98, 86),
        arc(12, 12, 86, 86, 0, Math.PI / 2),
        l(14, 98),
        arc(12, 12, 14, 86, Math.PI / 2, Math.PI),
        l(2, 14),
        arc(12, 12, 14, 14, Math.PI, Math.PI * 1.5),
        ["Z"],
      ];
      break;
    case "ellipse":
      commands = [m(98, 50), arc(48, 48, 50, 50, 0, Math.PI * 2), ["Z"]];
      break;
    case "triangle":
      commands = [m(50, 2), l(98, 98), l(2, 98), ["Z"]];
      break;
    case "diamond":
      commands = [m(50, 2), l(98, 50), l(50, 98), l(2, 50), ["Z"]];
      break;
    case "arrow":
      commands = [m(2, 32), l(60, 32), l(60, 2), l(98, 50), l(60, 98), l(60, 68), l(2, 68), ["Z"]];
      break;
    case "line":
      commands = [m(2, 98), l(98, 2)];
      break;
    case "star":
      commands = [
        m(50, 2),
        l(62, 35),
        l(98, 37),
        l(70, 60),
        l(80, 96),
        l(50, 75),
        l(20, 96),
        l(30, 60),
        l(2, 37),
        l(38, 35),
        ["Z"],
      ];
      break;
    case "heart":
      commands = [
        m(50, 94),
        ["C", x(-30), y(40), x(8), y(-20), x(50), y(20)],
        ["C", x(92), y(-20), x(130), y(40), x(50), y(94)],
        ["Z"],
      ];
      break;
    default:
      return;
  }
  const geometry: EvaluatedShapePresetGeometry = Object.freeze({
    width,
    height,
    paths: Object.freeze([
      Object.freeze({
        filled: shape !== "line",
        fillMode: shape === "line" ? "none" : "norm",
        stroke: true,
        commands: Object.freeze(commands.map((c) => Object.freeze(c))),
      }),
    ]),
    handles: Object.freeze([]),
    adjustments: Object.freeze({}),
    textRect: Object.freeze({
      left: Math.min(6, width / 2),
      top: Math.min(6, height / 2),
      right: Math.max(width - 6, width / 2),
      bottom: Math.max(height - 6, height / 2),
    }),
    connectionSites: Object.freeze([]),
  });
  cache.set(key, geometry);
  if (cache.size > 128) cache.delete(cache.keys().next().value!);
  return geometry;
}
