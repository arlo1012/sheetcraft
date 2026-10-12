import type { PictureCropShape } from "@sheetcraft/core/shape-presets";
import { PICTURE_PAINT_LABEL_KEYS } from "./picture-paint-labels";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
import type { PictureDetailedStyle } from "@sheetcraft/core/picture-detailed-style";
import type { PictureDetailedCategory } from "./picture-detailed-style-edit";
/**
 * Runtime-neutral, field-level contract for the picture format pane.
 * Lengths are points (72 pt/in), angles degrees, percentages 0–100 where stated.
 * A host must derive these values and gate every capability against its actual renderer/Core support.
 * This module never applies edits to workbook objects or approximates rotated/cropped geometry.
 */
export type PictureFormatTab = "fill-line" | "effects" | "size-properties" | "picture";
export type PictureFormatLengthUnit = "in" | "cm" | "pt";
export type PictureFormatAnchor = "move-size" | "move" | "fixed";
export type PictureFormatLineMode = "inherit" | "none" | "solid" | "gradient";
export interface PictureFormatOwner {
  workbookId: string;
  sheetId: string;
  pictureId: string;
  /** Source-free group containers deliberately have no asset identity. */
  assetId?: string;
  /** Replace this on selection/context/cancellation boundaries, never for an ordinary own edit. */
  sessionId: string;
  /** Actual host-derived ancestor path. Omit only for a standalone leaf. Never fabricate it. */
  ownerPath?: readonly string[];
}
export interface PictureFormatValues {
  sizeWidthPt: number;
  sizeHeightPt: number;
  rotationDeg: number;
  scaleWidthPercent: number;
  scaleHeightPercent: number;
  lockAspectRatio: boolean;
  relativeToOriginalSize: boolean;
  anchor: PictureFormatAnchor;
  printObject: boolean;
  locked: boolean;
  altTitle: string;
  altDescription: string;
  sourceWidthPt: number;
  sourceHeightPt: number;
  /** Source CENTER relative to crop CENTER, in the local picture axes. */
  sourceOffsetXPt: number;
  sourceOffsetYPt: number;
  cropWidthPt: number;
  cropHeightPt: number;
  /** Sheet-space unrotated layout rectangle; these are not crop margins. */
  cropLeftPt: number;
  cropTopPt: number;
  fillMode: string;
  fillColor: string;
  fillTransparencyPercent: number;
  fillGradientPreset: string;
  lineMode: PictureFormatLineMode;
  lineColor: string;
  lineTransparencyPercent: number;
  lineWidthPt: number;
  lineGradientPreset: string;
  lineCompound: string;
  lineDash: string;
  lineCap: string;
  lineJoin: string;
  shadowPreset: string;
  shadowColor: string;
  shadowTransparencyPercent: number;
  shadowSizePercent: number;
  shadowBlurPt: number;
  shadowDistancePt: number;
  shadowAngleDeg: number;
  reflectionPreset: string;
  reflectionSizePercent: number;
  reflectionTransparencyPercent: number;
  reflectionBlurPt: number;
  reflectionDistancePt: number;
  glowPreset: string;
  glowColor: string;
  glowSizePt: number;
  glowTransparencyPercent: number;
  softEdgePreset: string;
  softEdgeSizePt: number;
  depthColor: string;
  depthSizePt: number;
  contourColor: string;
  contourSizePt: number;
  material: string;
  lighting: string;
  lightingAngleDeg: number;
  rotation3dPreset: string;
  rotation3dXDeg: number;
  rotation3dYDeg: number;
  rotation3dZDeg: number;
  perspectiveDeg: number;
  distanceFromGroundPt: number;
}
export type PictureFormatField = keyof PictureFormatValues;
export type PictureFormatNumberField = {
  [F in PictureFormatField]: PictureFormatValues[F] extends number ? F : never;
}[PictureFormatField];
export type PictureFormatTextField = "altTitle" | "altDescription";
export type PictureFormatDraftField = PictureFormatNumberField | PictureFormatTextField;
export type PictureFormatChoiceField = {
  [F in PictureFormatField]: PictureFormatValues[F] extends string ? F : never;
}[PictureFormatField];
export type PictureFormatBooleanField = {
  [F in PictureFormatField]: PictureFormatValues[F] extends boolean ? F : never;
}[PictureFormatField];
export type PictureFormatReset =
  | "reset-size"
  | "reset-picture"
  | "reset-crop"
  | "reset-3d-format"
  | "reset-3d-rotation";
