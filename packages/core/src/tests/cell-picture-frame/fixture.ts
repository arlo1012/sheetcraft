import type { FramedCellImage } from "../../cell-picture-frame.js";

export function framedCellImage(): FramedCellImage {
  return {
    assetId: "asset",
    altText: "Synthetic",
    frame: {
      kind: "cell-picture-frame-v1",
      size: { width: 360.125, height: 240.875 },
      source: { widthRatio: 1.5, heightRatio: 2, offsetXRatio: -0.25, offsetYRatio: 0.1 },
      angleDeg: 37.125,
      flipHorizontal: true,
      cropShape: { preset: "ellipse" },
    },
    lockAspectRatio: false,
    transform: {
      appearance: { brightness: 0.1 },
      annotations: [{ kind: "pen", color: "#FF0000", width: 0.01, points: [{ x: 0.2, y: 0.3 }] }],
    },
  };
}
