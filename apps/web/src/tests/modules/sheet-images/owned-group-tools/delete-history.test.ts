import { describe, expect, test } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  fixture,
  legacy,
  tree,
  leaf,
  requireGroup,
  geometries,
  expectSameGeometry,
  contextFor,
} from "./fixture";

describe("owned deletion tool transactions", () => {
  test("exact nested leaf deletion dissolves its singleton owner and keeps hidden world/source state", () => {
    const f = fixture([legacy("back"), tree(), legacy("front", 700)]);
    f.selectedIds.value = ["root"];
    const before = serializeWorkbook(f.session.workbook);
    const geometry = geometries(f.sheet.floatingImages, f.context);
    const inner = requireGroup(f.sheet.floatingImages[1]).members[0]!;
    if (inner.kind !== "grouped-group-v1") throw new Error("Expected nested owner.");
    const source = inner.members[1]!;
    expect(f.tools.deletePath(["root", "inner", "a"])).toBe(true);
    const root = requireGroup(f.sheet.floatingImages[1]);
    expect(root.members.map((node) => node.id)).toEqual(["b", "c"]);
    const survivor = root.members[0]!;
    expect(survivor.hidden).toBe(true);
    expect(survivor.kind).toBe("grouped-picture-v1");
    if (survivor.kind !== "grouped-picture-v1" || source.kind !== "grouped-picture-v1")
      throw new Error("Expected real leaf.");
    expect(survivor.assetId).toBe(source.assetId);
    expect(survivor.transform).toEqual(source.transform);
    expect(survivor.frame.source).toEqual(source.frame.source);
    expect(survivor.frame.flipHorizontal).toBe(true);
    expectSameGeometry(geometries(f.sheet.floatingImages, f.context), geometry, ["b", "c"], expect);
    expect(f.selectedIds.value).toEqual(["root"]);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.session.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  });

  test("recursive singleton dissolution promotes and selects the actual surviving leaf", () => {
    const value = tree();
    value.hidden = true;
    value.members = [value.members[0]!];
    const f = fixture([legacy("back"), value, legacy("front", 700)]);
    f.selectedIds.value = ["root"];
    const before = f.forest();
    const geometry = geometries(before, f.context);
    expect(f.tools.deletePath(["root", "inner", "a"])).toBe(true);
    expect(f.ids()).toEqual(["back", "b", "front"]);
    expect(f.selectedIds.value).toEqual(["b"]);
    const survivor = f.sheet.floatingImages[1]!;
    expect(isFramedPictureObject(survivor)).toBe(true);
    expect(survivor.hidden).toBe(true);
    expect(Object.hasOwn(survivor, "members")).toBe(false);
    expectSameGeometry(geometries(f.sheet.floatingImages, f.context), geometry, ["b"], expect);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.forest()).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.ids()).toEqual(["back", "b", "front"]);
  });

  test("multiple exact paths delete atomically with recursive dissolution and promoted selection", () => {
    const f = fixture([tree(), legacy("other", 700)]);
    f.selectedIds.value = ["root"];
    const before = f.forest();
    const geometry = geometries(before, f.context);
    expect(f.tools.deletePaths([["root"], ["root", "missing"]])).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(
      f.tools.deletePaths([
        ["root", "inner", "a"],
        ["root", "c"],
      ]),
    ).toBe(true);
    expect(f.ids()).toEqual(["b", "other"]);
    expect(f.selectedIds.value).toEqual(["b"]);
    expectSameGeometry(geometries(f.sheet.floatingImages, f.context), geometry, ["b"], expect);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.forest()).toEqual(before);
  });

  test("rotated root contraction preserves remaining child geometry in one command", () => {
    const root = tree();
    root.members = [leaf("a"), leaf("b", 0.5, 0.4), { ...leaf("c", 0.8, 0.7), hidden: true }];
    const f = fixture([root]);
    const geometry = geometries(f.sheet.floatingImages, f.context);
    const anchor = root.frame.anchor;
    expect(f.tools.deletePath(["root", "b"])).toBe(true);
    const after = requireGroup(f.sheet.floatingImages[0]);
    expect(after.frame.anchor).not.toEqual(anchor);
    expect(after.frame.angleDeg).toBe(root.frame.angleDeg);
    expect(after.members.map((node) => node.id)).toEqual(["a", "c"]);
    expectSameGeometry(geometries(f.sheet.floatingImages, f.context), geometry, ["a", "c"], expect);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test.each([
    ["root", "b"],
    ["root", "inner", "c"],
    ["inner", "b"],
    ["root", "missing"],
    ["root", "inner", "a", "extra"],
    [],
  ])("wrong or missing exact owner path %j rejects atomically", (...path: string[]) => {
    const f = fixture([tree(), legacy("other", 700)]);
    f.selectedIds.value = ["root"];
    const before = f.forest();
    expect(f.tools.deletePath(path)).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.selectedIds.value).toEqual(["root"]);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("root removal validates all explicit IDs and clears selection only after acceptance", () => {
    const f = fixture([legacy("back"), tree(), legacy("front", 700)]);
    f.selectedIds.value = ["root", "front"];
    const before = f.forest();
    expect(f.tools.remove(["root", "missing"])).toBe(false);
    expect(f.tools.remove(["root", "root"])).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.tools.remove()).toBe(true);
    expect(f.ids()).toEqual(["back"]);
    expect(f.selectedIds.value).toEqual([]);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.forest()).toEqual(before);
  });

  test("collapsed root can be deleted outright, while a descendant deletion remains refused", () => {
    const f = fixture([tree()]);
    const root = requireGroup(f.sheet.floatingImages[0]);
    root.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    (f.sheet.hiddenColumns ??= new Set()).add(0);
    (f.sheet.hiddenRows ??= new Set()).add(0);
    // Effective metrics are a new immutable context for the changed axes.
    f.context.metrics = contextFor(f.sheet).metrics;
    f.selectedIds.value = [root.id];
    const before = f.forest();
    expect(f.tools.deletePath(["root", "inner", "a"])).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.tools.remove()).toBe(true);
    expect(f.ids()).toEqual([]);
    expect(f.execute).toHaveBeenCalledOnce();
  });
});
