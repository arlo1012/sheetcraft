import type { MessageKey } from "../../shared/i18n";
import { ImageAssetError } from "./imageAssetValidation";
export function imageAssetFeedback(error: unknown): MessageKey | undefined {
  if (!(error instanceof ImageAssetError)) return;
  return (
    {
      "unsupported-type": "image.invalidType",
      "too-large": "image.tooLarge",
      "pixel-limit": "image.tooManyPixels",
      "invalid-image": "image.invalidFile",
      "decode-failed": "image.decodeFailed",
    } as const
  )[error.code];
}
