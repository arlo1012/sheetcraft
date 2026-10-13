import { getAppliedWordArtStyleId, isWordArtStyleTarget } from "./wordart-style-application";
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
  type ShapeFormatCapabilities,
  type ShapeFormatSnapshot,
  type ShapeFormatIntent,
  type ShapeFormatField,
} from "./shape-format-pane-model";

import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
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
    if (!state || !visible.value) return null;
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
    const mixedStyles: ("fill" | "line")[] = [];
    for (const category of ["fill", "line"] as const) {
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
        ? `${start === end ? "字体、文字填充和轮廓用于光标处新输入的文字" : "字体、文字填充和轮廓仅用于选中的文字"}；段落、文本框和文字转换设置请先应用文字，再修改。`
        : `${start === end ? "Font, text fill and outline apply to new text at the caret" : "Font, text fill and outline apply only to selected characters"}. Apply the text before changing paragraph, text-box or text-transform settings.`,
      textStyle,
      ...(isWordArtStyleTarget(drawing)
        ? {
            wordArtStyleId: getAppliedWordArtStyleId(drawing),
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
      enabled = !!state && !state.error && !state.stale && !state.composing;
    const reason =
      options.getLocale() === "zh-CN"
        ? "请先应用文字，再修改形状外观、段落布局或高级文字效果。"
        : "Apply the text before changing shape appearance, paragraph layout or advanced text effects.";
    const fields: ShapeFormatCapabilities["fields"] = {};
    for (const field of Object.keys(characters) as ShapeFormatField[])
      fields[field] = { enabled, reason: enabled ? undefined : reason };
    for (const field of layoutFields) fields[field] = { enabled: false, reason };
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
      enabled: false,
      min: 0.001,
      max: 4096,
    };
    fields.textLineOrder = { ...fields.textLineOrder!, enabled: false };
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
          ].map((category) => [category, { enabled: false, reason }]),
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
              enabled: enabled && (category === "fill" || category === "line"),
              reason: enabled && (category === "fill" || category === "line") ? undefined : reason,
            },
          ]),
        ),
      },
      ...(state && isWordArtStyleTarget(state.draftView)
        ? {
            wordArtStyle: { enabled: false, reason },
            clearWordArtEffects: { enabled: false, reason },
          }
        : {}),
      textWarp: { enabled: false, reason },
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
            : false
        : intent.type === "set-field" && capabilities.value.fields[intent.field]?.enabled === true
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
    snapshot,
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