export interface PictureFormatCapability {
  enabled: boolean;
  /** Already localized by the host; shown beside the disabled field. */
  reason?: string;
  /** Optional host domain bounds in the canonical model units; no hidden UI clamp. */
  min?: number;
  max?: number;
}
export interface PictureFormatCapabilities {
  fields: Partial<Record<PictureFormatField, PictureFormatCapability>>;
  detailed?: Partial<Record<PictureDetailedCategory, PictureFormatCapability>>;
  cropShape?: PictureFormatCapability;
  resets?: Partial<Record<PictureFormatReset, PictureFormatCapability>>;
}
export interface PictureFormatSnapshot {
  owner: PictureFormatOwner;
  revision: number;
  values: Readonly<Partial<PictureFormatValues>>;
  /** Detached source appearance for real structured editors, not a whole-workbook patch. */
  appearance?: ImageAppearance;
  cropShape?: PictureCropShape;
  /** Explicit member scope; containers have no source or local picture paint. */
  paintScope?: "group-leaves";
  mixedDetailed?: readonly ("fill" | "line")[];
  /** Identity of the applied intent, when the host can provide it. */
  acceptedIntentId?: string;
  /** Read-only metadata, not silently used to implement a resize. */
  originalSizePt?: Readonly<{ width: number; height: number }>;
  name?: string;
}
interface PictureFormatIntentIdentity {
  owner: PictureFormatOwner;
  baseRevision: number;
  intentId: string;
}
export type PictureFormatEditIntent = {
  [F in PictureFormatField]: PictureFormatIntentIdentity & {
    type: "set-field";
    field: F;
    value: PictureFormatValues[F];
  };
}[PictureFormatField];
export type PictureFormatDetailedIntent = {
  [K in PictureDetailedCategory]: PictureFormatIntentIdentity & {
    type: "set-detailed";
    category: K;
    value: PictureDetailedStyle[K] | undefined;
  };
}[PictureDetailedCategory];
export type PictureFormatIntent =
  | PictureFormatDetailedIntent
  | PictureFormatEditIntent
  | (PictureFormatIntentIdentity & { type: "set-crop-shape"; value: PictureCropShape | undefined })
  | (PictureFormatIntentIdentity & { type: PictureFormatReset });
/** true means accepted for this exact owner; false must leave the draft intact. */
export type PictureFormatIntentHandler = (intent: PictureFormatIntent) => boolean;
export interface PictureFormatOption {
  value: string;
  label: string;
  disabled?: boolean;
}
/** Host-owned preset IDs and labels. No desktop icon/gallery assets or guessed preset semantics. */
export type PictureFormatOptions = Partial<
  Record<PictureFormatChoiceField, readonly PictureFormatOption[]>
