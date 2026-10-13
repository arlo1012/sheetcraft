import type { PictureDetailedStyle } from "@sheetcraft/core/picture-detailed-style";
import type {
  SheetGraphicDrawing,
  SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { ShapeLineEnds, ShapeLineEnd } from "@sheetcraft/core/shape-line-ends";
import type { ShapeGroupNode } from "@sheetcraft/core/shape-group";
import type { ShapeTextDirection, ShapeTextParagraph } from "@sheetcraft/core/shape-text";
import { normalizeShapeTextWarp, type ShapeTextWarp } from "@sheetcraft/core/text-warps";
import { getWordArtStylePreset } from "./wordart-style-presets";
import type {
  PictureFormatCapability,
  PictureFormatLengthUnit,
} from "../sheet-images/picture-format-pane-model";

/** Shape-owned editing contract. No picture/source owner is synthesized for a drawing. */
export interface ShapeFormatOwner {
  workbookId: string;
  sheetId: string;
  drawingId: string;
  /** Change on selection/cancellation boundaries, not on ordinary accepted edits. */
  sessionId: string;
}
export type ShapeFormatMode = "shape" | "text";
export type ShapeFormatTab =
  | "fill-line"
  | "effects"
  | "size-properties"
  | "text-fill-line"
  | "text-effects"
  | "text-box";
export type ShapeFormatStyleCategory = keyof PictureDetailedStyle;
/** Lengths are canonical points, angles degrees, scale percentages. Hosts own all values. */
export interface ShapeFormatValues {
  sizeWidthPt: number;
  sizeHeightPt: number;
  rotationDeg: number;
  scaleWidthPercent: number;
  scaleHeightPercent: number;
  lockAspectRatio: boolean;
  anchor: "move-size" | "move" | "fixed";
  printObject: boolean;
  locked: boolean;
  altTitle: string;
  altDescription: string;
  /** One layout property, exposed in the body's 3-D rotation section. */
  shapeKeepTextFlat: boolean;
  /** Logical start/center/end; option labels follow the current block axis. */
  textVerticalAlignment: "top" | "middle" | "bottom";
  textDirection: ShapeTextDirection;
  /** Stored independently of direction; editable only in stacked mode. */
  textLineOrder: "rtl" | "ltr";
  textMarginLeftPt: number;
  textMarginRightPt: number;
  textMarginTopPt: number;
  textMarginBottomPt: number;
  textResizeToFit: boolean;
  textOverflow: boolean;
  textWrap: boolean;
  /** Empty string inherits the existing application text stack. */
  fontFamily: string;
  fontSizePt: number;
  textBold: boolean;
  textItalic: boolean;
  textUnderline: boolean;
  textStrike: boolean;
  /** RGB/transparent character color; empty inherits the existing glyph fill. */
  textColor: string;
  paragraphAlignment: ShapeTextParagraph["alignment"];
  paragraphBeforePt: number;
  paragraphAfterPt: number;
  paragraphLineSpacing: ShapeTextParagraph["lineSpacing"]["kind"];
  paragraphLineSpacingPt: number;
}
export type ShapeFormatField = keyof ShapeFormatValues;
export type ShapeFormatNumberField = {
  [K in ShapeFormatField]: ShapeFormatValues[K] extends number ? K : never;
}[ShapeFormatField];
export type ShapeFormatBooleanField = {
  [K in ShapeFormatField]: ShapeFormatValues[K] extends boolean ? K : never;
}[ShapeFormatField];
export type ShapeFormatChoiceField =
  | "anchor"
  | "textVerticalAlignment"
  | "textDirection"
  | "textLineOrder"
  | "paragraphAlignment"
  | "paragraphLineSpacing";
export type ShapeFormatTextField = "altTitle" | "altDescription";
export interface ShapeFormatSnapshot {
  owner: Readonly<ShapeFormatOwner>;
  revision: number;
  /** Actual committed drawing. Never a FloatingImage facsimile or a mutable drawing index. */
  drawing: Readonly<SheetGraphicDrawing | SheetFramedGraphicDrawing | ShapeGroupNode>;
  values: Readonly<Partial<ShapeFormatValues>>;
  /** An omitted mixed value is editable only when its explicit capability allows it. */
  mixedFields?: readonly ShapeFormatField[];
  /** Optional host-localized explanation, such as exact selected-subtree member counts. */
  scopeDescription?: string;
  /** Actual associations affected only by an explicit connector-disconnect action. */
  connectorBindings?: readonly { endpoint: "begin" | "end"; targetName: string }[];
  shapeStyle?: Readonly<PictureDetailedStyle>;
  textStyle?: Readonly<PictureDetailedStyle>;
  /** Saved independent glyph cameras are kept; pane rotation edits the body scene. */
  independentTextCameraCount?: number;
  /** Common arrowheads across actual line descendants; omitted mixed endpoints are explicit. */
  lineEnds?: Readonly<ShapeLineEnds>;
  mixedLineEnds?: readonly ("begin" | "end")[];
  /** Mixed categories are not represented by an arbitrary leaf's style. */
  mixedStyleCategories?: Readonly<
    Partial<Record<ShapeFormatMode, readonly ShapeFormatStyleCategory[]>>
  >;
  /** Sparse exact text transform; absence means No Transform, never textPlain. */
  textWarp?: Readonly<ShapeTextWarp>;
  /** Mixed group readback never impersonates the first eligible leaf. */
  mixedTextWarp?: boolean;
  /** Actual modern WordArt or retained-warp text leaves in the selected scope. */
  textWarpScope?: Readonly<{ eligibleCount: number; descendantCount: number }>;
  /** Exact canonical preset readback; omitted when customized or mixed. */
  wordArtStyleId?: string;
  mixedWordArtStyle?: boolean;
  /** Only actual modern WordArt leaves are eligible for preset reapply and clear. */
  wordArtStyleScope?: Readonly<{ eligibleCount: number; descendantCount: number }>;
  /** Exact intent acknowledgement allows other active drafts to survive our own accepted edit. */
  acceptedIntentId?: string;
}
/** Applying an effect value can be unavailable while clearing its current source remains safe. */
export type ShapeFormatStyleCapability = PictureFormatCapability & { valueEnabled?: boolean };
export interface ShapeFormatCapabilities {
  fields: Partial<Record<ShapeFormatField, PictureFormatCapability>>;
  styles?: Partial<
    Record<ShapeFormatMode, Partial<Record<ShapeFormatStyleCategory, ShapeFormatStyleCapability>>>
  >;
  textWarp?: PictureFormatCapability;
  wordArtStyle?: PictureFormatCapability;
  clearWordArtEffects?: PictureFormatCapability;
  lineEnds?: PictureFormatCapability;
  disconnectConnector?: PictureFormatCapability;
}
export interface ShapeFormatIntentIdentity {
  owner: ShapeFormatOwner;
  baseRevision: number;
  intentId: string;
}
export type ShapeFormatFieldIntent = {
  [K in ShapeFormatField]: ShapeFormatIntentIdentity & {
    type: "set-field";
    field: K;
    value: ShapeFormatValues[K];
  };
}[ShapeFormatField];
export type ShapeFormatStyleIntent = {
  [K in ShapeFormatStyleCategory]: ShapeFormatIntentIdentity & {
    type: "set-style";
    target: ShapeFormatMode;
    category: K;
    value: PictureDetailedStyle[K];
  };
}[ShapeFormatStyleCategory];
export interface ShapeFormatTextMargins {
  leftPt: number;
  rightPt: number;
  topPt: number;
  bottomPt: number;
}
export type ShapeFormatIntent =
  | (ShapeFormatIntentIdentity & { type: "disconnect-connector" })
  | (ShapeFormatIntentIdentity & { type: "set-text-margins"; value: ShapeFormatTextMargins })
  | (ShapeFormatIntentIdentity & { type: "set-text-warp"; value?: ShapeTextWarp })
  | (ShapeFormatIntentIdentity & { type: "set-wordart-style"; presetId: string })
  | (ShapeFormatIntentIdentity & { type: "clear-wordart-effects" })
  | ShapeFormatFieldIntent
  | ShapeFormatStyleIntent
  | (ShapeFormatIntentIdentity & { type: "set-line-ends"; value: ShapeLineEnds | undefined })
  | (ShapeFormatIntentIdentity & {
      type: "set-line-end";
      endpoint: "begin" | "end";
      value: ShapeLineEnd | undefined;
    });
/** false or throw rejects this edit. The pane retains its draft and reports feedback. */
export type ShapeFormatIntentHandler = (intent: ShapeFormatIntent) => boolean;
export interface ShapeFormatOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export type ShapeFormatOptions = Partial<
  Record<ShapeFormatChoiceField, readonly ShapeFormatOption[]>
>;
export type ShapeFormatFailure =
  | "missing-selection"
  | "stale-owner"
  | "unsupported"
  | "out-of-range"
  | "apply-rejected";
export interface ShapeFormatCapture {
  owner: ShapeFormatOwner;
  revision: number;
  drawing: ShapeFormatSnapshot["drawing"];
  handler: ShapeFormatIntentHandler;
  generation: number;
}
export function shapeFormatOwnerKey(owner: Readonly<ShapeFormatOwner>): string {
  return JSON.stringify([owner.workbookId, owner.sheetId, owner.drawingId, owner.sessionId]);
}
export function shapeFormatToDisplay(valuePt: number, unit: PictureFormatLengthUnit): number {
  return unit === "in" ? valuePt / 72 : unit === "cm" ? (valuePt * 2.54) / 72 : valuePt;
}
export function shapeFormatFromDisplay(value: number, unit: PictureFormatLengthUnit): number {
  return unit === "in" ? value * 72 : unit === "cm" ? (value * 72) / 2.54 : value;
}
export function isShapeFormatLengthField(field: ShapeFormatNumberField): boolean {
  return field.endsWith("Pt");
}
/** Modern WordArt and retained ordinary-shape warps share the existing text owner. */
export function isShapeFormatTextWarpTarget(
  drawing: Readonly<Pick<SheetGraphicDrawing, "kind" | "shapeConnector" | "shapeText" | "wordArt">>,
): boolean {
  return (
    (drawing.kind === "shape" || drawing.kind === "textBox") &&
    !drawing.shapeConnector &&
    !!drawing.shapeText &&
    (drawing.wordArt === true || drawing.shapeText.warp !== undefined)
  );
}
let intentSequence = 0;
/** Runtime-neutral exact-owner/revision gate, also used to invalidate asynchronous asset work. */
export function createShapeFormatSession(source: {
  snapshot: () => ShapeFormatSnapshot | null;
  capabilities: () => ShapeFormatCapabilities;
  handler: () => ShapeFormatIntentHandler;
  feedback: (failure: ShapeFormatFailure | undefined) => void;
  accepted?: (intentId: string) => void;
}) {
  let generation = 0;
  function capture(): ShapeFormatCapture | undefined {
    const snapshot = source.snapshot();
    return snapshot
      ? {
          owner: { ...snapshot.owner },
          revision: snapshot.revision,
          drawing: snapshot.drawing,
          handler: source.handler(),
          generation,
        }
      : undefined;
  }
  function current(token: ShapeFormatCapture | undefined): boolean {
    const snapshot = source.snapshot();
    return (
      !!token &&
      !!snapshot &&
      token.generation === generation &&
      token.handler === source.handler() &&
      token.revision === snapshot.revision &&
      token.drawing === snapshot.drawing &&
      shapeFormatOwnerKey(token.owner) === shapeFormatOwnerKey(snapshot.owner) &&
      token.owner.drawingId === snapshot.drawing.id
    );
  }
  function send(
    token: ShapeFormatCapture | undefined,
    capability: PictureFormatCapability | undefined,
    make: (identity: ShapeFormatIntentIdentity) => ShapeFormatIntent,
  ): boolean {
    if (!token) {
      source.feedback("missing-selection");
      return false;
    }
    if (!current(token)) {
      source.feedback("stale-owner");
      return false;
    }
    if (capability?.enabled !== true) {
      source.feedback("unsupported");
      return false;
    }
    const identity = {
      owner: { ...token.owner },
      baseRevision: token.revision,
      intentId: `shape-format-${++intentSequence}`,
    };
    let accepted = false;
    try {
      accepted = token.handler(make(identity)) === true;
    } catch {
      /* Failed transactions preserve committed values and drafts. */
    }
    if (!accepted) {
      source.feedback("apply-rejected");
      return false;
    }
    source.accepted?.(identity.intentId);
    source.feedback(undefined);
    return true;
  }
  function fieldAction<K extends ShapeFormatField>(field: K) {
    const token = capture();
    return (value: ShapeFormatValues[K]): boolean => {
      const capability = source.capabilities().fields[field];
      if (
        typeof value === "number" &&
        (!Number.isFinite(value) ||
          (capability?.min !== undefined && value < capability.min) ||
          (capability?.max !== undefined && value > capability.max))
      ) {
        source.feedback("out-of-range");
        return false;
      }
      return send(
        token,
        capability,
        (identity) => ({ ...identity, type: "set-field", field, value }) as ShapeFormatFieldIntent,
      );
    };
  }
  function styleAction<K extends ShapeFormatStyleCategory>(target: ShapeFormatMode, category: K) {
    const token = capture();
    return (value: PictureDetailedStyle[K]): boolean => {
      const capability = source.capabilities().styles?.[target]?.[category];
      if (value?.kind === "value" && capability?.valueEnabled === false) {
        source.feedback("unsupported");
        return false;
      }
      return send(
        token,
        source.capabilities().styles?.[target]?.[category],
        (identity) =>
          ({ ...identity, type: "set-style", target, category, value }) as ShapeFormatStyleIntent,
      );
    };
  }
  function textWarpAction() {
    const token = capture();
    return (value?: ShapeTextWarp): boolean => {
      let normalized: ShapeTextWarp | undefined;
      try {
        normalized = normalizeShapeTextWarp(value);
      } catch {
        source.feedback("out-of-range");
        return false;
      }
      return send(token, source.capabilities().textWarp, (identity) => ({
        ...identity,
        type: "set-text-warp",
        ...(normalized ? { value: normalized } : {}),
      }));
    };
  }
  function wordArtStyleAction() {
    const token = capture();
    return (presetId: string): boolean => {
      const preset = getWordArtStylePreset(presetId);
      if (!preset) {
        source.feedback("out-of-range");
        return false;
      }
      return send(token, source.capabilities().wordArtStyle, (identity) => ({
        ...identity,
        type: "set-wordart-style",
        presetId: preset.id,
      }));
    };
  }
  function clearWordArtEffectsAction() {
    const token = capture();
    return (): boolean =>
      send(token, source.capabilities().clearWordArtEffects, (identity) => ({
        ...identity,
        type: "clear-wordart-effects",
      }));
  }
  function lineEndsAction() {
    const token = capture();
    return (value: ShapeLineEnds | undefined): boolean =>
      send(token, source.capabilities().lineEnds, (identity) => ({
        ...identity,
        type: "set-line-ends",
        value,
      }));
  }
  function lineEndAction() {
    const token = capture();
    return (endpoint: "begin" | "end", value: ShapeLineEnd | undefined): boolean =>
      send(token, source.capabilities().lineEnds, (identity) => ({
        ...identity,
        type: "set-line-end",
        endpoint,
        value,
      }));
  }
  function disconnectConnectorAction() {
    const token = capture();
    return (): boolean =>
      send(token, source.capabilities().disconnectConnector, (identity) => ({
        ...identity,
        type: "disconnect-connector",
      }));
  }
  function marginsAction() {
    const token = capture();
    return (value: ShapeFormatTextMargins): boolean => {
      const pairs = [
        ["textMarginLeftPt", value.leftPt],
        ["textMarginRightPt", value.rightPt],
        ["textMarginTopPt", value.topPt],
        ["textMarginBottomPt", value.bottomPt],
      ] as const;
      for (const [field, length] of pairs) {
        const capability = source.capabilities().fields[field];
        if (capability?.enabled !== true) {
          source.feedback("unsupported");
          return false;
        }
        if (
          !Number.isFinite(length) ||
          (capability.min !== undefined && length < capability.min) ||
          (capability.max !== undefined && length > capability.max)
        ) {
          source.feedback("out-of-range");
          return false;
        }
      }
      return send(token, { enabled: true }, (identity) => ({
        ...identity,
        type: "set-text-margins",
        value: { ...value },
      }));
    };
  }
  return {
    capture,
    current,
    fieldAction,
    styleAction,
    textWarpAction,
    wordArtStyleAction,
    clearWordArtEffectsAction,
    lineEndsAction,
    lineEndAction,
    disconnectConnectorAction,
    marginsAction,
    cancel: () => {
      generation++;
      source.feedback(undefined);
    },
  };
}
