import { describe, expect, test } from "vitest";
import { ref } from "vue";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { usePictureTools } from "../../../../modules/sheet-images/usePictureTools";
import { fixture, legacy, framed, geometries, requireGroup } from "./fixture";

function expectGeometry(
  actual: ReturnType<typeof geometries>,
  expected: ReturnType<typeof geometries>,
  ids: string[],
) {
  for (const id of ids) {
    expect(actual.get(id)?.angleDeg).toBeCloseTo(expected.get(id)!.angleDeg, 10);
    for (const key of ["x", "y", "width", "height"] as const)
      expect(actual.get(id)?.rect[key]).toBeCloseTo(expected.get(id)!.rect[key], 8);
  }
}
describe("owned group tool transactions", () => {
  test("groups exact legacy/framed roots without expanding flat groupId membership, then undo/redo", () => {
    const a = { ...legacy("a"), groupId: "old-flat" };
    const gap = { ...legacy("gap", 120), groupId: "old-flat" };
    const f = fixture([legacy("back"), a, gap, framed("b"), legacy("front", 400)]);
    f.selectedIds.value = ["b", "a"];
    const before = serializeWorkbook(f.session.workbook);
    const original = geometries(f.sheet.floatingImages, f.context);
    expect(f.tools.group()).toBe(true);
    const grouped = requireGroup(f.sheet.floatingImages[2]);
    expect(f.ids()).toEqual(["back", "gap", grouped.id, "front"]);
    expect(grouped.members.map((node) => node.id)).toEqual(["a", "b"]);
    expect(grouped.lockAspectRatio).toBe(false);
    expect(Object.hasOwn(grouped, "assetId")).toBe(false);
    expect(Object.hasOwn(grouped, "groupId")).toBe(false);
    expect(f.selectedIds.value).toEqual([grouped.id]);
    expectGeometry(geometries(f.sheet.floatingImages, f.context), original, ["a", "b", "gap"]);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.execute.mock.calls[0]![0].type).toBe("setSheetFloatingImages");
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.session.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  });

  test("explicit context creates an owned group from pure legacy roots using captured IDs", () => {
    const f = fixture([legacy("a"), legacy("b", 130), legacy("c", 300)]);
    f.selectedIds.value = ["c"];
    expect(f.tools.group(false, ["a", "b"])).toBe(true);
    const owned = requireGroup(f.sheet.floatingImages[0]);
    expect(owned.members.map((node) => node.id)).toEqual(["a", "b"]);
    expect(f.ids()).toEqual([owned.id, "c"]);
    expect(f.selectedIds.value).toEqual([owned.id]);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test("contextual flat ungroup retains standalone semantics and rejects mixed owned/flat targets", () => {
    const f = fixture([
      { ...legacy("a"), groupId: "flat" },
      { ...legacy("b", 130), groupId: "flat" },
      legacy("c", 300),
      legacy("d", 450),
    ]);
    f.owned(["c", "d"], "owned");
    f.selectedIds.value = ["a", "owned"];
    const before = f.forest();
    expect(f.tools.group(true)).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
    f.selectedIds.value = ["a"];
    expect(f.tools.group(true)).toBe(true);
    expect(
      f.sheet.floatingImages
        .slice(0, 2)
        .every((root) => !isPictureGroup(root) && root.groupId === undefined),
    ).toBe(true);
    expect(f.sheet.floatingImages[2]).toEqual(before[2]);
    expect(f.selectedIds.value).toEqual(["a"]);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.forest()).toEqual(before);
  });

  test("nested grouping and one-level ungrouping select real promoted roots and keep world geometry", () => {
    const f = fixture();
    const inner = f.owned(["a", "b"], "inner");
    const before = serializeWorkbook(f.session.workbook);
    const original = geometries(f.sheet.floatingImages, f.context);
    f.selectedIds.value = [inner.id, "c"];
    expect(f.tools.group()).toBe(true);
    const outer = requireGroup(f.sheet.floatingImages[0]);
    expect(outer.members[0]?.kind).toBe("grouped-group-v1");
    expectGeometry(geometries(f.sheet.floatingImages, f.context), original, [
      "inner",
      "a",
      "b",
      "c",
    ]);
    expect(f.tools.group(true)).toBe(true);
    expect(f.selectedIds.value).toEqual(["inner", "c"]);
    expect(isPictureGroup(f.sheet.floatingImages[0]!)).toBe(true);
    expectGeometry(geometries(f.sheet.floatingImages, f.context), original, [
      "inner",
      "a",
      "b",
      "c",
    ]);
    f.selectedIds.value = ["inner"];
    expect(f.tools.group(true)).toBe(true);
    expect(f.selectedIds.value).toEqual(["a", "b"]);
    expect(f.ids()).toEqual(["a", "b", "c"]);
    expect(isFramedPictureObject(f.sheet.floatingImages[0]!)).toBe(true);
    expectGeometry(geometries(f.sheet.floatingImages, f.context), original, ["a", "b", "c"]);
    expect(f.session.history.undoStack).toHaveLength(3);
    const after = serializeWorkbook(f.session.workbook);
    for (let n = 0; n < 3; n++) expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    for (let n = 0; n < 3; n++) expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  });

  test("ungroups multiple owned root groups in one reversible command and stacking order", () => {
    const f = fixture([
      legacy("a"),
      framed("b"),
      legacy("gap", 330),
      legacy("c", 400),
      framed("d"),
    ]);
    f.owned(["a", "b"], "first");
    f.owned(["c", "d"], "last");
    f.selectedIds.value = ["last", "first"];
    const before = serializeWorkbook(f.session.workbook);
    expect(f.tools.group(true)).toBe(true);
    expect(f.ids()).toEqual(["a", "b", "gap", "c", "d"]);
    expect(f.selectedIds.value).toEqual(["a", "b", "c", "d"]);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("group numeric size and aspect lock are real transactions; source-only appearance/batch stay refused", () => {
    const f = fixture();
    const root = f.owned();
    const before = f.forest();
    expect(f.tools.setAspectRatio(root, true)).toBe(true);
    expect(f.sheet.floatingImages[0]).toEqual({ ...before[0], lockAspectRatio: true });
    const locked = requireGroup(f.sheet.floatingImages[0]);
    const lockedSnapshot = serializeWorkbook(f.session.workbook);
    const originalLayout = resolvePictureGroup(locked, f.context.metrics).layout;
    expect(f.tools.resizeOne(locked, { axis: "width", value: 250 })).toBe(true);
    const layout = resolvePictureGroup(
      requireGroup(f.sheet.floatingImages[0]),
      f.context.metrics,
    ).layout;
    expect(layout.rect.width).toBeCloseTo(250, 10);
    expect(layout.rect.height).toBeCloseTo(
      (originalLayout.rect.height * 250) / originalLayout.rect.width,
      10,
    );
    const resizedSnapshot = serializeWorkbook(f.session.workbook);
    expect(f.tools.applyAppearance({ opacity: 0.5 })).toBe(false);
    expect(f.tools.resizeMany({ width: 250, height: 80, locked: true, all: false })).toBe(false);
    expect(f.selectedIds.value).toEqual([root.id]);
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.session.history.undoStack).toHaveLength(2);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(lockedSnapshot);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.forest()).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(requireGroup(f.sheet.floatingImages[0]).lockAspectRatio).toBe(true);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(resizedSnapshot);
  });

  test("no-context callers retain safe legacy flat grouping and refuse owned trees", () => {
    const f = fixture([
      { ...legacy("a"), groupId: "old" },
      { ...legacy("b", 130), groupId: "old" },
      legacy("c", 300),
    ]);
    const selectedIds = ref(["b", "c"]);
    const tools = usePictureTools({
      getSheet: () => f.sheet,
      selectedIds,
      isBusy: () => false,
      execute: f.execute,
    });
    expect(tools.group()).toBe(true);
    const first = f.sheet.floatingImages[0]!;
    if (isPictureGroup(first)) throw new Error("Expected legacy flat compatibility.");
    expect(first.groupId).toBeTruthy();
    expect(
      f.sheet.floatingImages.every(
        (image) => !isPictureGroup(image) && image.groupId === first.groupId,
      ),
    ).toBe(true);
    expect(selectedIds.value).toEqual(["b", "c"]);
    selectedIds.value = ["a"];
    expect(tools.group(true)).toBe(true);
    f.owned(["a", "b"], "owned");
    selectedIds.value = ["owned"];
    const before = f.forest();
    expect(tools.group(true)).toBe(false);
    expect(tools.deletePath(["owned", "a"])).toBe(false);
    expect(tools.setAspectRatio(requireGroup(f.sheet.floatingImages[0]), true)).toBe(false);
    expect(tools.updateMany([{ ...requireGroup(f.sheet.floatingImages[0]), altText: "new" }])).toBe(
      false,
    );
    expect(f.forest()).toEqual(before);
    expect(selectedIds.value).toEqual(["owned"]);
    expect(f.execute).toHaveBeenCalledTimes(2);
  });
});
