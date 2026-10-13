import {
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { normalizeShapeConnector } from "@sheetcraft/core/shape-connector";
import { resolveSheetShapeConnections } from "@sheetcraft/core/shape-connector-layout";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { ShapeLineChoice } from "./shape-gallery";
import type { ShapeConnectorSiteCandidate } from "./shape-connector-site-picking";
import { frameShapeView } from "./shape-view-layout";
import { SHAPE_CREATION_LIMITS, type ShapeCreationPoint } from "./shape-creation-geometry";

function constrainedEnd(start: ShapeCreationPoint, end: ShapeCreationPoint): ShapeCreationPoint {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    length = Math.hypot(dx, dy),
    octant = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8,
    diagonal = length / Math.SQRT2;
  const x = [length, diagonal, 0, -diagonal, -length, -diagonal, 0, diagonal][octant]!;
  const y = [0, diagonal, length, diagonal, 0, -diagonal, -length, -diagonal][octant]!;
  return { x: start.x + x, y: start.y + y };
}

/** Create a source carrier and two independent, exact tips; padding is never tip geometry. */
export function createShapeConnectorDrawing(options: {
  base: SheetGraphicDrawing;
  choice: ShapeLineChoice;
  start: ShapeCreationPoint;
  end: ShapeCreationPoint;
  beginSite?: ShapeConnectorSiteCandidate;
  endSite?: ShapeConnectorSiteCandidate;
  shiftKey?: boolean;
  forest: readonly SheetDrawing[];
  metrics: PictureSheetMetrics;
}): SheetFramedGraphicDrawing | null {
  try {
    if (options.base.kind !== "shape" || options.forest.some((node) => node.id === options.base.id))
      return null;
    const start = options.beginSite?.position ?? options.start;
    const end =
      options.endSite?.position ??
      (options.shiftKey ? constrainedEnd(start, options.end) : options.end);
    const totalWidth = options.metrics.columns.visiblePrefix(options.metrics.columns.count),
      totalHeight = options.metrics.rows.visiblePrefix(options.metrics.rows.count);
    for (const point of [start, end])
      if (
        ![point.x, point.y].every(Number.isFinite) ||
        point.x < 0 ||
        point.y < 0 ||
        point.x > Math.min(totalWidth, SHAPE_CREATION_LIMITS.coordinate) ||
        point.y > Math.min(totalHeight, SHAPE_CREATION_LIMITS.coordinate)
      )
        return null;
    const dx = Math.abs(end.x - start.x),
      dy = Math.abs(end.y - start.y);
    if (Math.hypot(dx, dy) === 0 || Math.max(dx, dy) > SHAPE_CREATION_LIMITS.extent) return null;
    const width = Math.max(1, dx),
      height = Math.max(1, dy);
    if (width > totalWidth || height > totalHeight) return null;
    const rect = {
      x: Math.min(Math.min(start.x, end.x), totalWidth - width),
      y: Math.min(Math.min(start.y, end.y), totalHeight - height),
      width,
      height,
    };
    const source = frameShapeView(
      {
        ...options.base,
        text: "",
        shape: "line",
        shapeGeometry: { preset: options.choice.preset },
        shapeLineEnds: {
          ...(options.choice.beginArrow === "triangle" ? { begin: { kind: "triangle" } } : {}),
          ...(options.choice.endArrow === "triangle" ? { end: { kind: "triangle" } } : {}),
        },
        fill: "transparent",
        rotation: 0,
        anchor: { row: 0, column: 0 },
        offsetX: rect.x,
        offsetY: rect.y,
        width,
        height,
      },
      options.metrics,
    );
    delete source.shapeFlipX;
    delete source.shapeFlipY;
    const endpoint = (point: ShapeCreationPoint, site?: ShapeConnectorSiteCandidate) =>
      site
        ? {
            kind: "site" as const,
            targetId: site.targetId,
            preset: site.preset,
            siteIndex: site.siteIndex,
          }
        : {
            kind: "free" as const,
            xRatio: (point.x - rect.x) / width,
            yRatio: (point.y - rect.y) / height,
          };
    source.shapeConnector = normalizeShapeConnector({
      kind: "shape-connector-v1",
      begin: endpoint(start, options.beginSite),
      end: endpoint(end, options.endSite),
    });
    const context = resolveSheetShapeConnections([...options.forest, source], options.metrics);
    for (const site of [options.beginSite, options.endSite]) {
      if (!site) continue;
      const target = context.getTarget(site.targetId);
      if (
        !target ||
        target.preset !== site.preset ||
        JSON.stringify(target.path) !== JSON.stringify(site.path)
      )
        return null;
    }
    const resolved = context.getConnector(source.id);
    if (
      !resolved ||
      resolved.status !== "ready" ||
      resolved.begin.status !== "ready" ||
      resolved.end.status !== "ready"
    )
      return null;
    for (const [actual, expected] of [
      [resolved.begin.position, start],
      [resolved.end.position, end],
    ] as const) {
      const tolerance =
        Math.max(1, Math.abs(expected.x), Math.abs(expected.y)) * Number.EPSILON * 64;
      if (Math.hypot(actual.x - expected.x, actual.y - expected.y) > tolerance) return null;
    }
    return source;
  } catch {
    return null;
  }
}
