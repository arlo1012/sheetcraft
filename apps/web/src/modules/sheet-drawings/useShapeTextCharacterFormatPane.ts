import {
  getSelectedWordArtStyleId,
  materializeWordArtCharacterStylePreset,
  isWordArtStyleTarget,
} from "./wordart-style-application";
import { computed, shallowRef } from "vue";
import {
  getShapeTextCharacterSegments,
  getShapeTextCharacterOverride,
  type ShapeTextCharacterFormat,
  type ShapeTextCharacterProperty,
} from "@sheetcraft/core/shape-text-character-runs";
import type { ShapeTextEditSnapshot, ShapeTextEditCallbacks } from "./useShapeTextEditSession";
import {
  drawingShapeTextBaseCharacterFormat,
  drawingShapeTextCharacterSource,
  drawingShapeTextValues,
  shapeTextCharacterColorValue,
} from "./shape-text-options";
import {
  shapeFormatOwnerKey,
  isShapeFormatTextWarpTarget,
  type ShapeFormatCapabilities,
  type ShapeFormatSnapshot,
  type ShapeFormatIntent,
  type ShapeFormatField,
} from "./shape-format-pane-model";

import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import { resolveShapeDetailedPaintStyle } from "./shape-detailed-paint";
import { resolveShapeTextPaintStyle } from "./shape-text-paint";

