import { computed, shallowRef, watch } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  collectShapeGroupAssetIds,
  SHAPE_GROUP_EFFECT_CATEGORIES,
  findShapeGroupNode,
  isShapeGroupDrawing,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import { normalizeSheetDrawings, type SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, Workbook } from "@sheetcraft/core/workbook";
import {
  shapeFormatOwnerKey,
  type ShapeFormatCapabilities,
  type ShapeFormatField,
  type ShapeFormatIntent,
  type ShapeFormatSnapshot,
  type ShapeFormatStyleCategory,
} from "./shape-format-pane-model";
import {
  aggregateShapeGroupFormatSnapshot,
  getShapeGroupFormatEligibleLeaves,
  getShapeGroupFormatFieldEligibleLeaves,
  getShapeGroupLineEligibleLeaves,
  planShapeGroupFormatIntent,
  resolveShapeGroupFormatContext,
} from "./shape-group-format-planning";

import { resolveShapeForestForRender } from "./resolved-shape-render-source";

export type ShapeGroupFormatScope = {
  descendantCount: number;
  bodyEligibleCount: number;
  textEligibleCount: number;
  nested: boolean;
};

const styleCategories: readonly ShapeFormatStyleCategory[] = [
  "fill",
  "line",
  "shadow",
  "reflection",
  "glow",
  "softEdges",
  "format3d",
  "rotation3d",
];
const marginFields: readonly ShapeFormatField[] = [
  "textMarginLeftPt",
  "textMarginRightPt",
  "textMarginTopPt",
  "textMarginBottomPt",
];

