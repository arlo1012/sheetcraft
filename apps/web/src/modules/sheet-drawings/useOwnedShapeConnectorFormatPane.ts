import { computed, shallowRef, watch } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import {
  findShapeGroupNode,
  type ShapeGroupPath,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import {
  getShapeObjectProperties,
  normalizeShapeObjectProperties,
} from "@sheetcraft/core/shape-object-properties";
import { normalizeShapeLineEnds } from "@sheetcraft/core/shape-line-ends";
import {
  getShapeConnectorNumericSize,
  planShapeConnectorSizeChange,
  type ShapeConnectorNumericSize,
} from "@sheetcraft/core/shape-connector-editing";
import { materializeShapeConnectorTargets } from "@sheetcraft/core/shape-connector-materialize";
import { getShapeStyleAssetIds, normalizeShapeStyle } from "@sheetcraft/core/shape-style";
import {
  normalizeSheetDrawings,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { Sheet, Workbook } from "@sheetcraft/core/workbook";
import {
  resolveShapeForestForRender,
  type ResolvedShapeForestForRender,
  type ResolvedShapeRenderLeaf,
} from "./resolved-shape-render-source";
import {
  planShapeDetailedPaint,
  resolveShapeDetailedPaintStyle,
  type ShapePaintResources,
} from "./shape-detailed-paint";
import {
  shapeFormatOwnerKey,
  type ShapeFormatCapabilities,
  type ShapeFormatField,
  type ShapeFormatIntent,
  type ShapeFormatSnapshot,
  type ShapeFormatStyleCategory,
} from "./shape-format-pane-model";
import { createShapeFormatTranslate } from "./components/shape-format/shape-format-labels";

type ConnectorSource = (SheetFramedGraphicDrawing | SheetGroupedGraphicDrawing) & { kind: "shape" };
type ReadyLeaf = ResolvedShapeRenderLeaf & {
  sourceNode: ConnectorSource;
  connector: Extract<NonNullable<ResolvedShapeRenderLeaf["connector"]>, { status: "ready" }>;
};
const categories: readonly ShapeFormatStyleCategory[] = [
  "fill",
  "line",
  "shadow",
  "reflection",
  "glow",
  "softEdges",
  "format3d",
  "rotation3d",
];
const openCategories = new Set<ShapeFormatStyleCategory>([
  "line",
  "shadow",
  "reflection",
  "glow",
  "softEdges",
]);
const objectFields = new Set<ShapeFormatField>([
  "lockAspectRatio",
  "printObject",
  "locked",
  "altTitle",
  "altDescription",
]);
const numericFields = new Set<ShapeFormatField>([
  "sizeWidthPt",
  "sizeHeightPt",
  "scaleWidthPercent",
  "scaleHeightPercent",
]);
const fields: readonly ShapeFormatField[] = [
  "sizeWidthPt",
  "sizeHeightPt",
  "rotationDeg",
  "scaleWidthPercent",
  "scaleHeightPercent",
  "lockAspectRatio",
  "anchor",
  "printObject",
  "locked",
  "altTitle",
  "altDescription",
  "shapeKeepTextFlat",
  "textVerticalAlignment",
  "textDirection",
  "textLineOrder",
  "textMarginLeftPt",
  "textMarginRightPt",
  "textMarginTopPt",
  "textMarginBottomPt",
  "textResizeToFit",
  "textOverflow",
  "textWrap",
  "fontFamily",
  "fontSizePt",
  "textBold",
  "textItalic",
  "textUnderline",
  "textStrike",
  "paragraphAlignment",
  "paragraphBeforePt",
  "paragraphAfterPt",
  "paragraphLineSpacing",
  "paragraphLineSpacingPt",
];
function samePath(a: ShapeGroupPath, b: ShapeGroupPath) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
function readyLeaf(pass: ResolvedShapeForestForRender, root: SheetDrawing, path: ShapeGroupPath) {
  const leaf = pass.getLeaf(path.at(-1)!);
  return leaf &&
    leaf.sourceRoot === root &&
    samePath(leaf.path, path) &&
    leaf.sourceNode.kind === "shape" &&
    ("shapeFrame" in leaf.sourceNode || "groupFrame" in leaf.sourceNode) &&
    leaf.connector?.status === "ready"
    ? (leaf as ReadyLeaf)
    : undefined;
}
function canonicalNode(root: SheetDrawing, path: ShapeGroupPath): ConnectorSource | undefined {
  const node =
    root.kind === "shapeGroup"
      ? findShapeGroupNode(root, path)?.node
      : samePath(path, [root.id])
        ? root
        : undefined;
  return node?.kind === "shape" &&
    node.shapeConnector &&
    ("shapeFrame" in node || "groupFrame" in node)
    ? (node as ConnectorSource)
    : undefined;
}
function anchorValue(root: SheetDrawing) {
  const mode = "shapeFrame" in root ? root.shapeFrame.anchor.mode : "move-only";
  return mode === "move-and-size"
    ? ("move-size" as const)
    : mode === "move-only"
      ? ("move" as const)
      : ("fixed" as const);
}

/** The complete relation pass leases canonical sources; disposable paint views never own edits. */
export function useOwnedShapeConnectorFormatPane(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  getMetrics?: () => PictureSheetMetrics | undefined;
  isBusy: () => boolean;
  flush: () => boolean;
  replaceCollection: (
    next: readonly SheetDrawing[],
    expected: readonly SheetDrawing[],
    metrics: PictureSheetMetrics,
    guard?: () => boolean,
  ) => boolean;
  getUnsupportedReason?: () => string;
  getLocale?: () => "en-US" | "zh-CN";
  isAssetAvailable?: (id: string) => boolean;
  getPaintResources?: () => ShapePaintResources;
}) {
  type Selection = {
    workbook: Workbook;
    sheet: Sheet;
    generation: number;
    rootId: string;
    rootKind: SheetDrawing["kind"];
    path: ShapeGroupPath;
    sessionId: string;
    baseline: { width: number; height: number };
    size: ShapeConnectorNumericSize;
    pass: ResolvedShapeForestForRender;
    leaf: ReadyLeaf;
  };
  const selected = shallowRef<Selection>();
  const acknowledged = shallowRef<{ id: string; source: ConnectorSource; revision: number }>();
  let sequence = 0,
    applying = false;

  function ownerCurrent(owner: Selection) {
    return (
      selected.value === owner &&
      options.getWorkbook() === owner.workbook &&
      options.getSheet() === owner.sheet &&
      owner.workbook.sheets.get(owner.sheet.id) === owner.sheet &&
      options.getGeneration() === owner.generation
    );
  }
  function close() {
    selected.value = undefined;
    acknowledged.value = undefined;
  }
  function current(): Selection | undefined {
    const owner = selected.value;
    if (!owner || !ownerCurrent(owner)) return;
    const revision = options.getRevision(),
      metrics = options.getMetrics?.();
    if (!metrics) return;
    if (revision !== owner.pass.revision || metrics !== owner.pass.metrics) {
      if (applying) return;
      if (revision === owner.pass.revision) {
        // Rendering can rebuild its metric snapshot after an accepted command.
        // Reopen a fresh lease, never reuse a callback captured against the old
        // metric identity. The canonical forest must still match the old lease.
        try {
          owner.pass.assertCurrent(owner.sheet.drawings ?? [], owner.pass.metrics, revision);
        } catch {
          return;
        }
      }
      const source = owner.sheet.drawings?.find(
        (item) => item.id === owner.rootId && item.kind === owner.rootKind,
      );
      if (!source) {
        close();
        return;
      }
      try {
        const pass = resolveShapeForestForRender({
          drawings: owner.sheet.drawings!,
          metrics,
          revision,
        });
        const leaf = readyLeaf(pass, source, owner.path);
        if (!leaf) {
          close();
          return;
        }
        pass.assertCurrent(owner.sheet.drawings!, metrics, revision);
        if (
          !ownerCurrent(owner) ||
          options.getRevision() !== revision ||
          options.getMetrics?.() !== metrics
        )
          return;
        // A new external/history revision exposes a fresh owner, invalidating all old async drafts.
        const replacement = {
          ...owner,
          pass,
          leaf,
          sessionId: `shape-connector-owner-${++sequence}`,
          size: getShapeConnectorNumericSize(
            pass.sourceSnapshot,
            { connectorId: leaf.sourceNode.id, path: leaf.path },
            metrics,
          ),
        };
        if (revision !== owner.pass.revision)
          replacement.baseline = {
            width: replacement.size.widthPx,
            height: replacement.size.heightPx,
          };
        selected.value = replacement;
        acknowledged.value = undefined;
        return replacement;
      } catch {
        close();
        return;
      }
    }
    try {
      owner.pass.assertCurrent(owner.sheet.drawings ?? [], metrics, revision);
      return owner;
    } catch {
      return;
    }
  }
  const context = computed(() => current());
  const root = computed(() => context.value?.leaf.sourceRoot);
  const path = computed(() => selected.value?.path);
  const drawing = computed(() => context.value?.leaf.sourceNode);
  const snapshot = computed<ShapeFormatSnapshot | null>(() => {
    const owner = context.value;
    if (!owner) return null;
    const leaf = owner.leaf,
      source = leaf.sourceNode;
    const carrier = leaf.carrierRoot?.view ?? leaf.carrierLeaf?.view;
    if (!carrier || (carrier.kind !== "shape" && carrier.kind !== "textBox")) return null;
    const properties = getShapeObjectProperties(
      "shapeProperties" in leaf.sourceRoot ? leaf.sourceRoot.shapeProperties : undefined,
    );
    return {
      owner: {
        workbookId: owner.workbook.id,
        sheetId: owner.sheet.id,
        drawingId: source.id,
        sessionId: owner.sessionId,
      },
      revision: owner.pass.revision,
      drawing: source,
      values: {
        sizeWidthPt: owner.size.widthPx * 0.75,
        sizeHeightPt: owner.size.heightPx * 0.75,
        scaleWidthPercent:
          owner.baseline.width > 0 ? (owner.size.widthPx / owner.baseline.width) * 100 : undefined,
        scaleHeightPercent:
          owner.baseline.height > 0
            ? (owner.size.heightPx / owner.baseline.height) * 100
            : undefined,
        rotationDeg: carrier.rotation,
        ...properties,
        lockAspectRatio: getShapeObjectProperties(source.shapeProperties).lockAspectRatio,
        anchor: anchorValue(leaf.sourceRoot),
      },
      shapeStyle: resolveShapeDetailedPaintStyle(leaf.connector.paintView),
      connectorBindings: (["begin", "end"] as const).flatMap((endpoint) => {
        const binding = source.shapeConnector![endpoint];
        return binding.kind === "site"
          ? [
              {
                endpoint,
                targetName:
                  owner.pass.getLeaf(binding.targetId)?.sourceNode.name ?? binding.targetId,
              },
            ]
          : [];
      }),
      ...(acknowledged.value?.source === source &&
      acknowledged.value.revision === owner.pass.revision
        ? { acceptedIntentId: acknowledged.value.id }
        : {}),
    };
  });
  const capabilities = computed<ShapeFormatCapabilities>(() => {
    const owner = context.value;
    const enabled =
      !!owner && !options.isBusy() && canEditShapeObject(owner.sheet, owner.leaf.sourceRoot);
    const reason = options.getUnsupportedReason?.() ?? "";
    const capability = (allowed: boolean) => ({
      enabled: enabled && allowed,
      reason: enabled && allowed ? undefined : reason,
    });
    const result: ShapeFormatCapabilities = {
      fields: {},
      styles: { shape: {}, text: {} },
      lineEnds: capability(true),
      disconnectConnector: capability(
        !!owner &&
          [
            owner.leaf.sourceNode.shapeConnector!.begin,
            owner.leaf.sourceNode.shapeConnector!.end,
          ].some((endpoint) => endpoint.kind === "site"),
      ),
    };
    for (const field of fields)
      result.fields[field] = capability(
        !!owner &&
          (owner.path.length === 1 || field === "lockAspectRatio") &&
          objectFields.has(field) &&
          (field !== "locked" || canUseSheetPermission(owner.sheet, "editObjects")),
      );
    const bound = (snapshot.value?.connectorBindings?.length ?? 0) > 0;
    const text = createShapeFormatTranslate(options.getLocale?.() ?? "en-US");
    for (const axis of ["width", "height"] as const) {
      const allowed =
        !!owner && (axis === "width" ? owner.size.canResizeWidth : owner.size.canResizeHeight);
      const field = capability(allowed);
      if (enabled && !allowed)
        field.reason = text(bound ? "connectorBoundSizeReason" : "connectorZeroSizeReason");
      result.fields[axis === "width" ? "sizeWidthPt" : "sizeHeightPt"] = {
        ...field,
        min: 0.75,
        max: 16384 * 0.75,
      };
      const denominator = owner?.baseline[axis] ?? 0;
      result.fields[axis === "width" ? "scaleWidthPercent" : "scaleHeightPercent"] = {
        ...field,
        enabled: field.enabled && denominator > 0,
        min: denominator > 0 ? 100 / denominator : undefined,
        max: denominator > 0 ? (16384 / denominator) * 100 : undefined,
      };
    }
    for (const category of categories) {
      result.styles!.shape![category] = capability(openCategories.has(category));
      result.styles!.text![category] = capability(false);
    }
    return result;
  });

  function open(source: SheetDrawing, requestedPath: ShapeGroupPath = [source.id]): boolean {
    try {
      const workbook = options.getWorkbook(),
        sheet = options.getSheet(),
        generation = options.getGeneration();
      const sourceCurrent = () =>
        options.getWorkbook() === workbook &&
        options.getSheet() === sheet &&
        workbook.sheets.get(sheet.id) === sheet &&
        options.getGeneration() === generation &&
        !options.isBusy() &&
        sheet.drawings?.find((item) => item.id === source.id) === source &&
        canEditShapeObject(sheet, source);
      if (!sourceCurrent() || !options.flush() || !sourceCurrent()) return false;
      const metrics = options.getMetrics?.(),
        revision = options.getRevision();
      if (!metrics) return false;
      const pass = resolveShapeForestForRender({ drawings: sheet.drawings!, metrics, revision });
      const leaf = readyLeaf(pass, source, requestedPath);
      if (
        !leaf ||
        !sourceCurrent() ||
        options.getMetrics?.() !== metrics ||
        options.getRevision() !== revision
      )
        return false;
      pass.assertCurrent(sheet.drawings!, metrics, revision);
      const carrier = leaf.carrierRoot?.view ?? leaf.carrierLeaf?.view;
      if (!carrier) return false;
      const size = getShapeConnectorNumericSize(
        pass.sourceSnapshot,
        { connectorId: leaf.sourceNode.id, path: leaf.path },
        metrics,
      );
      selected.value = {
        workbook,
        sheet,
        generation,
        rootId: source.id,
        rootKind: source.kind,
        path: Object.freeze([...leaf.path]),
        sessionId: `shape-connector-owner-${++sequence}`,
        baseline: { width: size.widthPx, height: size.heightPx },
        size,
        pass,
        leaf,
      };
      acknowledged.value = undefined;
      return true;
    } catch {
      return false;
    }
  }

  function onIntent(intent: ShapeFormatIntent): boolean {
    if (applying) return false;
    // Reconcile external/history revisions before retaining any exposed draft identity.
    const owner = current(),
      before = snapshot.value;
    if (
      !owner ||
      !before ||
      intent.baseRevision !== owner.pass.revision ||
      shapeFormatOwnerKey(intent.owner) !== shapeFormatOwnerKey(before.owner) ||
      before.drawing !== owner.leaf.sourceNode
    )
      return false;
    applying = true;
    try {
      const pass = owner.pass,
        source = owner.leaf.sourceRoot,
        metrics = pass.metrics;
      const stillCurrent = () => {
        if (
          !ownerCurrent(owner) ||
          options.getRevision() !== pass.revision ||
          options.getMetrics?.() !== metrics ||
          options.isBusy() ||
          !canEditShapeObject(owner.sheet, source) ||
          (intent.type === "set-field" &&
            intent.field === "locked" &&
            !canUseSheetPermission(owner.sheet, "editObjects"))
        )
          return false;
        try {
          pass.assertCurrent(owner.sheet.drawings ?? [], metrics, pass.revision);
          return true;
        } catch {
          return false;
        }
      };
      if (!stillCurrent()) return false;
      if (intent.type === "set-style") {
        if (intent.target !== "shape" || !openCategories.has(intent.category)) return false;
      } else if (intent.type === "set-line-ends") {
        // A ready canonical connector always supports its ordered endpoint decorations.
      } else if (intent.type === "set-field") {
        if (numericFields.has(intent.field)) {
          if (capabilities.value.fields[intent.field]?.enabled !== true) return false;
        } else if (
          !objectFields.has(intent.field) ||
          (owner.path.length !== 1 && intent.field !== "lockAspectRatio")
        )
          return false;
      } else if (intent.type === "disconnect-connector") {
        if (capabilities.value.disconnectConnector?.enabled !== true) return false;
      } else return false;
      if (!stillCurrent() || !options.flush() || !stillCurrent()) return false;

      // Only the canonical owner path is modified. Placement and relationships are untouched.
      let canonical = normalizeSheetDrawings(pass.sourceSnapshot);
      const index = canonical.findIndex((item) => item.id === source.id);
      const candidateRoot = canonical[index]!;
      const target = canonicalNode(candidateRoot, owner.path);
      if (!target) return false;
      if (intent.type === "set-style") {
        const proposed = { ...target.shapeStyle };
        if (intent.value === undefined) delete proposed[intent.category];
        else Object.assign(proposed, { [intent.category]: intent.value });
        const style = normalizeShapeStyle(proposed);
        if (style) target.shapeStyle = style;
        else delete target.shapeStyle;
      } else if (intent.type === "set-line-ends") {
        const ends = normalizeShapeLineEnds(intent.value);
        if (ends) target.shapeLineEnds = ends;
        else delete target.shapeLineEnds;
      } else if (intent.type === "disconnect-connector") {
        const ids = new Set<string>();
        for (const endpoint of [target.shapeConnector!.begin, target.shapeConnector!.end])
          if (endpoint.kind === "site") ids.add(endpoint.targetId);
        canonical = materializeShapeConnectorTargets(canonical, [...ids], metrics, {
          connectorIds: [target.id],
        });
      } else if (intent.type === "set-field" && numericFields.has(intent.field)) {
        if (typeof intent.value !== "number" || !Number.isFinite(intent.value)) return false;
        const axis =
          intent.field === "sizeWidthPt" || intent.field === "scaleWidthPercent"
            ? "width"
            : "height";
        const sizePx = intent.field.endsWith("Pt")
          ? intent.value / 0.75
          : (owner.baseline[axis] * intent.value) / 100;
        const properties = getShapeObjectProperties(target.shapeProperties);
        canonical = planShapeConnectorSizeChange(
          canonical,
          { connectorId: target.id, path: owner.path },
          { axis, sizePx, lockAspectRatio: properties.lockAspectRatio },
          metrics,
        );
      } else {
        const properties = normalizeShapeObjectProperties({
          ...target.shapeProperties,
          [intent.field]: intent.value,
        });
        if (properties) target.shapeProperties = properties;
        else delete target.shapeProperties;
      }
      const normalized = normalizeSheetDrawings(canonical);
      const nextRoot = normalized[index]!;
      const next = pass.sourceForest.map((item) => (item === source ? nextRoot : item));
      const candidatePass = resolveShapeForestForRender({
        drawings: next,
        metrics,
        revision: pass.revision,
      });
      const candidate = readyLeaf(candidatePass, nextRoot, owner.path);
      if (!candidate || !stillCurrent()) return false;
      const resources = options.getPaintResources?.();
      if (!stillCurrent()) return false;
      const plan = planShapeDetailedPaint({
        drawing: candidate.connector.paintView,
        geometry: candidate.connector.route.geometry,
        connectorRoute: candidate.connector.route,
        density: 1,
        resources,
      });
      if (plan.kind !== "ready" || !Number.isFinite(plan.estimatedPeakBytes) || !stillCurrent())
        return false;
      for (const id of getShapeStyleAssetIds(candidate.sourceNode.shapeStyle))
        if (!options.isAssetAvailable?.(id) || !stillCurrent()) return false;
      const changed = JSON.stringify(normalized) !== JSON.stringify(pass.sourceSnapshot);
      if (
        changed &&
        (!stillCurrent() ||
          !options.replaceCollection(next, pass.sourceForest, metrics, stillCurrent))
      )
        return false;
      if (!ownerCurrent(owner) || options.getMetrics?.() !== metrics || options.isBusy())
        return false;
      const live = owner.sheet.drawings ?? [],
        revision = options.getRevision();
      if (JSON.stringify(normalizeSheetDrawings(live)) !== JSON.stringify(normalized)) return false;
      const appliedRoot = live[index];
      if (!appliedRoot || appliedRoot.id !== source.id || appliedRoot.kind !== source.kind)
        return false;
      const appliedPass = changed
        ? resolveShapeForestForRender({ drawings: live, metrics, revision })
        : pass;
      const appliedLeaf = readyLeaf(appliedPass, appliedRoot, owner.path);
      if (!appliedLeaf) return false;
      appliedPass.assertCurrent(live, metrics, revision);
      selected.value = {
        ...owner,
        pass: appliedPass,
        leaf: appliedLeaf,
        size: getShapeConnectorNumericSize(
          appliedPass.sourceSnapshot,
          { connectorId: appliedLeaf.sourceNode.id, path: appliedLeaf.path },
          metrics,
        ),
      };
      acknowledged.value = { id: intent.intentId, source: appliedLeaf.sourceNode, revision };
      return true;
    } catch {
      return false;
    } finally {
      applying = false;
    }
  }
  watch(
    () => [
      options.getWorkbook(),
      options.getSheet(),
      options.getGeneration(),
      options.getRevision(),
    ],
    () => {
      if (applying || !selected.value) return;
      if (!ownerCurrent(selected.value)) close();
      else current();
    },
    { flush: "sync" },
  );
  return { root, path, drawing, snapshot, capabilities, onIntent, open, close };
}
