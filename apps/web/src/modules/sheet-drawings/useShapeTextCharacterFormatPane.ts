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
} from "./shape-text-options";
import {
  shapeFormatOwnerKey,
  type ShapeFormatCapabilities,
  type ShapeFormatSnapshot,
  type ShapeFormatIntent,
  type ShapeFormatField,
} from "./shape-format-pane-model";

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
    const candidates: ShapeTextCharacterFormat[] =
      start === end
        ? [{ ...base, ...(state.pendingFormat ?? getShapeTextCharacterOverride(source, start)) }]
        : getShapeTextCharacterSegments(source, base).filter(
            (segment) => segment.start < end && segment.end > start,
          );
    const values = { ...drawingShapeTextValues(drawing) },
      mixedFields: ShapeFormatField[] = [];
    for (const [field, property] of Object.entries(characters) as [
      keyof typeof characters,
      ShapeTextCharacterProperty,
    ][]) {
      const first = candidates[0]?.[property];
      if (!candidates.every((entry) => entry[property] === first)) {
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
        ? `${start === end ? "字体设置用于光标处新输入的文字" : "字体设置仅用于选中的文字"}；段落和文本框设置请先应用文字，再修改。`
        : `${start === end ? "Font settings apply to new text at the caret" : "Font settings apply only to selected characters"}. Apply the text before changing paragraph or text-box settings.`,
      textStyle: drawing.shapeText?.style,
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
          ].map((category) => [category, { enabled: false, reason }]),
        ),
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
      intent.type === "set-field" && capabilities.value.fields[intent.field]?.enabled === true
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
