import type { ResolvedShapeForestForRender } from "./resolved-shape-render-source";
import {
  planShapeDetailedPaint,
  ShapePaintUnavailableError,
  type ShapePaintResources,
} from "./shape-detailed-paint";

/** Validate the actual final route, not its persisted carrier or an earlier candidate. */
export function preflightShapeConnectorPaint(
  pass: ResolvedShapeForestForRender,
  resources?: ShapePaintResources,
): void {
  for (const leaf of pass.leaves) {
    const connector = leaf.connector;
    if (connector?.status !== "ready") continue;
    const plan = planShapeDetailedPaint({
      drawing: connector.paintView,
      geometry: connector.route.geometry,
      connectorRoute: connector.route,
      density: 1,
      resources,
    });
    if (plan.kind !== "ready") throw new ShapePaintUnavailableError(plan);
  }
}
