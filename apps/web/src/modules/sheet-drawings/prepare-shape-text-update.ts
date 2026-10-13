import {
  requireLegacySheetDrawing,
  isFramedShapeDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  isShapeGroupDrawing,
  traverseShapeGroup,
  type ShapeGroupDrawing,
  type ShapeGroupNode,
} from "@sheetcraft/core/shape-group";
import { updateResolvedShapeGroupLeaf, resolveShapeGroupProjection } from "./resolved-shape-group";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resizeShapeFrame, resolveShapeFrame } from "@sheetcraft/core/shape-frame";
import {
  resolveShapeDrawing,
  updateResolvedShapeDrawing,
  type ResolvedShapeDrawing,
} from "./resolved-shape-drawing";
import { shapeViewAtRect } from "./shape-view-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  prepareDrawingShapeTextCandidate,
  getDrawingShapeTextRect,
  layoutDrawingShapeText,
  type DrawingShapeTextRuntimeOptions,
} from "./shape-text-runtime";
import { standardShapeResizeRect } from "./standard-shape-layout";
import {
  planShapeTextPaint,
  preflightShapeTextGlyphBudgets,
  type ShapeTextPaintOptions,
} from "./shape-text-paint";
import { projectedShapeTextBounds } from "./shape-text-projection";
import { materializeDrawingShapeText, withDrawingShapeText } from "./shape-text-options";
import { requiresShapeGroupPaint, preflightShapeGroupPaint } from "./shape-group-paint";
import { resolveShapeForestForRender } from "./resolved-shape-render-source";
import { planShapeLeafPixels } from "./shape-leaf-pixels";

export type ShapeTextForestContext = {
  candidateForest: readonly SheetDrawing[];
  sourceForest: readonly SheetDrawing[];
  revision: number;
};
/** Clipboard/ownership proposals already contain the intended world geometry.
 * Validate their actual text and paint without treating transfer as a text edit. */
export type ShapeTextPreparationMode = "edit" | "preserve-geometry";

function forestWithRoot(
  root: SheetDrawing,
  forest: readonly SheetDrawing[],
): readonly SheetDrawing[] {
  if (!forest.some((value) => value.id === root.id))
    throw new TypeError("Shape text preparation requires its complete source forest.");
  return forest.map((value) => (value.id === root.id ? root : value));
}
function renderPass(
  root: SheetDrawing,
  metrics: PictureSheetMetrics,
  forest?: readonly SheetDrawing[],
  revision = 0,
) {
  return resolveShapeForestForRender({
    drawings: forest ? forestWithRoot(root, forest) : [root],
    metrics,
    revision,
  });
}
function projectGroup(
  root: ShapeGroupDrawing,
  metrics: PictureSheetMetrics,
  forest?: readonly SheetDrawing[],
  revision = 0,
) {
  if (!forest) return resolveShapeGroupProjection(root, metrics);
  const group = renderPass(root, metrics, forest, revision).getGroup(root.id);
  if (!group || group.sourceRoot !== root)
    throw new TypeError("Shape text preparation requires its exact group owner.");
  return group;
}
function assertConnectorTextUnchanged(
  candidate: SheetDrawing,
  source: SheetDrawing | undefined,
  sourceForest?: readonly SheetDrawing[],
): void {
  const roots = sourceForest ?? (source ? [source] : []);
  const before = new Map(
    roots
      .flatMap<SheetDrawing | ShapeGroupNode>((root) =>
        isShapeGroupDrawing(root) ? traverseShapeGroup(root).map(({ node }) => node) : [root],
      )
      .map((node) => [node.id, node] as const),
  );
  for (const node of isShapeGroupDrawing(candidate)
    ? traverseShapeGroup(candidate).map(({ node }) => node)
    : [candidate]) {
    if (node.kind !== "shape" || !node.shapeConnector) continue;
    const old = before.get(node.id);
    if (old && old.kind !== "shape")
      throw new TypeError("A connector cannot replace a text-bearing object.");
    if (
      node.text !== (old?.kind === "shape" ? old.text : "") ||
      !sameData(node.shapeText, old?.kind === "shape" ? old.shapeText : undefined)
    )
      throw new TypeError(
        "Connector text editing is unavailable; its original data has been preserved.",
      );
    for (const key of ["rotation3d", "format3d"] as const)
      if (
        node.shapeStyle?.[key]?.kind === "value" &&
        !sameData(node.shapeStyle[key], old?.kind === "shape" ? old.shapeStyle?.[key] : undefined)
      )
        throw new TypeError(
          "Connector 3D editing is unavailable; its original data has been preserved.",
        );
  }
}

