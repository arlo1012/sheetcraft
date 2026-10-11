// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createSheet, type LegacyFloatingImage } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  hitPictureViewportPoint,
  pictureFragmentRootId,
} from "../../../modules/sheet-images/picture-hit-testing";
import { getPictureViewportFragments } from "../../../modules/sheet-images/picture-viewport-fragments";
import { pictureGroup } from "./picture-group-fixture";
import { framedPicture } from "./framed-picture-fixture";
function view() {
  const sheet = createSheet("Synthetic", "s");
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 20 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 0, columns: 0 },
    bodyScrollPosition: { x: 0, y: 0 },
    viewportSize: { width: 600, height: 400 },
  });
  return { layout, metrics: createPictureViewMetrics(sheet, geometry, rows) };
}
describe("source-bearing global picture hit ordering", () => {
  test("standalone and group leaves obey one interleaved root z-order", () => {
    const context = view(),
      owned = pictureGroup();
    owned.frame.angleDeg = 0;
    owned.members[0]!.frame.angleDeg = 0;
    const old: LegacyFloatingImage = {
      id: "old",
      assetId: "old-asset",
      altText: "Synthetic",
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 400,
      height: 300,
    };
    const front = hitPictureViewportPoint([owned, old], { x: 80, y: 50 }, context.layout, context)!;
    expect(front.kind).toBe("legacy");
    expect(pictureFragmentRootId(front)).toBe(old.id);
    const ownedFront = hitPictureViewportPoint(
      [old, owned],
      { x: 80, y: 50 },
      context.layout,
      context,
    )!;
    expect(ownedFront.kind).toBe("group-leaf");
    expect(pictureFragmentRootId(ownedFront)).toBe(owned.id);
    expect(ownedFront.kind === "group-leaf" && ownedFront.path).toEqual([owned.id, "owned-leaf"]);
  });
  test("rotated AABB corners and source-free container gaps never steal hits", () => {
    const context = view(),
      frame = framedPicture();
    const fragment = getPictureViewportFragments([frame], context.layout, context)[0]!;
    if (fragment.kind !== "framed") throw new Error("Expected frame.");
    expect(
      hitPictureViewportPoint(
        [frame],
        { x: fragment.geometry.bounds.x + 0.5, y: fragment.geometry.bounds.y + 0.5 },
        context.layout,
        context,
      ),
    ).toBeNull();
    const owned = pictureGroup();
    owned.frame.angleDeg = 0;
    owned.members[0]!.frame.angleDeg = 0;
    owned.members[0]!.frame.rect.widthRatio = 0.3;
    owned.members[0]!.frame.rect.heightRatio = 0.3;
    expect(hitPictureViewportPoint([owned], { x: 140, y: 75 }, context.layout, context)).toBeNull();
  });
  test("genuine member outside its owner box is still hit while ancestor hidden removes all hits", () => {
    const context = view(),
      owned = pictureGroup();
    owned.frame.angleDeg = 0;
    owned.members[0]!.frame.angleDeg = 0;
    owned.members[0]!.frame.rect.xRatio = 1.5;
    expect(hitPictureViewportPoint([owned], { x: 280, y: 50 }, context.layout, context)?.kind).toBe(
      "group-leaf",
    );
    owned.hidden = true;
    expect(hitPictureViewportPoint([owned], { x: 280, y: 50 }, context.layout, context)).toBeNull();
  });
  test("nonfinite input and invalid hidden ownership reject before a false successful selection", () => {
    const context = view(),
      owned = pictureGroup();
    expect(() =>
      hitPictureViewportPoint([owned], { x: NaN, y: 1 }, context.layout, context),
    ).toThrow();
    owned.hidden = true;
    owned.members.push(owned.members[0]!);
    expect(() =>
      hitPictureViewportPoint([owned], { x: 1, y: 1 }, context.layout, context),
    ).toThrow();
  });
});
