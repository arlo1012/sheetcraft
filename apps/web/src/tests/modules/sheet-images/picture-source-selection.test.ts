import { expect, test, vi } from "vitest";
import {
  capturePictureSourceSelection,
  isPictureSourceSelectionCurrent,
  mapPictureSourceAssets,
} from "../../../modules/sheet-images/picture-source-selection";
import { fixture as sourcesFixture } from "./useSheetImageActions/replacement-fixture";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";

test("all-source selection traverses real leaves and preserves hidden resources without fabricating a group source", () => {
  const f = sourcesFixture();
  f.currentGroup().hidden = true;
  const scope = capturePictureSourceSelection(f.sheet.floatingImages, [], null, true);
  expect(scope.sources.map(({ node }) => node.id)).toEqual([
    "framed",
    f.leafPath[1],
    "sibling",
    "legacy",
  ]);
  expect(scope.sources.some(({ node }) => node.id === f.leafPath[0])).toBe(false);
  expect(scope.sources.every(({ node }) => typeof node.assetId === "string")).toBe(true);
  f.scope.stop();
});
test("selected owned leaf asset changes preserve its owner and sibling even when they share source bytes", () => {
  const f = sourcesFixture();
  const scope = capturePictureSourceSelection(f.sheet.floatingImages, [f.leafPath[0]!], f.leafPath);
  f.currentLeaf().altTitle = "Latest user title";
  f.currentGroup().frame.angleDeg = 37;
  expect(isPictureSourceSelectionCurrent(scope, f.sheet.floatingImages)).toBe(true);
  const before = serializeWorkbook(f.session.workbook);
  const next = mapPictureSourceAssets(scope, f.sheet.floatingImages, new Map([["old", "smaller"]]));
  const root = next.find((root) => root.id === f.leafPath[0])!;
  if (!isPictureGroup(root)) throw Error("Bad fixture");
  expect(root.members[0]).toMatchObject({ assetId: "smaller", altTitle: "Latest user title" });
  expect(root.members[1]).toMatchObject({ assetId: "old" });
  expect(root.frame.angleDeg).toBe(37);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(
    executeWorkbookCommand(f.session, createSetSheetFloatingImagesCommand(f.sheet.id, next)),
  ).toBe(true);
  const after = serializeWorkbook(f.session.workbook);
  undoWorkbookCommand(f.session);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  redoWorkbookCommand(f.session);
  expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  f.scope.stop();
});
test.each(["source", "reorder", "owner", "kind"] as const)(
  "%s changes cannot retarget an old source selection",
  (change) => {
    const f = sourcesFixture(),
      scope = capturePictureSourceSelection(f.sheet.floatingImages, [f.leafPath[0]!], f.leafPath);
    if (change === "source") f.currentLeaf().assetId = "later";
    if (change === "reorder") f.currentGroup().members.reverse();
    if (change === "owner") f.currentGroup().id = "other-owner";
    if (change === "kind")
      f.sheet.floatingImages = f.sheet.floatingImages.filter((root) => root.id !== f.leafPath[0]);
    expect(isPictureSourceSelectionCurrent(scope, f.sheet.floatingImages)).toBe(false);
    expect(() =>
      mapPictureSourceAssets(scope, f.sheet.floatingImages, new Map([["old", "small"]])),
    ).toThrow();
    f.scope.stop();
  },
);
test("missing, duplicate and accessor root selections reject before evaluating user code", () => {
  const f = sourcesFixture();
  for (const ids of [[], ["missing"], ["framed", "framed"]])
    expect(() => capturePictureSourceSelection(f.sheet.floatingImages, ids)).toThrow();
  const getter = vi.fn(() => "framed"),
    ids = ["framed"];
  Object.defineProperty(ids, "0", { get: getter });
  expect(() => capturePictureSourceSelection(f.sheet.floatingImages, ids)).toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(() =>
    capturePictureSourceSelection(f.sheet.floatingImages, ["framed"], f.leafPath),
  ).toThrow();
  f.scope.stop();
});