function sameData(a: unknown, b: unknown) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
function autoFitInputs(drawing: SheetGraphicDrawing) {
  const text = materializeDrawingShapeText(drawing),
    layout = text.layout;
  return {
    family: text.fontFamily,
    characterRuns: text.characterRuns,
    direction: layout.direction,
    lineOrder: layout.lineOrder,
    margins: layout.marginsPt,
    wrap: layout.wrap,
    autoFit: layout.autoFit,
    paragraph: text.paragraph,
  };
}

/** One pre-command text/geometry candidate. Never writes history or mutates a
 * source. Canvas/font readiness failures leave the caller's draft intact. */
export function prepareShapeTextUpdate(
  candidate: SheetDrawing,
  source: SheetDrawing | undefined,
  viewport: SheetViewportLayout | undefined,
  measurement?: DrawingShapeTextRuntimeOptions,
  paint?: Pick<ShapeTextPaintOptions, "resources"> & {
    preflight?: typeof preflightShapeTextGlyphBudgets;
  },
  metrics?: PictureSheetMetrics,
  forestContext?: ShapeTextForestContext,
  mode: ShapeTextPreparationMode = "edit",
): SheetDrawing {
  assertConnectorTextUnchanged(candidate, source, forestContext?.sourceForest);
  if (isShapeGroupDrawing(candidate)) {
    if (!metrics) throw new Error("Shape group editing requires current worksheet metrics.");
    const prepared =
      mode === "preserve-geometry"
        ? candidate
        : prepareOwnedGroupTextEdits(
            candidate,
            source && isShapeGroupDrawing(source) ? source : undefined,
            metrics,
            measurement,
            forestContext,
          );
    preflightShapeGroupText(prepared, metrics, measurement, paint, forestContext);
    if (requiresShapeGroupPaint(prepared)) {
      const proof = preflightShapeGroupPaint({
        root: prepared,
        metrics,
        density: 1,
        resources: paint?.resources,
        textRuntimeOptions: measurement,
        ...(forestContext
          ? {
              renderPass: renderPass(
                prepared,
                metrics,
                forestContext.candidateForest,
                forestContext.revision,
              ),
            }
          : {}),
      });
      if (proof.kind !== "ready")
        throw new Error("Shape group appearance is not ready; the draft has been preserved.");
    }
    return prepared;
  }
  if (isFramedShapeDrawing(candidate)) {
    if (!metrics) throw new Error("Shape editing requires current worksheet metrics.");
    if (candidate.kind === "shape" && candidate.shapeConnector) {
      renderPass(candidate, metrics, forestContext?.candidateForest, forestContext?.revision);
      return candidate;
    }
    const resolved = resolveShapeDrawing(candidate, metrics);
    if (resolved.collapsed) return candidate;
    const owner = source && resolveShapeDrawing(source, metrics).view;
    const prepared = prepareShapeViewTextUpdate(
      resolved.view,
      owner,
      viewport,
      measurement,
      paint,
      resolved,
      mode,
    );
    return prepared === resolved.view
      ? candidate
      : updateResolvedShapeDrawing(resolved, prepared, metrics);
  }
  return prepareShapeViewTextUpdate(
    candidate,
    source,
    viewport,
    measurement,
    paint,
    undefined,
    mode,
  );
}
/** Group transforms preserve typography. An explicit member text/layout edit
 * still consumes that member's existing AutoFit setting and pinned local top edge. */
