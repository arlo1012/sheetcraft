import { describe, expect, test } from "vitest";
import { isPictureGroup, traversePictureGroup } from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { fixture, rect } from "./fixture";

describe("owned clipboard host capture", () => {
  test("copies one complete nested tree with fresh descendant IDs and shared assets", async () => {
    const f = fixture();
    const source = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(source)) throw new Error("Expected group.");
    const before = serializeWorkbook(f.session.workbook);
    await f.clipboard.copy([[source.id]], "copy");
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.clipboard.paste({ row: 8, column: 5 }, f.transfer())).toBe(true);
    const copy = f.sheet.floatingImages.at(-1)!;
    if (!isPictureGroup(copy)) throw new Error("Expected group.");
    const originalNodes = traversePictureGroup(source).map(({ node }) => node);
    const copiedNodes = traversePictureGroup(copy).map(({ node }) => node);
    expect(copiedNodes).toHaveLength(originalNodes.length);
    expect(new Set(copiedNodes.map((node) => node.id)).size).toBe(originalNodes.length);
    const originalIds = new Set(originalNodes.map((node) => node.id));
    expect(copiedNodes.every((node) => !originalIds.has(node.id))).toBe(true);
    copiedNodes.slice(1).forEach((node, index) => {
      const original = originalNodes[index + 1]!;
      expect({
        ...node,
        id: original.id,
        ...(node.kind === "grouped-group-v1" && original.kind === "grouped-group-v1"
          ? { members: original.members }
          : {}),
      }).toEqual(original);
    });
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.clipboard.hasPending()).toBe(true);
  });

  test("an exact nested leaf path extracts that leaf with inherited world geometry", async () => {
    const f = fixture();
    const root = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(root)) throw new Error("Expected group.");
    const source = resolvePictureGroup(root, f.getContext().metrics);
    const subgroup = source.members[1]!;
    if (!("members" in subgroup)) throw new Error("Expected nested group.");
    const leaf = subgroup.members[0]!;
    await f.clipboard.copy([[root.id, "nested-group", "nested-leaf"]], "copy");
    expect(f.write).toHaveBeenCalledWith({
      text: "Synthetic leaf",
      localToken: expect.any(String),
    });
    expect(f.clipboard.paste({ row: 7, column: 6 })).toBe(true);
    const copy = f.sheet.floatingImages.at(-1)!;
    if (!isFramedPictureObject(copy)) throw new Error("Expected extracted framed leaf.");
    expect(copy.assetId).toBe("synthetic-asset");
    expect(copy.hidden).toBe(true);
    expect(copy.frame.angleDeg).toBeCloseTo(leaf.layout!.angleDeg);
    expect(rect(copy, f.getContext()).width).toBeCloseTo(leaf.layout!.rect.width);
    expect(rect(copy, f.getContext()).height).toBeCloseTo(leaf.layout!.rect.height);
    expect(copy.frame.source).toEqual({
      widthRatio: 1.5,
      heightRatio: 2,
      offsetXRatio: -0.1,
      offsetYRatio: 0.2,
    });
    expect(copy.transform).toEqual({ appearance: { opacity: 0.65 } });
    expect(f.sheet.floatingImages[1]).toEqual(root);
  });

  test("member cut is explicitly unsupported without source or native mutations", async () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    await f.clipboard.copy([["owned-group", "nested-group", "nested-leaf"]], "cut");
    expect(f.write).not.toHaveBeenCalled();
    expect(f.onCopy).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.clipboard.hasPending()).toBe(false);
    expect(f.onFeedback).toHaveBeenCalledExactlyOnceWith("image.copyFailed");
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test.each([{ paths: [] }, { paths: [["missing"]] }, { paths: [["owned-group", "nested-leaf"]] }])(
    "rejects invalid exact paths $paths",
    async ({ paths }) => {
      const f = fixture();
      await f.clipboard.copy(paths, "copy");
      expect(f.clipboard.hasPending()).toBe(false);
      expect(f.write).not.toHaveBeenCalled();
      expect(f.onFeedback).toHaveBeenLastCalledWith("image.copyFailed");
    },
  );

  test("ancestor plus descendant selection captures the ancestor once in forest order", async () => {
    const f = fixture();
    await f.clipboard.copy(
      [["owned-group", "nested-group", "nested-leaf"], ["legacy"], ["owned-group"]],
      "copy",
    );
    expect(f.write.mock.calls[0]![0].text).toBe("Synthetic group\nLegacy");
    f.clipboard.paste({ row: 4, column: 4 });
    expect(f.sheet.floatingImages).toHaveLength(5);
    expect(isPictureGroup(f.sheet.floatingImages[3]!)).toBe(true);
  });

  test("optional selected paths still use the exact path contract", async () => {
    const f = fixture();
    f.setSelection([["owned-group", "nested-group"]]);
    await f.clipboard.copy(undefined, "copy");
    f.clipboard.paste({ row: 4, column: 4 });
    const copy = f.sheet.floatingImages.at(-1)!;
    expect(isPictureGroup(copy)).toBe(true);
    if (isPictureGroup(copy)) expect(copy.members).toHaveLength(1);
  });

  test("missing effective source context rejects instead of guessing durable metrics", async () => {
    const f = fixture();
    f.setContext(undefined);
    await f.clipboard.copy([["framed"]], "copy");
    expect(f.write).not.toHaveBeenCalled();
    expect(f.clipboard.hasPending()).toBe(false);
  });
});
