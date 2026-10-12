import type { PictureDetailedStyle } from "@sheetcraft/core/picture-detailed-style";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeLineEnds } from "@sheetcraft/core/shape-line-ends";
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
  shapeKeepTextFlat: boolean;
  textKeepTextFlat: boolean;
  textVerticalAlignment: "top" | "middle" | "bottom";
  textDirection: "horizontal" | "vertical" | "rotate-90" | "rotate-270";
  textMarginLeftPt: number;
  textMarginRightPt: number;
  textMarginTopPt: number;
  textMarginBottomPt: number;
  textResizeToFit: boolean;
  textOverflow: boolean;
  textWrap: boolean;
  fontFamily: string;
  fontSizePt: number;
  textBold: boolean;
  textItalic: boolean;
  textUnderline: boolean;
  textStrike: boolean;
  paragraphAlignment: "left" | "center" | "right" | "justify";
  paragraphBeforePt: number;
  paragraphAfterPt: number;
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
  | "paragraphAlignment";
export type ShapeFormatTextField = "altTitle" | "altDescription";
export interface ShapeFormatSnapshot {
  owner: Readonly<ShapeFormatOwner>;
  revision: number;
  /** Actual committed drawing. Never a FloatingImage facsimile or a mutable drawing index. */
  drawing: Readonly<SheetGraphicDrawing>;
  values: Readonly<Partial<ShapeFormatValues>>;
  shapeStyle?: Readonly<PictureDetailedStyle>;
  textStyle?: Readonly<PictureDetailedStyle>;
  /** Exact intent acknowledgement allows other active drafts to survive our own accepted edit. */
  acceptedIntentId?: string;
}
export interface ShapeFormatCapabilities {
  fields: Partial<Record<ShapeFormatField, PictureFormatCapability>>;
  styles?: Partial<
    Record<ShapeFormatMode, Partial<Record<ShapeFormatStyleCategory, PictureFormatCapability>>>
  >;
  lineEnds?: PictureFormatCapability;
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
  | (ShapeFormatIntentIdentity & { type: "set-text-margins"; value: ShapeFormatTextMargins })
  | ShapeFormatFieldIntent
  | ShapeFormatStyleIntent
  | (ShapeFormatIntentIdentity & { type: "set-line-ends"; value: ShapeLineEnds | undefined });
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
    return (value: PictureDetailedStyle[K]): boolean =>
      send(
        token,
        source.capabilities().styles?.[target]?.[category],
        (identity) =>
          ({ ...identity, type: "set-style", target, category, value }) as ShapeFormatStyleIntent,
      );
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
    lineEndsAction,
    marginsAction,
    cancel: () => {
      generation++;
      source.feedback(undefined);
    },
  };
}