function prepareOwnedGroupTextEdits(
  candidate: ShapeGroupDrawing,
  source: ShapeGroupDrawing | undefined,
  metrics: PictureSheetMetrics,
  measurement: DrawingShapeTextRuntimeOptions | undefined,
  forestContext: ShapeTextForestContext | undefined,
): ShapeGroupDrawing {
  if (!source) return candidate;
  const before = new Map(
    projectGroup(source, metrics, forestContext?.sourceForest, forestContext?.revision).leaves.map(
      (leaf) => [JSON.stringify(leaf.path), leaf],
    ),
  );
  const edits = projectGroup(
    candidate,
    metrics,
    forestContext?.candidateForest,
    forestContext?.revision,
  ).leaves.filter((leaf) => {
    const old = before.get(JSON.stringify(leaf.path)),
      d = leaf.view,
      owner = old?.view;
    if (
      "shapeConnector" in leaf.sourceNode ||
      !d ||
      !owner ||
      !leaf.layout ||
      !old?.layout ||
      leaf.collapsed ||
      old.collapsed ||
      !getDrawingShapeTextRect(d)
    )
      return false;
    const contentChanged =
      d.text !== owner.text ||
      d.fontSize !== owner.fontSize ||
      d.bold !== owner.bold ||
      d.italic !== owner.italic ||
      !sameData(d.shapeGeometry, owner.shapeGeometry) ||
      !sameData(d.shapePath, owner.shapePath) ||
      !sameData(autoFitInputs(d), autoFitInputs(owner));
    const manualHeight =
      leaf.sourceNode.groupFrame.rect.heightRatio !== old.sourceNode.groupFrame.rect.heightRatio &&
      d.height !== owner.height &&
      sameData(d.shapeText, owner.shapeText);
    const manualWidth =
      leaf.sourceNode.groupFrame.rect.widthRatio !== old.sourceNode.groupFrame.rect.widthRatio &&
      Math.abs(d.width - owner.width) > 1e-7 * Math.max(1, d.width, owner.width);
    return contentChanged || manualHeight || manualWidth;
  });
  let result = candidate;
  for (const edit of edits) {
    const current = projectGroup(
      result,
      metrics,
      forestContext?.candidateForest,
      forestContext?.revision,
    ).leaves.find((leaf) => JSON.stringify(leaf.path) === JSON.stringify(edit.path));
    const old = before.get(JSON.stringify(edit.path));
    if (!current?.view || !current.layout || !old?.view || !old.layout)
      throw new Error("Shape member text owner is unavailable.");
    const manualHeight =
      current.sourceNode.groupFrame.rect.heightRatio !==
        old.sourceNode.groupFrame.rect.heightRatio &&
      current.view.height !== old.view.height &&
      sameData(current.view.shapeText, old.view.shapeText);
    const prepared = prepareDrawingShapeTextCandidate(current.view, {
      ...measurement,
      manualHeightChange: manualHeight,
      manualWidthChange:
        current.view.width !== old.view.width &&
        sameData(current.view.shapeText, old.view.shapeText),
      normalizeView: (view) => {
        const root = updateResolvedShapeGroupLeaf(current, view, metrics);
        const leaf = projectGroup(
          root,
          metrics,
          forestContext?.candidateForest,
          forestContext?.revision,
        ).leaves.find((item) => JSON.stringify(item.path) === JSON.stringify(current.path));
        if (!leaf?.view) throw new Error("Shape member text view is unavailable.");
        return leaf.view;
      },
    });
    let view = prepared.drawing;
    if (prepared.resized) {
      const delta = view.height - current.view.height,
        deltaWidth = view.width - current.view.width,
        angle = (current.layout.angleDeg * Math.PI) / 180;
      const rect = standardShapeResizeRect(
        current.layout.rect,
        current.layout.angleDeg,
        deltaWidth ? "se" : "s",
        {
          x: Math.cos(angle) * deltaWidth - Math.sin(angle) * delta,
          y: Math.sin(angle) * deltaWidth + Math.cos(angle) * delta,
        },
        false,
        1,
        true,
      );
      if (!rect) throw new Error("Shape member AutoFit cannot preserve its local top edge.");
      view = shapeViewAtRect(view, rect, metrics);
    }
    result = updateResolvedShapeGroupLeaf(current, view, metrics);
  }
  return result;
}
/** A collection/group transform owns placement only. Validate each genuine leaf
 * at its projected size without resizing it, rewriting AutoFit, or changing fonts. */
