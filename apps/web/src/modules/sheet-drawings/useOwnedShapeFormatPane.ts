import { computed, shallowRef, watch } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import {
  normalizeSheetDrawing,
  type SheetGraphicDrawing,
  type SheetDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { getShapeStyleAssetIds } from "@sheetcraft/core/shape-style";
import { getShapeTextAssetIds } from "@sheetcraft/core/shape-text";
import { isShapeLinePreset } from "@sheetcraft/core/shape-line-ends";
import { isShapeFreePathClosed } from "@sheetcraft/core/shape-free-path";
import type { Sheet, Workbook } from "@sheetcraft/core/workbook";
import { getDrawingShapeGeometry } from "./shape-geometry";
import { getLegacyShapeGeometry } from "./legacy-shape-geometry";
import { planShapeDetailedPaint, resolveShapeDetailedPaintStyle } from "./shape-detailed-paint";
import {
  shapeFormatOwnerKey,
  type ShapeFormatSnapshot,
  type ShapeFormatCapabilities,
  type ShapeFormatIntent,
  type ShapeFormatField,
} from "./shape-format-pane-model";
import {
  drawingShapeTextValues,
  editDrawingShapeTextField,
  materializeDrawingShapeText,
  withDrawingShapeText,
} from "./shape-text-options";
import {
  prepareDrawingShapeTextCandidate,
  getDrawingShapeTextRect,
  type PreparedDrawingShapeTextCandidate,
} from "./shape-text-runtime";
import { planShapeTextPaint, resolveShapeTextPaintStyle } from "./shape-text-paint";

/** Exact committed owner; no drawing index, synthetic picture, or mutable selection callback. */
export function useOwnedShapeFormatPane(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  isBusy: () => boolean;
  flush: () => boolean;
  update: (next: SheetDrawing, owner: SheetDrawing) => boolean;
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
    return current?.kind === "shape" || current?.kind === "textBox" ? current : undefined;
  });
  const snapshot = computed<ShapeFormatSnapshot | null>(() => {
    const d = drawing.value,
      owner = selected.value;
    if (!d || !owner) return null;
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
        sizeWidthPt: d.width * 0.75,
        sizeHeightPt: d.height * 0.75,
        rotationDeg: d.rotation,
        fontSizePt: d.fontSize * 0.75,
        textBold: d.bold,
        textItalic: d.italic,
        ...drawingShapeTextValues(d),
      },
      shapeStyle: d.kind === "shape" ? resolveShapeDetailedPaintStyle(d) : undefined,
      textStyle: resolveShapeTextPaintStyle(d),
      ...(acknowledged.value?.drawing === d && acknowledged.value.revision === revision
        ? { acceptedIntentId: acknowledged.value.id }
        : {}),
    };
  });
  const capabilities = computed<ShapeFormatCapabilities>(() => {
    const d = drawing.value;
    const enabled =
      !!d && !options.isBusy() && canUseSheetPermission(options.getSheet(), "editObjects");
    const field = { enabled, reason: enabled ? undefined : options.getUnsupportedReason() };
    const textRect = d && getDrawingShapeTextRect(d);
    const textEnabled = enabled && !!textRect;
    const textField = {
      enabled: textEnabled,
      reason: textEnabled ? undefined : options.getUnsupportedReason(),
    };
    const minimum =
      d?.shapePath || (d?.shapeGeometry && isShapeLinePreset(d.shapeGeometry.preset)) ? 1 : 16;
    const fields: ShapeFormatCapabilities["fields"] = {
      sizeWidthPt: { ...field, min: minimum * 0.75, max: 16384 * 0.75 },
      sizeHeightPt: { ...field, min: minimum * 0.75, max: 16384 * 0.75 },
      rotationDeg: { ...field, min: -360, max: 360 },
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
      if (key === "sizeWidthPt" || key === "sizeHeightPt" || key === "rotationDeg") continue;
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
          rotation3d: bodyField,
        },
        text: {
          fill: textField,
          line: textField,
          shadow: textField,
          reflection: textField,
          glow: textField,
          softEdges: textField,
          format3d: textField,
          rotation3d: textField,
        },
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
      !canUseSheetPermission(options.getSheet(), "editObjects") ||
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
    selected.value = {
      workbook: options.getWorkbook(),
      sheet: options.getSheet(),
      generation: options.getGeneration(),
      id: d.id,
      sessionId: `shape-owner-${++sequence}`,
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
    const current = before.drawing;
    let next: SheetGraphicDrawing = { ...current };
    try {
      if (intent.type === "set-style") {
        if (capabilities.value.styles?.[intent.target]?.[intent.category]?.enabled !== true)
          return false;
        const text = intent.target === "text" ? materializeDrawingShapeText(current) : undefined;
        const style = { ...(text ? text.style : current.shapeStyle) };
        if (intent.value === undefined) delete style[intent.category];
        else Object.assign(style, { [intent.category]: intent.value });
        next = text
          ? withDrawingShapeText(next, { ...text, style })
          : { ...next, shapeStyle: style };
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
        const fields: Partial<
          Record<ShapeFormatField, "width" | "height" | "rotation" | "fontSize" | "bold" | "italic">
        > = {
          sizeWidthPt: "width",
          sizeHeightPt: "height",
          rotationDeg: "rotation",
          fontSizePt: "fontSize",
          textBold: "bold",
          textItalic: "italic",
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
      } else return false;
      next = normalizeSheetDrawing(next) as SheetGraphicDrawing;
      if (next.shapeText && next.text) {
        const prepared = options.prepareText
          ? options.prepareText(next, current)
          : prepareDrawingShapeTextCandidate(next);
        // Only preflight the fitted result here. The command owner prepares the
        // original candidate once, preserving its rotated anchor in that transaction.
        const textPlan = planShapeTextPaint({
          drawing: prepared.drawing,
          layout: prepared.layout,
          density: 1,
        });
        if (!Number.isFinite(textPlan.estimatedPeakBytes)) return false;
      }
      if (next.kind === "shape") {
        const geometry =
          getDrawingShapeGeometry(next) ??
          (!next.shapeGeometry && !next.shapePath
            ? getLegacyShapeGeometry(next.shape, next.width, next.height)
            : undefined);
        if (!geometry) return false;
        const plan = planShapeDetailedPaint({
          drawing: { ...next, text: "" },
          geometry,
          density: 1,
        });
        if (!Number.isFinite(plan.estimatedPeakBytes)) return false;
      }
      if (
        [...getShapeStyleAssetIds(next.shapeStyle), ...getShapeTextAssetIds(next.shapeText)].some(
          (id) => !options.isAssetAvailable?.(id),
        )
      )
        return false;
      if (
        snapshot.value?.drawing !== current ||
        snapshot.value.revision !== before.revision ||
        options.isBusy() ||
        !canUseSheetPermission(options.getSheet(), "editObjects")
      )
        return false;
      if (!options.update(next, current)) return false;
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
