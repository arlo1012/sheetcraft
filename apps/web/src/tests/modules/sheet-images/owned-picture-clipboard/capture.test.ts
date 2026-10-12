import { describe, expect, test } from "vitest";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { isPictureGroup, type GroupedGroup } from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { OwnedPictureClipboardError } from "../../../../modules/sheet-images/owned-picture-clipboard";
import { fixture } from "./fixture";

describe("owned picture clipboard capture", () => {
  test("captures detached complete trees, source forest and effective owner metrics", () => {
    const f = fixture();
    const before = structuredClone(f.sheet.floatingImages);
    const captured = f.capture("copy");
    expect(captured.sourceForest).toEqual(before);
    expect(captured.roots).toEqual([before[1]]);
    expect(captured.sourceMetrics).toBe(f.metrics);
    expect(captured.sourceSheetId).toBe("source-sheet");
    expect(captured.sourceRevision).toBe(7);
    expect(captured.ownerGeneration).toBe(3);
    expect(captured.sourceMetrics.rows.visiblePrefix(1)).toBe(51);
    expect(createPictureSheetMetrics(f.sheet).rows.visiblePrefix(1)).not.toBe(51);
    const live = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(live)) throw new Error("Expected group.");
    live.members.reverse();
    live.members[0]!.altText = "Changed";
    const exposed = captured.roots[0]!;
    if (!isPictureGroup(exposed)) throw new Error("Expected group.");
    exposed.members.length = 0;
    expect(f.clipboard.getCurrent()!.roots).toEqual([before[1]]);
    expect(f.clipboard.getCurrent()!.sourceForest).toEqual(before);
  });

  test("extracting owned content preserves its title and inherits root locking/printing", () => {
    const f = fixture(),
      root = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(root)) throw Error("Bad fixture");
    const nested = root.members[1]! as GroupedGroup,
      leaf = nested.members[0]!;
    Object.assign(leaf, { altTitle: "叶标题", locked: false, printObject: false });
    const defaultCopy = f.capture("copy", ["nested-leaf"]).roots[0]!;
    expect(defaultCopy.altTitle).toBe("叶标题");
    expect(defaultCopy.locked).toBeUndefined();
    expect(defaultCopy.printObject).toBeUndefined();
    Object.assign(root, { locked: false, printObject: false });
    const unlocked = f.capture("copy", ["nested-group"]).roots[0]!;
    expect(unlocked).toMatchObject({ locked: false, printObject: false });
    expect(f.capture("copy", ["nested-leaf"]).roots[0]).toMatchObject({
      altTitle: "叶标题",
      locked: false,
      printObject: false,
    });
    expect(f.sheet.floatingImages[1]).toBe(root);
  });

  test("deduplicates validated ancestors and descendants and keeps forest stacking order", () => {
    const f = fixture();
    const current = f.capture("copy", [
      "legacy",
      "nested-leaf",
      "owned-group",
      "framed",
      "owned-group",
    ]);
    expect(current.roots.map((root) => root.id)).toEqual(["framed", "owned-group", "legacy"]);
    expect(current.selectedPaths).toEqual([["framed"], ["owned-group"], ["legacy"]]);
  });

  test.each(["copy", "cut"] as const)(
    "%s validates exact paths before ancestor dedup; invalid capture retains prior clipboard",
    (mode) => {
      const f = fixture();
      const original = f.capture(mode);
      expect(() =>
        f.clipboard.capture({
          sheet: f.sheet,
          revision: 7,
          ownerGeneration: 3,
          sourceMetrics: f.metrics,
          mode,
          selectedPaths: [["owned-group"], ["owned-group", "nested-leaf"]],
        }),
      ).toThrow(new OwnedPictureClipboardError("invalid-selection"));
      expect(f.clipboard.getCurrent()!.token).toBe(original.token);
      expect(() => f.capture(mode, ["missing"])).toThrow(OwnedPictureClipboardError);
      const sparse = ["owned-group", "nested-group", "nested-leaf"];
      delete sparse[0];
      expect(() =>
        f.clipboard.capture({
          sheet: f.sheet,
          revision: 7,
          ownerGeneration: 3,
          sourceMetrics: f.metrics,
          mode,
          selectedPaths: [sparse],
        }),
      ).toThrow(new OwnedPictureClipboardError("invalid-selection"));
      expect(f.clipboard.getCurrent()).toEqual(original);
    },
  );

  test("copies a member leaf as a real framed root with full source state and inherited visibility", () => {
    const f = fixture();
    const source = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(source)) throw new Error("Expected group.");
    const resolved = resolvePictureGroup(source, f.metrics).members[1]!;
    if (!("members" in resolved)) throw new Error("Expected nested group.");
    const leafWorld = resolved.members[0]!.layout!;
    const captured = f.capture("copy", ["nested-leaf"]);
    const root = captured.roots[0]!;
    expect(captured.roots).toHaveLength(1);
    expect(captured.selectedPaths).toEqual([["owned-group", "nested-group", "nested-leaf"]]);
    expect(isFramedPictureObject(root)).toBe(true);
    if (!isFramedPictureObject(root)) throw new Error("Expected framed leaf.");
    expect(root.id).toBe("nested-leaf");
    expect(root.assetId).toBe("synthetic-asset");
    expect(root.hidden).toBe(true);
    expect(root.lockAspectRatio).toBe(true);
    expect(root.frame.source).toEqual({
      widthRatio: 1.5,
      heightRatio: 2,
      offsetXRatio: -0.1,
      offsetYRatio: 0.2,
    });
    expect(root.frame.flipHorizontal).toBe(true);
    expect(root.frame.flipVertical).toBe(true);
    expect(root.transform).toEqual({ appearance: { opacity: 0.65 } });
    const world = resolvePictureFrame(root.frame, f.metrics);
    expect(world.rect.x).toBeCloseTo(leafWorld.rect.x, 10);
    expect(world.rect.y).toBeCloseTo(leafWorld.rect.y, 10);
    expect(world.rect.width).toBeCloseTo(leafWorld.rect.width, 10);
    expect(world.rect.height).toBeCloseTo(leafWorld.rect.height, 10);
    expect(world.angleDeg).toBe(leafWorld.angleDeg);
  });

  test("copies a nested subgroup as a source-free root with complete ordered children", () => {
    const f = fixture();
    const group = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(group)) throw new Error("Expected group.");
    group.hidden = true;
    const nested = group.members[1]! as GroupedGroup;
    const current = f.capture("copy", ["nested-leaf", "nested-group"]);
    const extracted = current.roots[0]!;
    expect(current.roots).toHaveLength(1);
    expect(isPictureGroup(extracted)).toBe(true);
    expect(Object.hasOwn(extracted, "assetId")).toBe(false);
    if (!isPictureGroup(extracted)) throw new Error("Expected subgroup root.");
    expect(extracted.hidden).toBe(true);
    expect(extracted.members).toEqual(nested.members);
    expect(extracted.frame.angleDeg).toBe(55);
    expect(extracted.members).not.toBe(nested.members);
  });

  test("member-only cut captures an exact detached target without deleting its source", () => {
    const f = fixture();
    const before = structuredClone(f.sheet.floatingImages);
    const captured = f.capture("cut", ["nested-group", "nested-leaf"]);
    expect(captured.mode).toBe("cut");
    expect(captured.selectedPaths).toEqual([["owned-group", "nested-group"]]);
    expect(captured.roots.map((root) => root.id)).toEqual(["nested-group"]);
    expect(captured.sourceForest).toEqual(before);
    expect(f.sheet.floatingImages).toEqual(before);
    expect(f.clipboard.getCurrent()).toEqual(captured);
  });

  test("rejects extraction from a collapsed owner", () => {
    const f = fixture();
    const group = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(group)) throw new Error("Expected group.");
    group.frame.anchor = {
      mode: "move-and-size",
      start: { row: { index: 0, offset: 0 }, column: { index: 0, offset: 0 } },
      end: { row: { index: 1, offset: 0 }, column: { index: 1, offset: 0 } },
    };
    f.sheet.hiddenColumns = new Set([0]);
    const collapsed = createPictureSheetMetrics(f.sheet);
    expect(() =>
      f.clipboard.capture({
        sheet: f.sheet,
        revision: 7,
        ownerGeneration: 3,
        sourceMetrics: collapsed,
        mode: "copy",
        selectedIds: ["nested-leaf"],
      }),
    ).toThrow(new OwnedPictureClipboardError("collapsed-selection"));
  });

  test("invalid ownership in an unselected root prevents capture", () => {
    const f = fixture();
    const group = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(group)) throw new Error("Expected group.");
    group.members[0]!.id = "framed";
    expect(() => f.capture("copy", ["legacy"])).toThrow(/Duplicate picture IDs/);
  });
});
