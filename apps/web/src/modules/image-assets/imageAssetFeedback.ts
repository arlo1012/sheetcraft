import type { MessageKey } from "../../shared/i18n";
import { ImageAssetError } from "./imageAssetValidation";
import { BmpImageSourceError } from "./inspectBmpImageHeader";
import { SvgImageSourceError } from "./inspectSvgImageSource";
export function imageAssetFeedback(error: unknown): MessageKey | undefined {
  if (!(error instanceof ImageAssetError)) return;
  if (error instanceof BmpImageSourceError)
    return error.reason === "external-profile" ? "image.svgUnsafe" : "image.bmpUnsupported";
  if (error instanceof SvgImageSourceError) {
    if (error.reason === "unsafe-content" || error.reason === "external-resource")
      return "image.svgUnsafe";
    if (error.reason === "unsupported-feature") return "image.svgUnsupported";
    if (error.reason === "complexity-limit") return "image.svgComplexity";
  }
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
