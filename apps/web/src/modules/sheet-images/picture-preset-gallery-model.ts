import type { PictureDetailedStyle } from "@sheetcraft/core/picture-detailed-style";
import type { PictureFormatLabelKey } from "./picture-format-pane-model";
export type PicturePresetGalleryItem = Readonly<{
  id: string;
  labelKey: PictureFormatLabelKey;
  ordinal?: number;
  unitKey?: PictureFormatLabelKey;
  previewStyle: PictureDetailedStyle;
}>;
export type PicturePresetGalleryGroup = Readonly<{
  labelKey: PictureFormatLabelKey;
  items: readonly PicturePresetGalleryItem[];
}>;
