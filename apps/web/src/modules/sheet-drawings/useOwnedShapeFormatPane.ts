import { computed, shallowRef, watch } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  anchorShapeFrameRect,
  resizeShapeFrame,
  type ShapeFrameAnchor,
} from "@sheetcraft/core/shape-frame";
import {
  getShapeObjectProperties,
  normalizeShapeObjectProperties,
} from "@sheetcraft/core/shape-object-properties";
import {
  normalizeSheetDrawing,
  isFramedShapeDrawing,
  type SheetGraphicDrawing,
  type SheetFramedGraphicDrawing,
  type SheetDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { getShapeStyleAssetIds } from "@sheetcraft/core/shape-style";
import { getShapeTextAssetIds } from "@sheetcraft/core/shape-text";
import { normalizeShapeTextWarp } from "@sheetcraft/core/text-warps";
import { isShapeLinePreset } from "@sheetcraft/core/shape-line-ends";
import { isShapeFreePathClosed } from "@sheetcraft/core/shape-free-path";
import type { Sheet, Workbook } from "@sheetcraft/core/workbook";
import { getDrawingShapeGeometry } from "./shape-geometry";
import { getLegacyShapeGeometry } from "./legacy-shape-geometry";
import { planShapeDetailedPaint, resolveShapeDetailedPaintStyle } from "./shape-detailed-paint";
import {
  shapeFormatOwnerKey,
  isShapeFormatTextWarpTarget,
  type ShapeFormatSnapshot,
  type ShapeFormatCapabilities,
  type ShapeFormatIntent,
  type ShapeFormatField,
} from "./shape-format-pane-model";
import {
  drawingShapeTextValues,
  drawingShapeTextPaintValues,
  drawingShapeTextCharacterValues,
  editDrawingShapeTextField,
  materializeDrawingShapeText,
  withDrawingShapeText,
  withoutDrawingShapeTextCharacterProperties,
} from "./shape-text-options";
import {
  prepareDrawingShapeTextCandidate,
  layoutDrawingShapeText,
  getDrawingShapeTextRect,
  type PreparedDrawingShapeTextCandidate,
} from "./shape-text-runtime";
import { planShapeTextPaint, resolveShapeTextPaintStyle } from "./shape-text-paint";
import { resolveShapeDrawing, updateResolvedShapeDrawing } from "./resolved-shape-drawing";
import {
  applyWordArtStylePreset,
  clearWordArtEffects,
  getAppliedWordArtStyleId,
  isWordArtStyleTarget,
} from "./wordart-style-application";
import type { ShapeTextPreparationMode } from "./prepare-shape-text-update";

function anchorMode(value: unknown): ShapeFrameAnchor["mode"] {
  if (value === "move-size") return "move-and-size";
  if (value === "move") return "move-only";
  if (value === "fixed") return "fixed";
  throw new TypeError("Unknown shape anchor mode.");
}
function anchorValue(mode: ShapeFrameAnchor["mode"]) {
  return mode === "move-and-size" ? "move-size" : mode === "move-only" ? "move" : "fixed";
}
const objectFields = new Set<ShapeFormatField>([
  "lockAspectRatio",
  "anchor",
  "printObject",
  "locked",
  "altTitle",
  "altDescription",
]);

/** Exact committed owner; no drawing index, synthetic picture, or mutable selection callback. */
export function useOwnedShapeFormatPane(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  getMetrics?: () => PictureSheetMetrics | undefined;
  isBusy: () => boolean;
  flush: () => boolean;
  update: (
    next: SheetDrawing,
    owner: SheetDrawing,
    preparationMode?: ShapeTextPreparationMode,
  ) => boolean;
  isAssetAvailable?: (id: string) => boolean;
  getUnsupportedReason: () => string;
  prepareText?: (
    next: SheetGraphicDrawing,
    current: SheetGraphicDrawing,
  ) => PreparedDrawingShapeTextCandidate;
}) {
  const selected = shallowRef<{
    workbook: Workbook;
    sheet: Sheet;
    generation: number;
    id: string;
    sessionId: string;
    /** WPS scale denominators belong to this selection session, never to saved data. */
    baseline: { width: number; height: number };
  }>();
  let sequence = 0;
  const acknowledged = shallowRef<{ id: string; drawing: SheetDrawing; revision: number }>();
  const drawing = computed(() => {
    void options.getRevision();
    const owner = selected.value;
    if (
      !owner ||
      owner.workbook !== options.getWorkbook() ||
      owner.sheet !== options.getSheet() ||
      owner.generation !== options.getGeneration()
    )
      return;
    const current = owner.sheet.drawings?.find((d) => d.id === owner.id);
    return current && (current.kind === "shape" || current.kind === "textBox")
      ? current
      : undefined;
  });
  const context = computed(() => {
    const source = drawing.value;
    if (!source) return;
    void options.getRevision();
    const metrics = options.getMetrics?.();
    if (metrics) {
      const resolved = resolveShapeDrawing(source, metrics);
      return { metrics, resolved, view: resolved.view as SheetGraphicDrawing };
    }
    if (!isFramedShapeDrawing(source))
      return { metrics: undefined, resolved: undefined, view: source };
  });
  const snapshot = computed<
    | (Omit<ShapeFormatSnapshot, "drawing"> & {
        drawing: Readonly<SheetGraphicDrawing | SheetFramedGraphicDrawing>;
      })
    | null
  >(() => {
    const d = drawing.value,
      owner = selected.value,
      view = context.value?.view;
    if (!d || !owner || !view) return null;
    const theme = owner.workbook.theme;
    const properties = getShapeObjectProperties(
      isFramedShapeDrawing(d) ? d.shapeProperties : undefined,
    );
    const bodyStyle = resolveShapeDetailedPaintStyle(view),
      glyph = drawingShapeTextPaintValues(view, resolveShapeTextPaintStyle(view)),
      textStyle = glyph.style;
    // WPS's two rotation sections edit one body camera. Saved independent
    // glyph cameras remain on shapeText and in their existing paint consumer.
    if (bodyStyle.rotation3d) textStyle.rotation3d = bodyStyle.rotation3d;
    else delete textStyle.rotation3d;
    const revision = options.getRevision();
    return {
      owner: {
        workbookId: owner.workbook.id,
        sheetId: owner.sheet.id,
        drawingId: d.id,
        sessionId: owner.sessionId,
      },
      revision,
      drawing: d,
      values: {
        sizeWidthPt: view.width * 0.75,
        sizeHeightPt: view.height * 0.75,
        scaleWidthPercent:
          owner.baseline.width > 0 ? (view.width / owner.baseline.width) * 100 : 100,
        scaleHeightPercent:
          owner.baseline.height > 0 ? (view.height / owner.baseline.height) * 100 : 100,
        ...properties,
        anchor: anchorValue(isFramedShapeDrawing(d) ? d.shapeFrame.anchor.mode : "move-only"),
        rotationDeg: d.rotation,
        ...drawingShapeTextValues(view, theme),
      },
      mixedFields: drawingShapeTextCharacterValues(view, theme).mixedFields,
      shapeStyle:
        d.kind === "shape"
          ? bodyStyle
          : bodyStyle.rotation3d
            ? { rotation3d: bodyStyle.rotation3d }
            : {},
      textStyle,
      ...(view.shapeText?.warp ? { textWarp: normalizeShapeTextWarp(view.shapeText.warp) } : {}),
      textWarpScope: {
        eligibleCount: isShapeFormatTextWarpTarget(view) ? 1 : 0,
        descendantCount: 1,
      },
      ...(isWordArtStyleTarget(view)
        ? {
            wordArtStyleId: getAppliedWordArtStyleId(view),
            wordArtStyleScope: { eligibleCount: 1, descendantCount: 1 },
          }
        : {}),
      ...(glyph.mixed.length ? { mixedStyleCategories: { text: glyph.mixed } } : {}),
      independentTextCameraCount: view.shapeText?.style?.rotation3d?.kind === "value" ? 1 : 0,
      ...(acknowledged.value?.drawing === d && acknowledged.value.revision === revision
        ? { acceptedIntentId: acknowledged.value.id }
        : {}),
    };
  });
  const capabilities = computed<ShapeFormatCapabilities>(() => {
    const source = drawing.value,
      d = context.value?.view;
    const enabled =
      !!source && !!d && !options.isBusy() && canEditShapeObject(options.getSheet(), source);
    const field = { enabled, reason: enabled ? undefined : options.getUnsupportedReason() };
    const textRect = d && getDrawingShapeTextRect(d);
    const textEnabled = enabled && !!textRect && textRect.width > 0 && textRect.height > 0;
    const textField = {
      enabled: textEnabled,
      reason: textEnabled ? undefined : options.getUnsupportedReason(),
    };
    const minimum =
      (source && isFramedShapeDrawing(source)) ||
      d?.shapePath ||
      (d?.shapeGeometry && isShapeLinePreset(d.shapeGeometry.preset))
        ? 1
        : 16;
    const objectField = {
      ...field,
      enabled: enabled && !!context.value?.metrics,
    };
    const scaleField = (axis: "width" | "height") => {
      const baseline = selected.value?.baseline[axis] ?? 0;
      return {
        ...objectField,
        enabled: objectField.enabled && baseline > 0,
        min: baseline > 0 ? 100 / baseline : undefined,
        max: baseline > 0 ? (16384 / baseline) * 100 : undefined,
      };
    };
    const fields: ShapeFormatCapabilities["fields"] = {
      sizeWidthPt: { ...field, min: minimum * 0.75, max: 16384 * 0.75 },
      sizeHeightPt: { ...field, min: minimum * 0.75, max: 16384 * 0.75 },
      rotationDeg: { ...field, min: -360, max: 360 },
      scaleWidthPercent: scaleField("width"),
      scaleHeightPercent: scaleField("height"),
      lockAspectRatio: objectField,
      anchor: objectField,
      printObject: objectField,
      locked: {
        ...objectField,
        enabled: objectField.enabled && canUseSheetPermission(options.getSheet(), "editObjects"),
      },
      altTitle: objectField,
      altDescription: objectField,
      fontSizePt: { ...field, min: 0.75, max: 384 },
      textBold: field,
      textItalic: field,
      shapeKeepTextFlat: field,
      textVerticalAlignment: field,
      textDirection: field,
      textLineOrder: {
        ...field,
        enabled: enabled && (d?.shapeText?.layout.direction ?? d?.textDirection) === "stacked",
      },
      textMarginLeftPt: { ...field, min: 0, max: 4096 },
      textMarginRightPt: { ...field, min: 0, max: 4096 },
      textMarginTopPt: { ...field, min: 0, max: 4096 },
      textMarginBottomPt: { ...field, min: 0, max: 4096 },
      textResizeToFit: field,
      textOverflow: field,
      textWrap: field,
      fontFamily: field,
      textUnderline: field,
      textStrike: field,
      textColor: field,
      paragraphAlignment: field,
      paragraphBeforePt: { ...field, min: 0, max: 4096 },
      paragraphAfterPt: { ...field, min: 0, max: 4096 },
      paragraphLineSpacing: field,
      paragraphLineSpacingPt: {
        ...field,
        enabled: enabled && d?.shapeText?.paragraph.lineSpacing.kind === "exact",
        min: 0.001,
        max: 4096,
      },
    };
    const bodyField = { ...field, enabled: enabled && d?.kind === "shape" };
    for (const key of Object.keys(fields) as ShapeFormatField[]) {
      if (
        key === "sizeWidthPt" ||
        key === "sizeHeightPt" ||
        key === "rotationDeg" ||
        key === "scaleWidthPercent" ||
        key === "scaleHeightPercent" ||
        objectFields.has(key)
      )
        continue;
      fields[key] = {
        ...fields[key],
        enabled: !!fields[key]?.enabled && textEnabled,
        reason: textField.reason,
      };
    }
    const fillable =
      d?.kind === "shape" &&
      !(d.shapeGeometry && isShapeLinePreset(d.shapeGeometry.preset)) &&
      !(!d.shapeGeometry && !d.shapePath && d.shape === "line");
    return {
      fields,
      styles: {
        shape: {
          fill: {
            enabled: enabled && fillable,
            reason: enabled && fillable ? undefined : options.getUnsupportedReason(),
          },
          line: bodyField,
          shadow: bodyField,
          reflection: bodyField,
          glow: bodyField,
          softEdges: bodyField,
          format3d: bodyField,
          rotation3d: field,
        },
        text: {
          fill: textField,
          line: textField,
          shadow: textField,
          reflection: textField,
          glow: textField,
          softEdges: textField,
          format3d: textField,
          rotation3d: field,
        },
      },
      ...(d && isWordArtStyleTarget(d)
        ? { wordArtStyle: textField, clearWordArtEffects: textField }
        : {}),
      textWarp: {
        enabled: textEnabled && !!d && isShapeFormatTextWarpTarget(d),
        reason:
          textEnabled && d && isShapeFormatTextWarpTarget(d)
            ? undefined
            : options.getUnsupportedReason(),
      },
      lineEnds: {
        ...field,
        enabled:
          enabled &&
          !!d &&
          !!(
            (d.shapeGeometry && isShapeLinePreset(d.shapeGeometry.preset)) ||
            (d.shapePath && !isShapeFreePathClosed(d.shapePath))
          ),
      },
    };
  });
  function close() {
    selected.value = undefined;
    acknowledged.value = undefined;
  }
  function open(d: SheetDrawing): boolean {
    if (
      (d.kind !== "shape" && d.kind !== "textBox") ||
      options.isBusy() ||
      !canEditShapeObject(options.getSheet(), d) ||
      options.getSheet().drawings?.find((item) => item.id === d.id) !== d
    )
      return false;
    const workbook = options.getWorkbook(),
      sheet = options.getSheet(),
      generation = options.getGeneration();
    if (
      !options.flush() ||
      options.getWorkbook() !== workbook ||
      options.getSheet() !== sheet ||
      options.getGeneration() !== generation
    )
      return false;
    if (options.getSheet().drawings?.find((item) => item.id === d.id) !== d) return false;
    let size: { width: number; height: number };
    try {
      const metrics = options.getMetrics?.();
      if (isFramedShapeDrawing(d) && !metrics) return false;
      const view = metrics ? resolveShapeDrawing(d, metrics).view : (d as SheetGraphicDrawing);
      size = { width: view.width, height: view.height };
    } catch {
      return false;
    }
    if (
      options.getWorkbook() !== workbook ||
      options.getSheet() !== sheet ||
      options.getGeneration() !== generation ||
      options.isBusy() ||
      sheet.drawings?.find((item) => item.id === d.id) !== d ||
      !canEditShapeObject(sheet, d)
    )
      return false;
    selected.value = {
      workbook: options.getWorkbook(),
      sheet: options.getSheet(),
      generation: options.getGeneration(),
      id: d.id,
      sessionId: `shape-owner-${++sequence}`,
      baseline: size,
    };
    acknowledged.value = undefined;
    return true;
  }
  function onIntent(intent: ShapeFormatIntent): boolean {
    const before = snapshot.value;
    if (
      !before ||
      intent.baseRevision !== before.revision ||
      shapeFormatOwnerKey(intent.owner) !== shapeFormatOwnerKey(before.owner)
    )
      return false;
    const current = drawing.value;
    if (!current || before.drawing !== current) return false;
    const captured = context.value,
      selection = selected.value;
    if (
      !captured ||
      !selection ||
      (captured.resolved?.source !== current && isFramedShapeDrawing(current))
    )
      return false;
    const stillCurrent = () => {
      const live = snapshot.value;
      return (
        !!live &&
        live.drawing === current &&
        live.revision === before.revision &&
        shapeFormatOwnerKey(live.owner) === shapeFormatOwnerKey(before.owner) &&
        context.value === captured &&
        !options.isBusy() &&
        canEditShapeObject(options.getSheet(), current) &&
        (intent.type !== "set-field" ||
          intent.field !== "locked" ||
          canUseSheetPermission(options.getSheet(), "editObjects"))
      );
    };
    let next: SheetGraphicDrawing = { ...captured.view };
    let framed: SheetFramedGraphicDrawing | undefined;
    const ensureFrame = () => {
      if (!captured.metrics || !captured.resolved) throw new Error("Shape metrics unavailable.");
      if (!framed) {
        if (isFramedShapeDrawing(current)) framed = { ...current };
        else {
          const {
            anchor: _anchor,
            offsetX: _x,
            offsetY: _y,
            width: _w,
            height: _h,
            ...appearance
          } = next;
          framed = {
            ...appearance,
            kind: current.kind as "shape" | "textBox",
            shapeFrame: {
              kind: "shape-frame-v1",
              anchor: anchorShapeFrameRect("move-only", captured.resolved.rect, captured.metrics),
            },
          };
        }
      }
      return framed;
    };
    try {
      if (intent.type === "set-wordart-style") {
        if (capabilities.value.wordArtStyle?.enabled !== true) return false;
        next = applyWordArtStylePreset(next, intent.presetId);
      } else if (intent.type === "clear-wordart-effects") {
        if (capabilities.value.clearWordArtEffects?.enabled !== true) return false;
        next = clearWordArtEffects(next);
      } else if (intent.type === "set-text-warp") {
        if (capabilities.value.textWarp?.enabled !== true || !isShapeFormatTextWarpTarget(next))
          return false;
        const warp = normalizeShapeTextWarp(intent.value);
        const text = materializeDrawingShapeText(next);
        if (warp) text.warp = warp;
        else delete text.warp;
        // Warp is object-level paint. Leave all layout, runs, mirrors and source text intact.
        next = { ...next, shapeText: text };
      } else if (intent.type === "set-style") {
        if (capabilities.value.styles?.[intent.target]?.[intent.category]?.enabled !== true)
          return false;
        if (intent.target === "text" && intent.category === "fill")
          next = withoutDrawingShapeTextCharacterProperties(next, ["color", "fill"]);
        if (intent.target === "text" && intent.category === "line")
          next = withoutDrawingShapeTextCharacterProperties(next, ["line"]);
        const text =
          intent.target === "text" && intent.category !== "rotation3d"
            ? materializeDrawingShapeText(next)
            : undefined;
        const style = { ...(text ? text.style : next.shapeStyle) };
        if (intent.value === undefined) delete style[intent.category];
        else Object.assign(style, { [intent.category]: intent.value });
        if (text) next = withDrawingShapeText(next, { ...text, style });
        else if (Object.keys(style).length) next = { ...next, shapeStyle: style };
        else {
          const { shapeStyle: _style, ...base } = next;
          next = base;
        }
      } else if (intent.type === "set-text-margins") {
        if (
          ["textMarginLeftPt", "textMarginRightPt", "textMarginTopPt", "textMarginBottomPt"].some(
            (field) => capabilities.value.fields[field as ShapeFormatField]?.enabled !== true,
          )
        )
          return false;
        const text = materializeDrawingShapeText(next);
        text.layout.marginsPt = { ...intent.value };
        next = withDrawingShapeText(next, text);
      } else if (intent.type === "set-line-ends") {
        if (capabilities.value.lineEnds?.enabled !== true) return false;
        if (intent.value) next.shapeLineEnds = intent.value;
        else delete next.shapeLineEnds;
      } else if (intent.type === "set-field") {
        const cap = capabilities.value.fields[intent.field];
        if (
          cap?.enabled !== true ||
          (typeof intent.value === "number" &&
            (!Number.isFinite(intent.value) ||
              (cap.min !== undefined && intent.value < cap.min) ||
              (cap.max !== undefined && intent.value > cap.max)))
        )
          return false;
        const numericSize = intent.field === "sizeWidthPt" || intent.field === "sizeHeightPt";
        const scaleSize =
          intent.field === "scaleWidthPercent" || intent.field === "scaleHeightPercent";
        if ((numericSize && isFramedShapeDrawing(current)) || scaleSize) {
          const target = ensureFrame(),
            metrics = captured.metrics!;
          const rect = captured.resolved!.rect;
          const axis =
            intent.field === "sizeWidthPt" || intent.field === "scaleWidthPercent"
              ? "width"
              : "height";
          const size = numericSize
            ? ((intent.value as number) * 4) / 3
            : (selection.baseline[axis] * (intent.value as number)) / 100;
          const locked = getShapeObjectProperties(target.shapeProperties).lockAspectRatio;
          const width =
            axis === "width" ? size : locked ? (rect.width * size) / rect.height : rect.width;
          const height =
            axis === "height" ? size : locked ? (rect.height * size) / rect.width : rect.height;
          framed = {
            ...target,
            shapeFrame: resizeShapeFrame(
              target.shapeFrame,
              { width, height },
              metrics,
              current.rotation,
            ),
          };
          if (height !== rect.height && next.shapeText?.layout.autoFit === "resize-shape") {
            const text = materializeDrawingShapeText(next);
            text.layout.autoFit = "none";
            next = withDrawingShapeText(next, text);
            framed.shapeText = next.shapeText;
          }
        } else if (objectFields.has(intent.field)) {
          const target = ensureFrame();
          if (intent.field === "anchor") {
            framed = {
              ...target,
              shapeFrame: {
                kind: "shape-frame-v1",
                anchor: anchorShapeFrameRect(
                  anchorMode(intent.value),
                  captured.resolved!.rect,
                  captured.metrics!,
                  target.shapeFrame.anchor,
                ),
              },
            };
          } else {
            const properties = normalizeShapeObjectProperties({
              ...target.shapeProperties,
              [intent.field]: intent.value,
            });
            const { shapeProperties: _properties, ...base } = target;
            framed = { ...base, ...(properties ? { shapeProperties: properties } : {}) };
          }
        } else {
          const fields: Partial<
            Record<
              ShapeFormatField,
              "width" | "height" | "rotation" | "fontSize" | "bold" | "italic"
            >
          > = {
            sizeWidthPt: "width",
            sizeHeightPt: "height",
            rotationDeg: "rotation",
          };
          const key = fields[intent.field];
          if (key) {
            Object.assign(next, {
              [key]:
                intent.field === "sizeWidthPt" ||
                intent.field === "sizeHeightPt" ||
                intent.field === "fontSizePt"
                  ? ((intent.value as number) * 4) / 3
                  : intent.value,
            });
            if (
              intent.field === "sizeHeightPt" &&
              next.shapeText?.layout.autoFit === "resize-shape"
            ) {
              const text = materializeDrawingShapeText(next);
              text.layout.autoFit = "none";
              next = withDrawingShapeText(next, text);
            }
          } else {
            const edited = editDrawingShapeTextField(next, intent.field, intent.value);
            if (!edited) return false;
            next = edited;
          }
        }
      } else return false;
      const candidate = normalizeSheetDrawing(
        framed ??
          (captured.resolved && captured.metrics
            ? updateResolvedShapeDrawing(captured.resolved, next, captured.metrics)
            : next),
      ) as SheetGraphicDrawing | SheetFramedGraphicDrawing;
      const resolvedCandidate = captured.metrics
        ? resolveShapeDrawing(candidate, captured.metrics)
        : undefined;
      const candidateView = isFramedShapeDrawing(candidate)
        ? (resolvedCandidate!.view as SheetGraphicDrawing)
        : (normalizeSheetDrawing(candidate) as SheetGraphicDrawing);
      let preflight = candidateView;
      if (
        !resolvedCandidate?.collapsed &&
        candidateView.shapeText &&
        candidateView.text &&
        getDrawingShapeTextRect(candidateView)
      ) {
        const currentView = isFramedShapeDrawing(current)
          ? (resolveShapeDrawing(current, captured.metrics!).view as SheetGraphicDrawing)
          : (normalizeSheetDrawing(current) as SheetGraphicDrawing);
        const prepared = options.prepareText
          ? options.prepareText(candidateView, currentView)
          : intent.type === "set-text-warp" || intent.type === "set-wordart-style"
            ? {
                drawing: candidateView,
                layout: layoutDrawingShapeText(candidateView),
                resized: false,
                evaluations: 1,
              }
            : prepareDrawingShapeTextCandidate(
                candidateView,
                resolvedCandidate && captured.metrics
                  ? {
                      normalizeView: (view: SheetGraphicDrawing) =>
                        resolveShapeDrawing(
                          updateResolvedShapeDrawing(resolvedCandidate, view, captured.metrics!),
                          captured.metrics!,
                        ).view as SheetGraphicDrawing,
                    }
                  : {},
              );

        // The command owner fits the original candidate once. This detached
        // view only proves the candidate's text/paint budgets before the CAS.
        if (!stillCurrent()) return false;
        if (prepared.drawing.id !== current.id || prepared.drawing.kind !== current.kind)
          return false;
        if (resolvedCandidate && captured.metrics)
          updateResolvedShapeDrawing(resolvedCandidate, prepared.drawing, captured.metrics);
        else normalizeSheetDrawing(prepared.drawing);
        const textPlan = planShapeTextPaint({
          drawing: prepared.drawing,
          layout: prepared.layout,
          density: 1,
        });
        if (!Number.isFinite(textPlan.estimatedPeakBytes)) return false;
        preflight = prepared.drawing;
      }
      if (
        !resolvedCandidate?.collapsed &&
        (preflight.kind === "shape" ||
          (preflight.kind === "textBox" &&
            (preflight.shapeStyle?.rotation3d?.kind === "value" ||
              preflight.shapeStyle?.format3d?.kind === "value")))
      ) {
        const geometry =
          getDrawingShapeGeometry(preflight, preflight.kind === "textBox") ??
          (!preflight.shapeGeometry && !preflight.shapePath
            ? getLegacyShapeGeometry(preflight.shape, preflight.width, preflight.height)
            : undefined);
        if (!geometry) return false;
        const plan = planShapeDetailedPaint({
          drawing: { ...preflight, text: "" },
          geometry,
          density: 1,
        });
        if (!Number.isFinite(plan.estimatedPeakBytes)) return false;
      }
      if (
        [
          ...new Set([
            ...getShapeStyleAssetIds(candidate.shapeStyle),
            ...getShapeTextAssetIds(candidate.shapeText, candidate.text),
            ...getShapeStyleAssetIds(preflight.shapeStyle),
            ...getShapeTextAssetIds(preflight.shapeText, preflight.text),
          ]),
        ].some((id) => !options.isAssetAvailable?.(id))
      )
        return false;
      if (!stillCurrent()) return false;
      if (
        !options.update(
          candidate,
          current,
          intent.type === "set-wordart-style" ? "preserve-geometry" : undefined,
        )
      )
        return false;
      const applied = drawing.value;
      if (!applied || applied.id !== current.id) return false;
      acknowledged.value = {
        id: intent.intentId,
        drawing: applied,
        revision: options.getRevision(),
      };
      return true;
    } catch {
      return false;
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
  return { snapshot, capabilities, onIntent, open, close, drawing };
}
