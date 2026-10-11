import { expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import type { PictureDetailedStyle } from "@sheetcraft/core/picture-detailed-style";
import { collectWorkbookImageAssetIds } from "../../../modules/image-assets/useImageAssetUrls";
import { framedPicture } from "../sheet-images/framed-picture-fixture";
import { pictureGroup } from "../sheet-images/picture-group-fixture";

function style(id: string): PictureDetailedStyle {
  const paint = {
    kind: "picture" as const,
    assetId: id,
    opacity: 1,
    rotateWithShape: true,
    layout: {
      kind: "tile" as const,
      scaleX: 1,
      scaleY: 1,
      offsetXPt: 0,
      offsetYPt: 0,
      flip: "none" as const,
      anchor: "center" as const,
    },
  };
  return {
    fill: { kind: "value", value: paint },
    line: {
      kind: "value",
      value: {
        paint,
        widthPt: 1,
        compound: "single",
        dash: "solid",
        cap: "butt",
        join: "miter",
        miterLimit: 4,
      },
    },
  };
}

test("cells, legacy roots, framed roots and hidden recursive leaves retain texture/line assets", () => {
  const workbook = createWorkbook({ id: "w", sheetId: "s" });
  const sheet = getActiveSheet(workbook);
  setCellContent(
    sheet,
    { row: 0, column: 0 },
    {
      kind: "image",
      image: {
        assetId: "cell",
        altText: "",
        transform: { appearance: { detailedStyle: style("cell-texture") } },
      },
    },
  );
  const legacy: LegacyFloatingImage = {
    id: "legacy",
    assetId: "legacy-source",
    altText: "",
    anchor: { row: 0, column: 0 },
    width: 100,
    height: 100,
    offsetX: 0,
    offsetY: 0,
    transform: { appearance: { detailedStyle: style("root-texture") } },
  };
  const frame = {
    ...framedPicture(),
    transform: { appearance: { detailedStyle: style("frame-texture") } },
  };
  const group = pictureGroup();
  group.hidden = true;
  const leaf = group.members[0]!;
  if (leaf.kind !== "grouped-picture-v1") throw Error("Expected leaf");
  leaf.hidden = true;
  leaf.transform = { appearance: { detailedStyle: style("leaf-texture") } };
  sheet.floatingImages = [legacy, frame, group];
  const before = structuredClone(workbook);
  expect(collectWorkbookImageAssetIds(workbook)).toEqual(
    new Set([
      "cell",
      "cell-texture",
      "legacy-source",
      "root-texture",
      "asset",
      "frame-texture",
      "synthetic-asset",
      "leaf-texture",
    ]),
  );
  expect(workbook).toEqual(before);
});

test("the same texture used by fill, line and source is collected only once", () => {
  const workbook = createWorkbook({ id: "w", sheetId: "s" });
  setCellContent(
    getActiveSheet(workbook),
    { row: 0, column: 0 },
    {
      kind: "image",
      image: {
        assetId: "shared",
        altText: "",
        transform: { appearance: { detailedStyle: style("shared") } },
      },
    },
  );
  expect(collectWorkbookImageAssetIds(workbook)).toEqual(new Set(["shared"]));
});
