import { webcrypto } from "node:crypto";
import { vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import type { PictureGroup } from "@sheetcraft/core/picture-group";
import type { PictureFrameAnchor } from "@sheetcraft/core/picture-frame";
import { pictureGroup } from "../sheet-images/picture-group-fixture";
import { framedPicture } from "../sheet-images/framed-picture-fixture";

export function groupJsonFixture(anchor?: PictureFrameAnchor) {
  const workbook = createWorkbook({ id: "group-json", sheetId: "sheet" });
  const group = pictureGroup();
  if (anchor) group.frame.anchor = anchor;
  group.hidden = anchor?.mode !== "fixed";
  group.altTitle = "Owner title";
  group.locked = true;
  group.printObject = false;
  const leaf = group.members[0]!;
  if (leaf.kind !== "grouped-picture-v1") throw Error("fixture");
  leaf.hidden = true;
  leaf.altTitle = "Child title";
  leaf.lockAspectRatio = false;
  leaf.frame.rect = { xRatio: -0.2, yRatio: 0.1, widthRatio: 0.7, heightRatio: 1.2 };
  leaf.frame.cropShape = { preset: "ellipse" };
  leaf.frame.flipHorizontal = true;
  leaf.frame.flipVertical = true;
  leaf.frame.source = { offsetXRatio: -0.1, offsetYRatio: -0.2, widthRatio: 1.2, heightRatio: 1.4 };
  const paint = {
    kind: "picture" as const,
    assetId: "paint",
    opacity: 0.7,
    rotateWithShape: true,
    layout: {
      kind: "stretch" as const,
      offsetXRatio: 0,
      offsetYRatio: 0,
      widthRatio: 1,
      heightRatio: 1,
    },
  };
  leaf.transform = {
    annotations: [
      {
        kind: "pen",
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.8, y: 0.9 },
        ],
        color: "#aabbcc",
        width: 0.01,
      },
    ],
    appearance: {
      suppressThemeEffects: { shadow: true },
      detailedStyle: {
        fill: { kind: "value", value: paint },
        line: {
          kind: "value",
          value: {
            paint: { ...paint, assetId: "line" },
            widthPt: 1,
            compound: "single",
            dash: "solid",
            cap: "butt",
            join: "miter",
            miterLimit: 4,
          },
        },
      },
    },
  };
  group.members = [
    {
      kind: "grouped-group-v1",
      id: "nested",
      altText: "nested",
      frame: {
        kind: "group-local-frame-v1",
        rect: { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.8, heightRatio: 0.6 },
        angleDeg: -12,
      },
      members: [leaf],
    },
    { ...structuredClone(leaf), id: "sibling", hidden: false },
  ];
  getActiveSheet(workbook).floatingImages = [
    group,
    framedPicture(),
    {
      id: "legacy",
      assetId: "asset",
      altText: "legacy",
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 80,
      height: 40,
    },
  ];
  return { workbook, group };
}

export function groupAtDepth(depth: number): PictureGroup {
  const group = pictureGroup();
  let child = group.members[0]!;
  for (let index = 1; index < depth; index++)
    child = {
      kind: "grouped-group-v1",
      id: `nested-${index}`,
      altText: "nested",
      frame: {
        kind: "group-local-frame-v1",
        rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
        angleDeg: 0,
      },
      members: [child],
    };
  group.members = [child];
  return group;
}

export function setupGroupJsonBrowser() {
  const blobs: Blob[] = [];
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:group-json";
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 1;
      naturalHeight = 1;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  return { blobs, click };
}