/** The selected container remains an actual owned node. Leaf views are never pane owners. */
export function useOwnedShapeGroupFormatPane(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getRevision: () => number;
  getGeneration: () => number;
  getMetrics?: () => PictureSheetMetrics | undefined;
  isBusy: () => boolean;
  flush: () => boolean;
  replaceCollection: (
    next: readonly SheetDrawing[],
    expected: readonly SheetDrawing[],
    metrics: PictureSheetMetrics,
    guard?: () => boolean,
  ) => boolean;
  isAssetAvailable?: (id: string) => boolean;
  assetAvailable?: (id: string) => boolean;
  getUnsupportedReason?: () => string;
  getScopeDescription?: (scope: ShapeGroupFormatScope) => string;
}) {
  const selected = shallowRef<{
    workbook: Workbook;
    sheet: Sheet;
    generation: number;
    rootId: string;
    path: ShapeGroupPath;
    sessionId: string;
    /** Scale denominators are selection-session state, never workbook data. */
    baseline: { width: number; height: number };
    /** A same-revision replacement cannot impersonate an exposed owner snapshot. */
    lease: {
      revision: number;
      metrics: PictureSheetMetrics;
      expected: readonly SheetDrawing[];
      forest: string;
    };
  }>();
  const acknowledged = shallowRef<{
    id: string;
    root: ShapeGroupDrawing;
    drawing: ShapeGroupDrawing | ShapeGroupedGroup;
    revision: number;
  }>();
  let sequence = 0;
  let applying = false;

  function currentRoot() {
    const owner = selected.value;
    if (
      !owner ||
      owner.workbook !== options.getWorkbook() ||
      owner.sheet !== options.getSheet() ||
      owner.workbook.sheets.get(owner.sheet.id) !== owner.sheet ||
      owner.generation !== options.getGeneration()
    )
      return;
    const source = owner.sheet.drawings?.find((item) => item.id === owner.rootId);
    return isShapeGroupDrawing(source) ? source : undefined;
  }
  const root = computed(() => {
    void options.getRevision();
    return currentRoot();
  });
  const path = computed(() => selected.value?.path);
  const drawing = computed(() => {
    const source = root.value,
      owner = selected.value;
    if (!source || !owner) return;
    try {
      const target = findShapeGroupNode(source, owner.path)?.node;
      return target?.kind === "shapeGroup" ? target : undefined;
    } catch {
      return;
    }
  });
  const context = computed(() => {
    void options.getRevision();
    const source = root.value,
      owner = selected.value,
      metrics = options.getMetrics?.();
    if (!source || !owner || !metrics) return;
    try {
      const pass = resolveShapeForestForRender({
        drawings: owner.sheet.drawings ?? [],
        metrics,
        revision: options.getRevision(),
      });
      return resolveShapeGroupFormatContext(source, owner.path, metrics, pass);
    } catch {
      return;
    }
  });
  const aggregate = computed(() => {
    const captured = context.value,
      owner = selected.value;
    if (!captured || !owner) return;
    try {
      return aggregateShapeGroupFormatSnapshot(captured, owner.baseline);
    } catch {
      return;
    }
  });
  const snapshot = computed<ShapeFormatSnapshot | null>(() => {
    const source = root.value,
      target = drawing.value,
      owner = selected.value,
      values = aggregate.value;
    if (!source || !target || !owner || !values) return null;
    const revision = options.getRevision();
    if (owner.lease.revision !== revision) {
      const metrics = options.getMetrics?.();
      if (!metrics) return null;
      try {
        const expected = [...(owner.sheet.drawings ?? [])];
        owner.lease = {
          revision,
          metrics,
          expected,
          forest: JSON.stringify(normalizeSheetDrawings(expected)),
        };
      } catch {
        return null;
      }
    }
    return {
      owner: {
        workbookId: owner.workbook.id,
        sheetId: owner.sheet.id,
        drawingId: target.id,
        sessionId: owner.sessionId,
      },
      revision,
      drawing: target,
      values: values.values,
      mixedFields: values.mixedFields,
      shapeStyle: values.shapeStyle,
      textStyle: values.textStyle,
      lineEnds: values.lineEnds,
      mixedLineEnds: values.mixedLineEnds,
      mixedStyleCategories: values.mixedStyleCategories,
      ...(options.getScopeDescription
        ? {
            scopeDescription: options.getScopeDescription({
              descendantCount: values.descendantCount,
              bodyEligibleCount: values.bodyEligibleCount,
              textEligibleCount: values.textEligibleCount,
              nested: owner.path.length > 1,
            }),
          }
        : {}),
      ...(acknowledged.value?.root === source &&
      acknowledged.value.drawing === target &&
      acknowledged.value.revision === revision
        ? { acceptedIntentId: acknowledged.value.id }
        : {}),
    };
  });
  const capabilities = computed<ShapeFormatCapabilities>(() => {
    const source = root.value,
      captured = context.value,
      values = aggregate.value,
      owner = selected.value;
    const enabled =
      !!source &&
      !!captured &&
      !!values &&
      !options.isBusy() &&
      canEditShapeObject(options.getSheet(), source);
    const reason = options.getUnsupportedReason?.() ?? "";
    const capability = (allowed: boolean) => ({
      enabled: enabled && allowed,
      reason: enabled && allowed ? undefined : reason,
    });
    const container = capability(!!captured),
      geometry = capability(
        !!captured?.layout &&
          !captured.layout.collapsed &&
          captured.layout.rect.width > 0 &&
          captured.layout.rect.height > 0,
      ),
      rootOnly = capability(owner?.path.length === 1),
      text = capability((values?.textEligibleCount ?? 0) > 0);
    const scale = (axis: "width" | "height") => {
      const baseline = owner?.baseline[axis] ?? 0;
      return {
        ...capability(geometry.enabled && baseline > 0),
        min: baseline > 0 ? 100 / baseline : undefined,
        max: baseline > 0 ? (16384 / baseline) * 100 : undefined,
      };
    };
    const fields: ShapeFormatCapabilities["fields"] = {
      sizeWidthPt: { ...geometry, min: 0.75, max: 12288 },
      sizeHeightPt: { ...geometry, min: 0.75, max: 12288 },
      rotationDeg: { ...geometry, min: -360, max: 360 },
      scaleWidthPercent: scale("width"),
      scaleHeightPercent: scale("height"),
      lockAspectRatio: container,
      anchor: rootOnly,
      printObject: rootOnly,
      locked: capability(
        owner?.path.length === 1 && canUseSheetPermission(options.getSheet(), "editObjects"),
      ),
      altTitle: container,
      altDescription: container,
      fontSizePt: { ...text, min: 0.75, max: 384 },
      textBold: text,
      textItalic: text,
      shapeKeepTextFlat: text,
      textVerticalAlignment: text,
      textDirection: text,
      textLineOrder: capability(
        !!captured && getShapeGroupFormatFieldEligibleLeaves(captured, "textLineOrder").length > 0,
      ),
      textMarginLeftPt: { ...text, min: 0, max: 4096 },
      textMarginRightPt: { ...text, min: 0, max: 4096 },
      textMarginTopPt: { ...text, min: 0, max: 4096 },
      textMarginBottomPt: { ...text, min: 0, max: 4096 },
      textResizeToFit: text,
      textOverflow: text,
      textWrap: text,
      fontFamily: text,
      textUnderline: text,
      textStrike: text,
      paragraphAlignment: text,
      paragraphBeforePt: { ...text, min: 0, max: 4096 },
      paragraphAfterPt: { ...text, min: 0, max: 4096 },
      paragraphLineSpacing: text,
      paragraphLineSpacingPt: {
        ...capability(
          !!captured &&
            getShapeGroupFormatFieldEligibleLeaves(captured, "paragraphLineSpacingPt").length > 0,
        ),
        min: 0.001,
        max: 4096,
      },
    };
    const styles: NonNullable<ShapeFormatCapabilities["styles"]> = { shape: {}, text: {} };
    for (const target of ["shape", "text"] as const)
      for (const category of styleCategories)
        styles[target]![category] = capability(
          !!captured &&
            ((target === "shape" &&
              SHAPE_GROUP_EFFECT_CATEGORIES.some((entry) => entry === category) &&
              !captured.collapsed) ||
              ((category === "fill" ||
                category === "line" ||
                (target === "text" && category === "shadow")) &&
                getShapeGroupFormatEligibleLeaves(captured, target, category).length > 0)),
        );
    return {
      fields,
      styles,
      lineEnds: capability(!!captured && getShapeGroupLineEligibleLeaves(captured).length > 0),
    };
  });

  function close() {
    selected.value = undefined;
    acknowledged.value = undefined;
  }
  function open(source: ShapeGroupDrawing, requestedPath: ShapeGroupPath = [source.id]): boolean {
    try {
      const workbook = options.getWorkbook(),
        sheet = options.getSheet(),
        generation = options.getGeneration();
      if (
        options.isBusy() ||
        !isShapeGroupDrawing(source) ||
        workbook.sheets.get(sheet.id) !== sheet ||
        !canEditShapeObject(sheet, source) ||
        sheet.drawings?.find((item) => item.id === source.id) !== source
      )
        return false;
      // Finish transient editors before capturing the committed container baseline.
      if (
        !options.flush() ||
        options.getWorkbook() !== workbook ||
        options.getSheet() !== sheet ||
        workbook.sheets.get(sheet.id) !== sheet ||
        options.getGeneration() !== generation ||
        options.isBusy() ||
        sheet.drawings?.find((item) => item.id === source.id) !== source ||
        !canEditShapeObject(sheet, source)
      )
        return false;
      const metrics = options.getMetrics?.();
      if (!metrics) return false;
      const revision = options.getRevision(),
        expected = [...(sheet.drawings ?? [])],
        forest = JSON.stringify(normalizeSheetDrawings(expected)),
        pass = resolveShapeForestForRender({ drawings: sheet.drawings ?? [], metrics, revision }),
        resolved = resolveShapeGroupFormatContext(source, requestedPath, metrics, pass);
      if (
        options.getWorkbook() !== workbook ||
        options.getSheet() !== sheet ||
        workbook.sheets.get(sheet.id) !== sheet ||
        options.getGeneration() !== generation ||
        options.getRevision() !== revision ||
        options.getMetrics?.() !== metrics ||
        options.isBusy() ||
        !canEditShapeObject(sheet, source) ||
        !sameCollection(expected, forest, sheet)
      )
        return false;
      selected.value = {
        workbook,
        sheet,
        generation,
        rootId: source.id,
        path: Object.freeze([...resolved.path]),
        sessionId: `shape-group-owner-${++sequence}`,
        baseline: {
          width: resolved.layout?.rect.width ?? 0,
          height: resolved.layout?.rect.height ?? 0,
        },
        lease: { revision, metrics, expected, forest },
      };
      acknowledged.value = undefined;
      return true;
    } catch {
      return false;
    }
  }
  function sameCollection(expected: readonly SheetDrawing[], forest: string, sheet: Sheet) {
    const live = sheet.drawings ?? [];
    return (
      live.length === expected.length &&
      live.every((item, index) => item === expected[index]) &&
      JSON.stringify(normalizeSheetDrawings(live)) === forest
    );
  }
  function onIntent(intent: ShapeFormatIntent): boolean {
    if (applying) return false;
    applying = true;
    try {
      const before = snapshot.value,
        selection = selected.value,
        captured = context.value,
        source = root.value;
      if (
        !before ||
        !selection ||
        !captured ||
        !source ||
        intent.baseRevision !== before.revision ||
        shapeFormatOwnerKey(intent.owner) !== shapeFormatOwnerKey(before.owner)
      )
        return false;
      const expected = selection.lease.expected,
        forest = selection.lease.forest,
        metrics = captured.metrics;
      if (
        selection.lease.revision !== before.revision ||
        selection.lease.metrics !== metrics ||
        !sameCollection(expected, forest, selection.sheet)
      )
        return false;
      const stillCurrent = () => {
        if (
          selected.value !== selection ||
          options.getWorkbook() !== selection.workbook ||
          options.getSheet() !== selection.sheet ||
          selection.workbook.sheets.get(selection.sheet.id) !== selection.sheet ||
          options.getGeneration() !== selection.generation ||
          options.getRevision() !== before.revision ||
          options.getMetrics?.() !== metrics ||
          options.isBusy() ||
          currentRoot() !== source ||
          findShapeGroupNode(source, selection.path)?.node !== before.drawing ||
          !canEditShapeObject(selection.sheet, source) ||
          (intent.type === "set-field" &&
            intent.field === "locked" &&
            !canUseSheetPermission(selection.sheet, "editObjects"))
        )
          return false;
        return sameCollection(expected, forest, selection.sheet);
      };
      if (!stillCurrent()) return false;
      if (intent.type === "set-field") {
        const cap = capabilities.value.fields[intent.field];
        if (
          cap?.enabled !== true ||
          (typeof intent.value === "number" &&
            (!Number.isFinite(intent.value) ||
              (cap.min !== undefined && intent.value < cap.min) ||
              (cap.max !== undefined && intent.value > cap.max)))
        )
          return false;
      } else if (intent.type === "set-style") {
        if (capabilities.value.styles?.[intent.target]?.[intent.category]?.enabled !== true)
          return false;
      } else if (intent.type === "set-text-margins") {
        const lengths = [
          intent.value.leftPt,
          intent.value.rightPt,
          intent.value.topPt,
          intent.value.bottomPt,
        ];
        if (
          marginFields.some((field, index) => {
            const cap = capabilities.value.fields[field],
              value = lengths[index]!;
            return (
              cap?.enabled !== true ||
              !Number.isFinite(value) ||
              (cap.min !== undefined && value < cap.min) ||
              (cap.max !== undefined && value > cap.max)
            );
          })
        )
          return false;
      } else if (intent.type === "set-line-ends" || intent.type === "set-line-end") {
        if (capabilities.value.lineEnds?.enabled !== true) return false;
      } else return false;
      if (!stillCurrent() || !options.flush() || !stillCurrent()) return false;
      const planned = planShapeGroupFormatIntent(captured, intent, selection.baseline);
      if (!stillCurrent()) return false;
      const next = expected.map((item) => (item === source ? planned.root : item)),
        nextForest = JSON.stringify(normalizeSheetDrawings(next));
      if (!stillCurrent()) return false;
      if (nextForest !== forest) {
        const available = options.isAssetAvailable ?? options.assetAvailable;
        for (const id of collectShapeGroupAssetIds(planned.root))
          if (!available?.(id) || !stillCurrent()) return false;
        if (!stillCurrent() || !options.replaceCollection(next, expected, metrics, stillCurrent))
          return false;
      }
      // Preflight may fit leaf text. The command owner is responsible for that
      // prepared forest; verify the surviving exact selection and other roots.
      if (
        selected.value !== selection ||
        options.getWorkbook() !== selection.workbook ||
        options.getSheet() !== selection.sheet ||
        selection.workbook.sheets.get(selection.sheet.id) !== selection.sheet ||
        options.getGeneration() !== selection.generation
      )
        return false;
      const live = selection.sheet.drawings ?? [],
        applied = currentRoot();
      if (nextForest !== forest && JSON.stringify(normalizeSheetDrawings(live)) === forest)
        return false;
      if (
        !applied ||
        live.length !== expected.length ||
        live.some((item, index) => {
          const original = expected[index]!;
          return (
            item.id !== original.id ||
            item.kind !== original.kind ||
            (original !== source &&
              JSON.stringify(normalizeSheetDrawings([item])) !==
                JSON.stringify(normalizeSheetDrawings([original])))
          );
        })
      )
        return false;
      const target = findShapeGroupNode(applied, selection.path)?.node;
      if (!target || target.kind !== "shapeGroup") return false;
      const appliedMetrics = options.getMetrics?.();
      if (!appliedMetrics) return false;
      selection.lease = {
        revision: options.getRevision(),
        metrics: appliedMetrics,
        expected: [...live],
        forest: JSON.stringify(normalizeSheetDrawings(live)),
      };
      acknowledged.value = {
        id: intent.intentId,
        root: applied,
        drawing: target,
        revision: options.getRevision(),
      };
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
      if (selected.value && !drawing.value) close();
    },
    { flush: "sync" },
  );
  return { open, root, drawing, path, snapshot, capabilities, onIntent, close };
}
