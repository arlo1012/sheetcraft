import { expect, test } from "vitest";
import type { PictureDetailedStyle, PicturePaint } from "../../picture-detailed-style.js";
import { collectPictureGroupAssetIds, type GroupedGroup } from "../../picture-group.js";
import { group, leaf } from "./fixtures.js";

function paint(assetId: string): PicturePaint {
  return {
    kind: "picture",
    assetId,
    opacity: 1,
    rotateWithShape: true,
    layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
  };
}
function style(fillId: string, lineId: string): PictureDetailedStyle {
  return {
    fill: { kind: "value", value: paint(fillId) },
    line: {
      kind: "value",
      value: {
        paint: paint(lineId),
        widthPt: 2,
        compound: "single",
        dash: "solid",
        cap: "butt",
        join: "miter",
        miterLimit: 4,
      },
    },
  };
}

test("hidden nested leaves retain both fill and outline assets with source deduplication", () => {
  const first = {
    ...leaf("first"),
    transform: { appearance: { detailedStyle: style("texture", "line") } },
  };
  const hidden = {
    ...leaf("hidden"),
    hidden: true,
    transform: { appearance: { detailedStyle: style("asset-first", "texture") } },
  };
  const nested: GroupedGroup = {
    kind: "grouped-group-v1",
    id: "inner",
    altText: "",
    hidden: true,
    frame: {
      kind: "group-local-frame-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
      angleDeg: 0,
    },
    members: [hidden],
  };
  const root = { ...group(), members: [first, nested] };
  const saved = JSON.stringify(root);
  expect([...collectPictureGroupAssetIds(root)]).toEqual([
    "asset-first",
    "texture",
    "line",
    "asset-hidden",
  ]);
  expect(JSON.stringify(root)).toBe(saved);
});

test("none and non-image paint categories do not contribute assets", () => {
  const child = {
    ...leaf(),
    transform: {
      appearance: {
        detailedStyle: { fill: { kind: "none" as const }, line: { kind: "none" as const } },
      },
    },
  };
  expect([...collectPictureGroupAssetIds({ ...group(), members: [child] })]).toEqual([
    "asset-leaf",
  ]);
});
