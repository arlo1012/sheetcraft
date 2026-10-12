import type { PictureFormatLabels } from "./picture-format-pane-model";

/** Host-selected feedback; these messages do not enable a field or an effect. */
export const PICTURE_FORMAT_CAPABILITY_REASON_KEYS = [
  "unsupportedFeature",
  "missingSelection",
  "missingMetrics",
  "missingResource",
  "groupContainer",
  "sourceOnly",
  "protectedObject",
  "inheritedLine",
  "compositeLine",
  "inheritedProperties",
] as const;
export type PictureFormatCapabilityReasonKey =
  (typeof PICTURE_FORMAT_CAPABILITY_REASON_KEYS)[number];

/** Captions for the existing none/soft/hard shadow choices, not new presets. */
export const PICTURE_FORMAT_OPTION_LABEL_KEYS = [
  "noShadow",
  "softShadow",
  "hardShadow",
  "inheritShadow",
  "inheritLine",
  "localLine",
] as const;
export type PictureFormatOptionLabelKey = (typeof PICTURE_FORMAT_OPTION_LABEL_KEYS)[number];

export type PictureFormatMessageSchema = {
  pictureFormat: PictureFormatLabels & {
    capabilityReasons: Record<PictureFormatCapabilityReasonKey, string>;
    options: Record<PictureFormatOptionLabelKey, string>;
  };
};