function preflightShapeGroupText(
  candidate: ShapeGroupDrawing,
  metrics: PictureSheetMetrics,
  measurement: DrawingShapeTextRuntimeOptions | undefined,
  paint: Parameters<typeof prepareShapeTextUpdate>[4],
  forestContext: ShapeTextForestContext | undefined,
): void {
  const projection = projectGroup(
    candidate,
    metrics,
    forestContext?.candidateForest,
    forestContext?.revision,
  );
  for (const leaf of projection.leaves) {
    const drawing = leaf.view;
    if (
      "shapeConnector" in leaf.sourceNode ||
      !drawing ||
      leaf.collapsed ||
      !drawing.text ||
      !getDrawingShapeTextRect(drawing)
    )
      continue;
    const layout = layoutDrawingShapeText(drawing, measurement);
    const options = { drawing, layout, density: 1, resources: paint?.resources };
    const plan = planShapeTextPaint(options);
    if (plan.kind !== "ready")
      throw new Error(
        "Shape group text paint resources are not ready; the draft has been preserved.",
      );
    const proof = (paint?.preflight ?? preflightShapeTextGlyphBudgets)(options);
    if (proof.kind !== "ready")
      throw new Error("Shape group text paint pixels are not ready; the draft has been preserved.");
    projectedShapeTextBounds(drawing, plan, paint?.resources?.theme, leaf.groupScene);
  }
}

