import { expect, test } from "vitest";
import {
  collectPictureGroupAssetIds,
  findPictureGroupNode,
  traversePictureGroup,
  type GroupedGroup,
} from "../../picture-group.js";
import { group, leaf } from "./fixtures.js";

test("preorder paths reflect one owner and assets include hidden/reused leaf references", () => {
  const hidden = { ...leaf("hidden"), hidden: true, assetId: "shared-asset" };
  const nested: GroupedGroup = {
    kind: "grouped-group-v1",
    id: "inner",
    altText: "Inner",
    hidden: true,
    frame: {
      kind: "group-local-frame-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
      angleDeg: 0,
    },
    members: [hidden, { ...leaf("last"), assetId: "shared-asset" }],
  };
  const first = leaf("first");
  const value = { ...group(), members: [first, nested] };
  const visits = traversePictureGroup(value);
  expect(visits.map(({ path }) => path)).toEqual([
    ["group"],
    ["group", "first"],
    ["group", "inner"],
    ["group", "inner", "hidden"],
    ["group", "inner", "last"],
  ]);
  expect(visits[0]!.parentPath).toBeNull();
  expect(visits[3]!.parentPath).toEqual(["group", "inner"]);
  expect(visits[1]!.node).toBe(first);
  expect(findPictureGroupNode(value, ["group", "inner", "hidden"])?.node).toBe(hidden);
  expect(findPictureGroupNode(value, ["group", "hidden"])).toBeUndefined();
  expect(findPictureGroupNode(value, ["other", "inner", "hidden"])).toBeUndefined();
  expect([...collectPictureGroupAssetIds(value)]).toEqual(["asset-first", "shared-asset"]);
});
