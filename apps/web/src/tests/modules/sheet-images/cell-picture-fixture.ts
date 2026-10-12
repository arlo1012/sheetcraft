import type { FramedCellImage } from "@sheetcraft/core/cell-picture-frame";

export function framedCellPicture(): FramedCellImage {
  return {
    assetId: "cell-source",
    altText: "Cell diagram",
    altTitle: "Source diagram",
    locked: false,
    printObject: false,
    lockAspectRatio: false,
    frame: {
      kind: "cell-picture-frame-v1",
      size: { width: 200, height: 100 },
      source: { widthRatio: 0.5, heightRatio: 0.5, offsetXRatio: 0.2, offsetYRatio: 0.1 },
      angleDeg: 37,
      flipHorizontal: true,
    },
    transform: {
      appearance: { opacity: 0.6 },
      annotations: [
        {
          kind: "text",
          points: [{ x: 0.5, y: 0.5 }],
          color: "#FF0000",
          width: 0.01,
          text: "Mark",
          fontSize: 0.05,
        },
      ],
    },
  };
}