>;
export const PICTURE_FORMAT_LABEL_KEYS = [
  ...PICTURE_PAINT_LABEL_KEYS,
  "paneTitle",
  "close",
  "noSelection",
  "fillLineTab",
  "effectsTab",
  "sizePropertiesTab",
  "pictureTab",
  "fillSection",
  "groupMemberPaintScope",
  "lineSection",
  "sizeSection",
  "propertiesSection",
  "altTextSection",
  "cropSection",
  "sourcePosition",
  "cropPosition",
  "originalSize",
  "originalSizeLoading",
  "originalSizeUnavailable",
  "originalSizeTooLarge",
  "retryOriginalSize",
  "units",
  "unitIn",
  "unitCm",
  "unitPt",
  "percentUnit",
  "degreeUnit",
  "shadowSection",
  "reflectionSection",
  "glowSection",
  "softEdgesSection",
  "format3dSection",
  "rotation3dSection",
  "depthSection",
  "contourSection",
  "preset",
  "automatic",
  "none",
  "solid",
  "gradient",
  "anchorMoveSize",
  "anchorMove",
  "anchorFixed",
  "notAvailable",
  "invalidNumber",
  "outOfRange",
  "applyRejected",
  "staleOwner",
  "resetSize",
  "resetPicture",
  "resetCrop",
  "reset3dFormat",
  "reset3dRotation",
  "cropHelp",
  "sizeHelp",
  "keepTextFlatUnavailable",
  "sizeWidthPt",
  "sizeHeightPt",
  "rotationDeg",
  "scaleWidthPercent",
  "scaleHeightPercent",
  "lockAspectRatio",
  "relativeToOriginalSize",
  "anchor",
  "printObject",
  "locked",
  "altTitle",
  "altDescription",
  "sourceWidthPt",
  "sourceHeightPt",
  "sourceOffsetXPt",
  "sourceOffsetYPt",
  "cropWidthPt",
  "cropHeightPt",
  "cropLeftPt",
  "cropTopPt",
  "fillMode",
  "fillColor",
  "fillTransparencyPercent",
  "fillGradientPreset",
  "lineMode",
  "lineColor",
  "lineTransparencyPercent",
  "lineWidthPt",
  "lineGradientPreset",
  "lineCompound",
  "lineDash",
  "lineCap",
  "lineJoin",
  "shadowPreset",
  "shadowColor",
  "shadowTransparencyPercent",
  "shadowSizePercent",
  "shadowBlurPt",
  "shadowDistancePt",
  "shadowAngleDeg",
  "reflectionPreset",
  "reflectionSizePercent",
  "reflectionTransparencyPercent",
  "reflectionBlurPt",
  "reflectionDistancePt",
  "glowPreset",
  "glowColor",
  "glowSizePt",
  "glowTransparencyPercent",
  "softEdgePreset",
  "softEdgeSizePt",
  "depthColor",
  "depthSizePt",
  "contourColor",
  "contourSizePt",
  "material",
  "lighting",
  "lightingAngleDeg",
  "rotation3dPreset",
  "rotation3dXDeg",
  "rotation3dYDeg",
  "rotation3dZDeg",
  "perspectiveDeg",
  "distanceFromGroundPt",
] as const;
export type PictureFormatLabelKey = (typeof PICTURE_FORMAT_LABEL_KEYS)[number];
export type PictureFormatLabels = Readonly<Record<PictureFormatLabelKey, string>>;
export type PictureFormatTranslate = (key: PictureFormatLabelKey) => string;
export type PictureFormatError = "invalidNumber" | "outOfRange" | "applyRejected" | "staleOwner";
export const PICTURE_FORMAT_GEOMETRY_FIELDS: readonly PictureFormatNumberField[] = [
  "sizeWidthPt",
  "sizeHeightPt",
  "sourceWidthPt",
  "sourceHeightPt",
  "sourceOffsetXPt",
  "sourceOffsetYPt",
  "cropWidthPt",
  "cropHeightPt",
  "cropLeftPt",
  "cropTopPt",
];
const positiveFields = new Set<PictureFormatNumberField>([
  "sizeWidthPt",
  "sizeHeightPt",
  "sourceWidthPt",
  "sourceHeightPt",
  "cropWidthPt",
  "cropHeightPt",
  "scaleWidthPercent",
  "scaleHeightPercent",
]);
const transparencyFields = new Set<PictureFormatNumberField>([
  "fillTransparencyPercent",
  "lineTransparencyPercent",
  "shadowTransparencyPercent",
  "reflectionTransparencyPercent",
  "glowTransparencyPercent",
]);
const nonnegativeFields = new Set<PictureFormatNumberField>([
  "lineWidthPt",
  "shadowSizePercent",
  "shadowBlurPt",
  "shadowDistancePt",
  "reflectionSizePercent",
  "reflectionBlurPt",
  "reflectionDistancePt",
  "glowSizePt",
  "softEdgeSizePt",
  "depthSizePt",
  "contourSizePt",
]);
export function pictureFormatOwnerKey(owner: PictureFormatOwner): string {
  return JSON.stringify([
    owner.workbookId,
    owner.sheetId,
    owner.pictureId,
    owner.assetId,
    owner.sessionId,
    owner.ownerPath ?? null,
  ]);
}
export function clonePictureFormatOwner(owner: PictureFormatOwner): PictureFormatOwner {
  return {
    workbookId: owner.workbookId,
    sheetId: owner.sheetId,
    pictureId: owner.pictureId,
    assetId: owner.assetId,
    sessionId: owner.sessionId,
    ...(owner.ownerPath === undefined ? {} : { ownerPath: [...owner.ownerPath] }),
  };
}
export function samePictureFormatOwner(
  left: PictureFormatOwner,
  right: PictureFormatOwner,
): boolean {
  return pictureFormatOwnerKey(left) === pictureFormatOwnerKey(right);
}
export function pictureFormatPointsToUnit(points: number, unit: PictureFormatLengthUnit): number {
  return unit === "in" ? points / 72 : unit === "cm" ? (points * 2.54) / 72 : points;
}
export function pictureFormatUnitToPoints(value: number, unit: PictureFormatLengthUnit): number {
  return unit === "in" ? value * 72 : unit === "cm" ? (value * 72) / 2.54 : value;
}
export function pictureFormatDisplayNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "";
  return String(Number(value.toFixed(4)));
}
export function pictureFormatNumericValue(
  field: PictureFormatNumberField,
  text: string,
  unit: PictureFormatLengthUnit,
  capability?: PictureFormatCapability,
): { value: number } | { error: "invalidNumber" | "outOfRange" } {
  // A decimal draft can contain a trailing decimal separator; no coercion of blanks, hex or infinity.
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text.trim())) return { error: "invalidNumber" };
  const displayed = Number(text.trim().replace(",", "."));
  const value = PICTURE_FORMAT_GEOMETRY_FIELDS.includes(field)
    ? pictureFormatUnitToPoints(displayed, unit)
    : displayed;
  if (!Number.isFinite(value)) return { error: "invalidNumber" };
  if (
    (positiveFields.has(field) && value <= 0) ||
    (nonnegativeFields.has(field) && value < 0) ||
    (transparencyFields.has(field) && (value < 0 || value > 100)) ||
    (capability?.min !== undefined && value < capability.min) ||
    (capability?.max !== undefined && value > capability.max)
  )
    return { error: "outOfRange" };
  return { value };
}
export interface PictureFormatDraft {
  text: string;
  dirty: boolean;
  focused: boolean;
  generation: number;
  submitted?: {
    intentId: string;
    generation: number;
    value: string | number;
    accepted: boolean;
    baseRevision: number;
  };
}
export interface PictureFormatDraftState {
  owner: PictureFormatOwner | null;
  revision: number;
  sequence: number;
  drafts: Partial<Record<PictureFormatDraftField, PictureFormatDraft>>;
  errors: Partial<Record<PictureFormatField | PictureFormatReset, PictureFormatError>>;
}
export function createPictureFormatDraftState(
  snapshot: PictureFormatSnapshot | null,
  sequence = 0,
): PictureFormatDraftState {
  return {
    owner: snapshot ? clonePictureFormatOwner(snapshot.owner) : null,
    revision: snapshot?.revision ?? 0,
    sequence,
    drafts: {},
    errors: {},
  };
}
export function editPictureFormatDraft(
  state: PictureFormatDraftState,
  field: PictureFormatDraftField,
  text: string,
): PictureFormatDraftState {
  const previous = state.drafts[field];
  const errors = { ...state.errors };
  delete errors[field];
  return {
    ...state,
    errors,
    drafts: {
      ...state.drafts,
      [field]: {
        text,
        dirty: true,
        focused: previous?.focused ?? false,
        generation: (previous?.generation ?? 0) + 1,
        ...(previous?.submitted ? { submitted: previous.submitted } : {}),
      },
    },
  };
}
export function focusPictureFormatDraft(
  state: PictureFormatDraftState,
  field: PictureFormatDraftField,
  text: string,
  focused: boolean,
): PictureFormatDraftState {
  const previous = state.drafts[field];
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [field]: previous ? { ...previous, focused } : { text, focused, dirty: false, generation: 0 },
    },
  };
}
export function cancelPictureFormatDraft(
  state: PictureFormatDraftState,
  field?: PictureFormatDraftField,
): PictureFormatDraftState {
  if (!field) return { ...state, drafts: {}, errors: {} };
  const drafts = { ...state.drafts };
  const errors = { ...state.errors };
  delete drafts[field];
  delete errors[field];
  return { ...state, drafts, errors };
}
export function reconcilePictureFormatDraftState(
  state: PictureFormatDraftState,
  snapshot: PictureFormatSnapshot | null,
): PictureFormatDraftState {
  if (!snapshot || !state.owner || !samePictureFormatOwner(state.owner, snapshot.owner))
    return createPictureFormatDraftState(snapshot, state.sequence);
  const drafts = { ...state.drafts };
  for (const field of Object.keys(drafts) as PictureFormatDraftField[]) {
    const draft = drafts[field]!;
    const submitted = draft.submitted;
    if (!submitted) continue;
    const acknowledged =
      snapshot.acceptedIntentId === submitted.intentId ||
      (submitted.accepted &&
        snapshot.revision !== submitted.baseRevision &&
        snapshot.values[field] === submitted.value);
    if (!acknowledged) continue;
    // A late acknowledgement cannot erase digits typed after the committed generation.
    if (draft.generation !== submitted.generation) {
      const { submitted: _submitted, ...next } = draft;
      drafts[field] = next;
    } else if (draft.focused) {
      drafts[field] = {
        text:
          (field === "scaleWidthPercent" || field === "scaleHeightPercent") &&
          snapshot.values.relativeToOriginalSize === false
            ? pictureFormatDisplayNumber(snapshot.values[field] ?? 100)
            : draft.text,
        focused: true,
        dirty: false,
        generation: draft.generation,
      };
    } else delete drafts[field];
  }
  return { ...state, revision: snapshot.revision, drafts };
}
export function canApplyPictureFormatIntent(
  intent: PictureFormatIntent,
  snapshot: PictureFormatSnapshot | null,
  capabilities: PictureFormatCapabilities,
): boolean {
  if (!snapshot || !samePictureFormatOwner(intent.owner, snapshot.owner)) return false;
  return (
    (intent.type === "set-field"
      ? capabilities.fields[intent.field]
      : intent.type === "set-crop-shape"
        ? capabilities.cropShape
        : intent.type === "set-detailed"
          ? capabilities.detailed?.[intent.category]
          : capabilities.resets?.[intent.type]
    )?.enabled === true
  );
}
/** Creates exactly one field edit; never forwards a spread workbook or appearance patch. */
export function createPictureFormatFieldIntent<F extends PictureFormatField>(
  snapshot: PictureFormatSnapshot,
  field: F,
  value: PictureFormatValues[F],
  intentId: string,
): Extract<PictureFormatEditIntent, { field: F }> {
  return {
    type: "set-field",
    owner: clonePictureFormatOwner(snapshot.owner),
    baseRevision: snapshot.revision,
    intentId,
    field,
    value,
  } as Extract<PictureFormatEditIntent, { field: F }>;
}
export const PICTURE_FORMAT_RESET_CONTRACT: Readonly<
  Record<PictureFormatReset, readonly string[]>
> = {
  "reset-size": [
    "original-source-size",
    "original-crop-size",
    "zero-source-offsets",
    "zero-2d-rotation",
    "retain-position",
    "retain-appearance",
  ],
  "reset-picture": ["retain-all-geometry", "reset-picture-appearance"],
  "reset-crop": [
    "crop-to-current-source-size",
    "zero-source-offsets",
    "retain-scale",
    "retain-2d-rotation",
    "retain-appearance",
  ],
  "reset-3d-format": ["reset-3d-format-only", "retain-2d-geometry", "retain-other-appearance"],
  "reset-3d-rotation": ["reset-3d-rotation-only", "retain-2d-geometry", "retain-other-appearance"],
};

export function createPictureFormatDetailedIntent<K extends PictureDetailedCategory>(
  snapshot: PictureFormatSnapshot,
  category: K,
  value: PictureDetailedStyle[K] | undefined,
  intentId: string,
): Extract<PictureFormatDetailedIntent, { category: K }> {
  return {
    type: "set-detailed",
    owner: clonePictureFormatOwner(snapshot.owner),
    baseRevision: snapshot.revision,
    intentId,
    category,
    value,
  } as Extract<PictureFormatDetailedIntent, { category: K }>;
}
