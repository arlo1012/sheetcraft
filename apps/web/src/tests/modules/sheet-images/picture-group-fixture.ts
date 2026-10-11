import type { PictureGroup } from "@sheetcraft/core/picture-group";

/** Isolated source-bearing leaf in a source-free owned container. */
export function pictureGroup(): PictureGroup {
  return {
    kind: "picture-group-v1",
    id: "owned-group",
    altText: "Synthetic group",
    frame: {
      kind: "group-frame-v1",
      anchor: { mode: "fixed", x: 40, y: 10, size: { width: 120, height: 80 } },
      angleDeg: 37,
    },
    members: [
      {
        kind: "grouped-picture-v1",
        id: "owned-leaf",
        assetId: "synthetic-asset",
        altText: "Synthetic leaf",
        frame: {
          kind: "group-member-frame-v1",
          rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          angleDeg: 37,
          source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
        },
      },
    ],
  };
}
