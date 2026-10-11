import { describe, expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import type { GroupedPicture, PictureGroup } from "@sheetcraft/core/picture-group";
import { getSheetContentExtent } from "../../extent.js";

function leaf(): GroupedPicture {
  return {
    kind: "grouped-picture-v1",
    id: "leaf",
    assetId: "asset",
    altText: "Outside root layout",
    hidden: true,
    frame: {
      kind: "group-member-frame-v1",
      rect: { xRatio: 10, yRatio: 50, widthRatio: 1, heightRatio: 1 },
      angleDeg: 90,
      source: { widthRatio: 2, heightRatio: 2, offsetXRatio: 0, offsetYRatio: 0 },
    },
  };
}
function group(): PictureGroup {
  return {
    kind: "picture-group-v1",
    id: "root",
    altText: "Hidden root",
    hidden: true,
    frame: {
      kind: "group-frame-v1",
      anchor: { mode: "fixed", x: 96, y: 24, size: { width: 96, height: 24 } },
      angleDeg: 0,
    },
    members: [leaf()],
  };
}
describe("durable group content reachability", () => {
  test("hidden rotated leaf bounds outside the root layout remain reachable", () => {
    const sheet = createSheet("Synthetic", "s"),
      original = group();
    sheet.floatingImages = [original];
    const before = structuredClone(original);
    // Leaf visual crop frame reaches x1116/y1284. Its uncropped source is not the paint extent.
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 54, columnCount: 12 });
    expect(original).toEqual(before);
    original.members = [
      {
        ...leaf(),
        frame: { ...leaf().frame, rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 } },
      },
    ];
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 4, columnCount: 3 });
    sheet.floatingImages = [];
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 1, columnCount: 1 });
  });
  test("traverses hidden nested owners instead of clipping their descendants to parent boxes", () => {
    const sheet = createSheet("Nested", "s"),
      original = group();
    original.members = [
      {
        kind: "grouped-group-v1",
        id: "nested",
        altText: "Hidden subgroup",
        hidden: true,
        frame: {
          kind: "group-local-frame-v1",
          rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          angleDeg: 0,
        },
        members: [leaf()],
      },
    ];
    sheet.floatingImages = [original];
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 54, columnCount: 12 });
  });
  test("keeps a far root anchor reachable independently of its children", () => {
    const sheet = createSheet("Far root", "s"),
      original = group();
    original.frame.anchor = {
      mode: "move-only",
      origin: { column: { index: 80, offset: 0 }, row: { index: 500, offset: 0 } },
      size: { width: 96, height: 24 },
    };
    const member = leaf();
    member.frame.rect.xRatio = -80;
    member.frame.rect.yRatio = -500;
    member.frame.angleDeg = 0;
    original.members = [member];
    sheet.floatingImages = [original];
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 502, columnCount: 82 });
  });
  test("rejects hidden descendant overflow before returning an apparently safe partial extent", () => {
    const sheet = createSheet("Invalid", "s"),
      original = group();
    const member = original.members[0]!;
    if (member.kind !== "grouped-picture-v1") throw new Error("Expected fixture leaf.");
    member.frame.source.widthRatio = 1e308;
    sheet.floatingImages = [original];
    const before = structuredClone(original);
    expect(() => getSheetContentExtent(sheet)).toThrow();
    expect(original).toEqual(before);
  });
});
