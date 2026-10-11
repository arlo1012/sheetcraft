import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
export function framedPicture(): FramedFloatingImage {
  return {
    id: "framed",
    assetId: "asset",
    altText: "Synthetic",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 194, y: 74, size: { width: 120, height: 80 } },
      angleDeg: 37,
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
    },
  };
}