const characters = {
  fontFamily: "fontFamily",
  fontSizePt: "fontSize",
  textBold: "bold",
  textItalic: "italic",
  textUnderline: "underline",
  textStrike: "strike",
  textColor: "color",
} as const;
const layoutFields: readonly ShapeFormatField[] = [
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
  "shapeKeepTextFlat",
  "paragraphAlignment",
  "paragraphBeforePt",
  "paragraphAfterPt",
  "paragraphLineSpacing",
  "paragraphLineSpacingPt",
];
/** The pane edits this same leased draft; it never runs a second workbook command. */
export function useShapeTextCharacterFormatPane(options: {
  getSnapshot: () => ShapeTextEditSnapshot | undefined;
  getCallbacks: () => ShapeTextEditCallbacks | undefined;
  getWorkbookId: () => string;
  getSheetId: () => string;
  getLocale: () => "en-US" | "zh-CN";
  getTheme?: () => WorkbookTheme;
}) {
  const visible = shallowRef(true),
    acknowledged = shallowRef<{ revision: number; id: string }>();
  const snapshot = computed<ShapeFormatSnapshot | null>(() => {
    const state = options.getSnapshot();
    if (!state) return null;
    const drawing = state.draftView,
      source = drawingShapeTextCharacterSource(drawing),
      base = drawingShapeTextBaseCharacterFormat(drawing);
    const { start, end } = state.selection;
    const caretOverride = state.pendingFormat ?? getShapeTextCharacterOverride(source, start);
    const caretBase = { ...base };
    if (caretOverride.fill !== undefined && caretOverride.color === undefined)
      delete caretBase.color;
    const candidates: ShapeTextCharacterFormat[] =
      start === end
        ? [{ ...caretBase, ...caretOverride }]
        : getShapeTextCharacterSegments(source, base).filter(
            (segment) => segment.start < end && segment.end > start,
          );
    const values = { ...drawingShapeTextValues(drawing) },
      mixedFields: ShapeFormatField[] = [];
    for (const [field, property] of Object.entries(characters) as [
      keyof typeof characters,
      ShapeTextCharacterProperty,
    ][]) {
      const readValue = (entry: ShapeTextCharacterFormat) =>
        field === "textColor"
          ? shapeTextCharacterColorValue(entry, options.getTheme?.())
          : entry[property];
      const first = candidates[0] ? readValue(candidates[0]) : undefined;
      if (!candidates.every((entry) => readValue(entry) === first)) {
        delete values[field];
        mixedFields.push(field);
      } else
        Object.assign(values, {
          [field]:
            field === "fontSizePt"
              ? (first as number) * 0.75
              : field === "fontFamily" && first === base.fontFamily
                ? (drawing.shapeText?.fontFamily ?? "")
                : first,
        });
    }
    const textStyle: ShapeDetailedStyle = { ...resolveShapeTextPaintStyle(drawing) };
    const mixedStyles: ("fill" | "line" | "shadow" | "reflection" | "glow")[] = [];
    for (const category of ["fill", "line", "shadow", "reflection", "glow"] as const) {
      const effective = candidates.map((entry) =>
        category === "fill" && entry.color !== undefined
          ? entry.color === "transparent"
            ? { kind: "none" as const }
            : {
                kind: "value" as const,
                value: {
                  kind: "solid" as const,
                  color: { kind: "rgb" as const, rgb: entry.color.toUpperCase() },
                  opacity: 1,
                },
              }
          : (entry[category] ?? textStyle[category]),
      );
      const first = effective[0];
      if (effective.every((entry) => JSON.stringify(entry) === JSON.stringify(first)))
        Object.assign(textStyle, { [category]: first });
      else {
        delete textStyle[category];
        mixedStyles.push(category);
      }
    }
    const chinese = options.getLocale() === "zh-CN";
    return {
      owner: {
        workbookId: options.getWorkbookId(),
        sheetId: options.getSheetId(),
        drawingId: drawing.id,
        sessionId: `shape-text-${state.sessionId}`,
      },
      revision: state.formatRevision,
      drawing,
      values,
      mixedFields,
      scopeDescription: chinese
        ? `${start === end ? "字符格式用于光标处新输入的文字" : "字符格式仅用于选中的文字"}；段落、文本框及形状外观用于当前对象。`
        : `${start === end ? "Character formatting applies to new text at the caret" : "Character formatting applies to selected characters"}. Paragraph, text-box and shape settings apply to this object.`,
      shapeStyle: resolveShapeDetailedPaintStyle(drawing),
      textWarpScope: {
        eligibleCount: isShapeFormatTextWarpTarget(drawing) ? 1 : 0,
        descendantCount: 1,
      },
      textStyle,
      ...(isWordArtStyleTarget(drawing)
        ? {
            wordArtStyleId: getSelectedWordArtStyleId(candidates),
            mixedWordArtStyle: mixedStyles.length > 0,
            wordArtStyleEditingScope: start === end ? ("caret" as const) : ("selection" as const),
            wordArtStyleScope: { eligibleCount: 1, descendantCount: 1 },
          }
        : {}),
      ...(drawing.shapeText?.warp ? { textWarp: drawing.shapeText.warp } : {}),
      ...(mixedStyles.length ? { mixedStyleCategories: { text: mixedStyles } } : {}),
      ...(acknowledged.value?.revision === state.formatRevision
        ? { acceptedIntentId: acknowledged.value.id }
        : {}),
    };
  });
  const capabilities = computed<ShapeFormatCapabilities>(() => {
    const state = options.getSnapshot(),
      enabled = !!state && state.canFormat && !state.stale && !state.composing,
      localEffects = !!state && isWordArtStyleTarget(state.draftView);
    const localCategory = (category: string) =>
      category === "fill" ||
      category === "line" ||
      (localEffects && (category === "shadow" || category === "reflection" || category === "glow"));
    const reason =
      options.getLocale() === "zh-CN"
        ? state?.composing
          ? "请先完成当前文字输入。"
          : "当前对象无法进行此更改。"
        : state?.composing
          ? "Finish composing text first."
          : "This change is unavailable for the current object.";
    const fields: ShapeFormatCapabilities["fields"] = {};
    for (const field of Object.keys(characters) as ShapeFormatField[])
      fields[field] = { enabled, reason: enabled ? undefined : reason };
    for (const field of layoutFields)
      fields[field] = { enabled, reason: enabled ? undefined : reason };
    fields.fontSizePt = { ...fields.fontSizePt!, min: 0.75, max: 384 };
    for (const field of [
      "textMarginLeftPt",
      "textMarginRightPt",
      "textMarginTopPt",
      "textMarginBottomPt",
      "paragraphBeforePt",
      "paragraphAfterPt",
    ] as const)
      fields[field] = { ...fields[field]!, min: 0, max: 4096 };
    fields.paragraphLineSpacingPt = {
      ...fields.paragraphLineSpacingPt!,
      enabled: enabled && state?.draftView.shapeText?.paragraph.lineSpacing.kind === "exact",
      min: 0.001,
      max: 4096,
    };
    fields.textLineOrder = {
      ...fields.textLineOrder!,
      enabled: enabled && state?.draftView.shapeText?.layout.direction === "stacked",
    };
    return {
      fields,
      styles: {
        shape: Object.fromEntries(
          [
            "fill",
            "line",
            "shadow",
            "reflection",
            "glow",
            "softEdges",
            "format3d",
            "rotation3d",
          ].map((category) => [
            category,
            {
              enabled: enabled && (category === "fill" || category === "line"),
              reason: enabled && (category === "fill" || category === "line") ? undefined : reason,
            },
          ]),
        ),
        text: Object.fromEntries(
          [
            "fill",
            "line",
            "shadow",
            "reflection",
            "glow",
            "softEdges",
            "format3d",
            "rotation3d",
          ].map((category) => [
            category,
            {
              enabled: enabled && localCategory(category),
              reason: enabled && localCategory(category) ? undefined : reason,
            },
          ]),
        ),
      },
      ...(state && isWordArtStyleTarget(state.draftView)
        ? {
            wordArtStyle: { enabled, reason: enabled ? undefined : reason },
            clearWordArtEffects: { enabled: false, reason },
          }
        : {}),
      textWarp: {
        enabled: enabled && !!state && isShapeFormatTextWarpTarget(state.draftView),
        reason: enabled ? undefined : reason,
      },
      lineEnds: { enabled: false, reason },
    };
  });
  function onIntent(intent: ShapeFormatIntent): boolean {
    const current = snapshot.value,
      state = options.getSnapshot(),
      callbacks = options.getCallbacks();
    if (
      !current ||
      !state ||
      !callbacks ||
      callbacks.sessionId !== state.sessionId ||
      intent.baseRevision !== current.revision ||
      shapeFormatOwnerKey(intent.owner) !== shapeFormatOwnerKey(current.owner)
    )
      return false;
    const accepted =
      intent.type === "set-style" &&
      intent.target === "shape" &&
      (intent.category === "fill" || intent.category === "line") &&
      capabilities.value.styles?.shape?.[intent.category]?.enabled === true
        ? callbacks.setBodyStyle(intent.category, intent.value)
        : intent.type === "set-text-warp" && capabilities.value.textWarp?.enabled === true
          ? callbacks.setWarp(intent.value)
          : intent.type === "set-style" &&
              intent.target === "text" &&
              capabilities.value.styles?.text?.[intent.category]?.enabled === true
            ? intent.category === "fill"
              ? intent.value === undefined
                ? callbacks.format({}, ["fill", "color"])
                : callbacks.format({ fill: intent.value }, ["color"])
              : intent.category === "line"
                ? intent.value === undefined
                  ? callbacks.format({}, ["line"])
                  : callbacks.format({ line: intent.value })
                : intent.category === "shadow" ||
                    intent.category === "reflection" ||
                    intent.category === "glow"
                  ? intent.value === undefined
                    ? callbacks.format({}, [intent.category])
                    : callbacks.format({ [intent.category]: intent.value })
                  : false
            : intent.type === "set-wordart-style" &&
                capabilities.value.wordArtStyle?.enabled === true
              ? (() => {
                  try {
                    return callbacks.format(
                      materializeWordArtCharacterStylePreset(intent.presetId),
                      ["color"],
                    );
                  } catch {
                    return false;
                  }
                })()
              : intent.type === "set-field" &&
                  capabilities.value.fields[intent.field]?.enabled === true
                ? callbacks.editField(intent.field, intent.value)
                : intent.type === "set-text-margins" &&
                    capabilities.value.fields.textMarginLeftPt?.enabled === true
                  ? callbacks.setMargins(intent.value)
                  : false;
    if (!accepted) return false;
    const next = options.getSnapshot();
    if (next?.sessionId === state.sessionId)
      acknowledged.value = { revision: next.formatRevision, id: intent.intentId };
    return true;
  }
  return {
    snapshot: computed(() => (visible.value ? snapshot.value : null)),
    ribbonSnapshot: snapshot,
    capabilities,
    onIntent,
    close: () => {
      visible.value = false;
    },
    open: () => {
      visible.value = true;
    },
  };
}