function prepareShapeViewTextUpdate(
  candidate: SheetDrawing,
  source: SheetDrawing | undefined,
  viewport: SheetViewportLayout | undefined,
  measurement?: DrawingShapeTextRuntimeOptions,
  paint?: Pick<ShapeTextPaintOptions, "resources"> & {
    preflight?: typeof preflightShapeTextGlyphBudgets;
  },
  resolved?: ResolvedShapeDrawing,
  mode: ShapeTextPreparationMode = "edit",
): ReturnType<typeof requireLegacySheetDrawing> {
  const drawing = requireLegacySheetDrawing(candidate);
  const owner = source && requireLegacySheetDrawing(source);
  if (drawing.kind !== "shape" && drawing.kind !== "textBox") return drawing;
  // Genuine legacy TextBoxes keep their CSS layout and never materialize a
  // second text model merely because a body camera/depth was edited.
  if (
    drawing.kind === "textBox" &&
    !drawing.shapeText &&
    (drawing.shapeStyle?.rotation3d?.kind === "value" ||
      drawing.shapeStyle?.format3d?.kind === "value")
  ) {
    const leaf = planShapeLeafPixels({
      drawing,
      density: 1,
      resources: paint?.resources,
      textRuntimeOptions: measurement,
    });
    if (leaf.kind !== "ready")
      throw new Error(
        "TextBox body and text paint resources are not ready; the draft has been preserved.",
      );
    if (leaf.textLayout && leaf.textPlan) {
      const proof = (paint?.preflight ?? preflightShapeTextGlyphBudgets)({
        drawing,
        layout: leaf.textLayout,
        density: leaf.actualDensity,
        resources: paint?.resources,
      });
      if (proof.kind !== "ready")
        throw new Error("TextBox paint pixels are not ready; the draft has been preserved.");
    }
    return drawing;
  }
  // Shapes without a text area retain historical text without blocking unrelated properties.
  if (!getDrawingShapeTextRect(drawing)) return drawing;
  const manualHeightChange =
    mode !== "preserve-geometry" &&
    !!owner &&
    (owner.kind === "shape" || owner.kind === "textBox") &&
    drawing.height !== owner.height &&
    sameData(drawing.shapeText, owner.shapeText);
  const manualWidthChange =
    mode !== "preserve-geometry" &&
    !!owner &&
    (owner.kind === "shape" || owner.kind === "textBox") &&
    drawing.width !== owner.width &&
    sameData(drawing.shapeText, owner.shapeText);
  if (!drawing.text) {
    if (
      (manualHeightChange || (drawing.wordArt && manualWidthChange)) &&
      drawing.shapeText?.layout.autoFit === "resize-shape"
    ) {
      const text = materializeDrawingShapeText(drawing);
      text.layout.autoFit = "none";
      return withDrawingShapeText(drawing, text);
    }
    if (drawing.shapeText?.layout.autoFit !== "resize-shape" || !getDrawingShapeTextRect(drawing))
      return drawing;
  }
  if (!drawing.shapeText && drawing.shapeStyle?.rotation3d?.kind !== "value") return drawing;
  const unchangedLayout =
    owner &&
    (owner.kind === "shape" || owner.kind === "textBox") &&
    drawing.text === owner.text &&
    drawing.width === owner.width &&
    drawing.height === owner.height &&
    drawing.fontSize === owner.fontSize &&
    drawing.bold === owner.bold &&
    drawing.italic === owner.italic &&
    sameData(drawing.shapeGeometry, owner.shapeGeometry) &&
    sameData(drawing.shapePath, owner.shapePath) &&
    sameData(autoFitInputs(drawing), autoFitInputs(owner));
  if (
    mode !== "preserve-geometry" &&
    unchangedLayout &&
    drawing.kind === owner.kind &&
    drawing.color === owner.color &&
    drawing.rotation === owner.rotation &&
    sameData(drawing.shapeStyle, owner.shapeStyle) &&
    sameData(drawing.shapeText, owner.shapeText) &&
    drawing.shapeFlipX === owner.shapeFlipX &&
    drawing.shapeFlipY === owner.shapeFlipY
  )
    return drawing;
  // Paint-only rotation/color/body changes require genuine alpha proof, but
  // cannot silently resize an already fitted frame a second time.
  const prepared =
    unchangedLayout || mode === "preserve-geometry"
      ? {
          drawing,
          layout: layoutDrawingShapeText(drawing, measurement),
          resized: false,
        }
      : prepareDrawingShapeTextCandidate(drawing, {
          ...measurement,
          manualHeightChange,
          manualWidthChange,
          ...(resolved
            ? {
                normalizeView: (view: SheetGraphicDrawing) =>
                  resolveShapeDrawing(
                    updateResolvedShapeDrawing(resolved, view, resolved.metrics),
                    resolved.metrics,
                  ).view as SheetGraphicDrawing,
              }
            : {}),
        });
  if (prepared.drawing.text) {
    const textPlan = planShapeTextPaint({
      drawing: prepared.drawing,
      layout: prepared.layout,
      density: 1,
      resources: paint?.resources,
    });
    if (textPlan.kind !== "ready")
      throw new Error("Shape text paint resources are not ready; the draft has been preserved.");
    const proof = (paint?.preflight ?? preflightShapeTextGlyphBudgets)({
      drawing: prepared.drawing,
      layout: prepared.layout,
      density: 1,
      resources: paint?.resources,
    });
    if (proof.kind !== "ready")
      throw new Error("Shape text paint pixels are not ready; the draft has been preserved.");
    projectedShapeTextBounds(prepared.drawing, textPlan);
  }
  if (!prepared.resized) return prepared.drawing;
  if (resolved && isFramedShapeDrawing(resolved.source)) {
    const frame = resizeShapeFrame(
      resolved.source.shapeFrame,
      {
        width: prepared.drawing.width,
        height: prepared.drawing.height,
      },
      resolved.metrics,
      prepared.drawing.rotation,
    );
    return shapeViewAtRect(
      prepared.drawing,
      resolveShapeFrame(frame, resolved.metrics, prepared.drawing.rotation).rect,
      resolved.metrics,
    );
  }
  if (!viewport) throw new Error("Shape AutoFit requires the current worksheet geometry.");
  const frame = getFloatingImageSheetRect(drawing, viewport);
  if (!frame) throw new Error("Shape AutoFit anchor is unavailable.");
  const delta = prepared.drawing.height - drawing.height;
  const deltaWidth = prepared.drawing.width - drawing.width;
  const radians = (drawing.rotation * Math.PI) / 180;
  const rect = standardShapeResizeRect(
    frame,
    drawing.rotation,
    deltaWidth ? "se" : "s",
    {
      x: Math.cos(radians) * deltaWidth - Math.sin(radians) * delta,
      y: Math.sin(radians) * deltaWidth + Math.cos(radians) * delta,
    },
    false,
    1,
  );
  const result = rect && reanchorFloatingImageAtSheetRect(prepared.drawing, rect, viewport);
  if (!result)
    throw new Error("Shape AutoFit cannot preserve its local top edge at this worksheet boundary.");
  return result as SheetGraphicDrawing;
}
