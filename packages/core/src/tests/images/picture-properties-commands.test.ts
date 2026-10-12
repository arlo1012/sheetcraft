import { expect, test } from "vitest";
import {
  applyWorkbookCommand,
  createSetFloatingImageCommand,
  createConvertFloatingImageToCellCommand,
  createConvertCellImageToFloatingCommand,
} from "../../commands/index.js";
import { getActiveSheet, getCellContent, type LegacyFloatingImage } from "../../workbook.js";
import { translateCellContentForCopy } from "../../clipboard.js";
import { groupPictureRoots, ungroupPictureRoot } from "../../picture-group-planning.js";
import { planDeletePictureGroupNodes } from "../../picture-group-delete.js";
import { isPictureGroup, findPictureGroupNode } from "../../picture-group.js";
import { getPictureProperties } from "../../picture-properties.js";
import {
  applyPictureGroupChildWorldEdit,
  leasePictureGroupNode,
} from "../../picture-group-edit.js";
import { createTestWorkbookSession } from "../helpers.js";
import { fixture as ownedFixture, resolvedNodes } from "../picture-group-edit/fixture.js";
import { fixture as planningFixture } from "../picture-group-planning/fixture.js";

const properties = { altTitle: "标题 Ω", locked: false, printObject: false } as const;
test("conversion, internal copy and exact command inverse preserve object properties", () => {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  const image: LegacyFloatingImage = {
    id: "picture",
    assetId: "synthetic",
    altText: "Description",
    anchor: { row: 3, column: 2 },
    offsetX: 12,
    offsetY: 8,
    width: 160,
    height: 90,
    ...properties,
  };
  const insertInverse = applyWorkbookCommand(
    session.workbook,
    createSetFloatingImageCommand(sheet.id, image),
  );
  const cellInverse = applyWorkbookCommand(
    session.workbook,
    createConvertFloatingImageToCellCommand(sheet.id, image.id),
  );
  const content = getCellContent(sheet, image.anchor)!;
  expect(content).toMatchObject({ kind: "image", image: properties });
  expect(translateCellContentForCopy(content, image.anchor, { row: 4, column: 2 })).toEqual(
    content,
  );
  const floatInverse = applyWorkbookCommand(
    session.workbook,
    createConvertCellImageToFloatingCommand(sheet.id, image.anchor, "again", {
      width: 100,
      height: 80,
    }),
  );
  expect(sheet.floatingImages[0]).toMatchObject(properties);
  applyWorkbookCommand(session.workbook, floatInverse!);
  expect(getCellContent(sheet, image.anchor)).toEqual(content);
  applyWorkbookCommand(session.workbook, cellInverse!);
  expect(sheet.floatingImages).toEqual([image]);
  applyWorkbookCommand(session.workbook, insertInverse!);
  expect(sheet.floatingImages).toEqual([]);
});
test("grouping keeps leaf titles; ungrouping inherits the effective root behaviors", () => {
  const f = planningFixture();
  Object.assign(f.sheet.floatingImages[0]!, properties);
  const roots = groupPictureRoots(
    f.sheet.floatingImages,
    ["a", "b"],
    { id: "g", altText: "Group" },
    f.metrics,
  );
  const group = roots.find(isPictureGroup)!;
  expect(findPictureGroupNode(group, ["g", "a"])?.node.altTitle).toBe(properties.altTitle);
  // Locked/Print are controlled by the group, even when a descendant retains an old own value.
  const releasedDefaults = ungroupPictureRoot(roots, "g", f.metrics);
  expect(getPictureProperties(releasedDefaults.find((p) => p.id === "a")!)).toEqual({
    altTitle: properties.altTitle,
    locked: true,
    printObject: true,
  });
  Object.assign(group, { locked: false, printObject: false });
  const released = ungroupPictureRoot(roots, "g", f.metrics);
  expect(
    released
      .filter((p) => p.id !== "middle")
      .every((p) => p.locked === false && p.printObject === false),
  ).toBe(true);
});
test("nested release and recursive singleton collapse carry root behavior without losing local titles", () => {
  const f = ownedFixture();
  Object.assign(f.root, { locked: false, printObject: false });
  Object.assign(f.picture, { altTitle: properties.altTitle });
  const released = ungroupPictureRoot([f.root], "root", f.metrics);
  const inner = released.find(isPictureGroup)!;
  expect(inner).toMatchObject({ locked: false, printObject: false });
  const leaves = ungroupPictureRoot(released, "inner", f.metrics);
  expect(leaves.find((p) => p.id === "picture")).toMatchObject(properties);
  const collapsed = planDeletePictureGroupNodes(
    [f.root],
    [
      ["root", "root-sibling"],
      ["root", "inner", "inner-sibling"],
    ],
    f.metrics,
  );
  expect(collapsed).toHaveLength(1);
  expect(collapsed[0]).toMatchObject(properties);
});
test("metadata edits can explicitly restore defaults and preserve all other child data", () => {
  const f = ownedFixture();
  Object.assign(f.picture, properties);
  const next = applyPictureGroupChildWorldEdit(
    f.root,
    leasePictureGroupNode(f.root, f.path),
    resolvedNodes(f.root, f.metrics).picture.layout!,
    f.metrics,
    { metadata: { altTitle: "", locked: true, printObject: true } },
  );
  const child = findPictureGroupNode(next, f.path)!.node;
  expect(getPictureProperties(child)).toEqual({ altTitle: "", locked: true, printObject: true });
  expect(child).not.toHaveProperty("locked");
  expect(child).not.toHaveProperty("printObject");
  expect(child).toMatchObject({
    assetId: "shared-asset",
    hidden: true,
    altText: f.picture.altText,
  });
  expect(f.picture).toMatchObject(properties);
});
