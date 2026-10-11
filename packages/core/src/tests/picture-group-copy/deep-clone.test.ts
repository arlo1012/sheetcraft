import { describe, expect, test, vi } from "vitest";
import { clonePictureRootsForClipboard } from "../../picture-group-copy.js";
import {
  isPictureGroup,
  traversePictureGroup,
  type PictureGroup,
  type PictureGroupChild,
} from "../../picture-group.js";
import { normalizePictureObjectCollection, type PictureObject } from "../../picture-object.js";
import type { LegacyFloatingImage } from "../../workbook.js";
import { picture } from "../picture-group-planning/fixture.js";
import { childNodes, fixture } from "../picture-group-edit/fixture.js";

function legacy(id: string): LegacyFloatingImage {
  return {
    id,
    assetId: "shared-asset",
    altText: "Legacy",
    anchor: { row: 2, column: 3 },
    offsetX: 12,
    offsetY: 24,
    width: 216,
    height: 144,
    hidden: false,
    lockAspectRatio: true,
    transform: { flipVertical: true, rotation: 90 },
  };
}
function nodes(values: readonly PictureObject[]) {
  return values.flatMap<PictureObject | PictureGroupChild>((root) =>
    isPictureGroup(root) ? traversePictureGroup(root).map((visit) => visit.node) : [root],
  );
}

describe("pure internal clipboard clones of owned and standalone roots", () => {
  test("every descendant gets a distinct fresh ID while asset references and all durable data remain", () => {
    const f = fixture();
    const framed = picture("framed", 500, 74);
    framed.assetId = "shared-asset";
    const original = [f.root, legacy("legacy"), framed];
    const before = structuredClone(original);
    const oldNodes = nodes(original);
    let counter = 0;
    const createId = vi.fn(() => `fresh-${++counter}`);
    const next = clonePictureRootsForClipboard(original, {
      createId,
      reservedIds: ["destination"],
    });
    const newNodes = nodes(next);
    expect(createId).toHaveBeenCalledTimes(oldNodes.length);
    expect(new Set(newNodes.map((node) => node.id)).size).toBe(newNodes.length);
    expect(
      newNodes.map((node) => node.id).some((id) => oldNodes.some((old) => old.id === id)),
    ).toBe(false);
    for (let index = 0; index < oldNodes.length; index++) {
      const oldNode = oldNodes[index]!;
      const newNode = newNodes[index]!;
      if ("assetId" in oldNode) expect(newNode).toHaveProperty("assetId", oldNode.assetId);
      else expect(newNode).not.toHaveProperty("assetId");
    }
    // Reversing only node identities recovers the exact canonical model.
    for (let index = 0; index < newNodes.length; index++) newNodes[index]!.id = oldNodes[index]!.id;
    expect(next).toEqual(normalizePictureObjectCollection(original));
    expect(original).toEqual(before);
    const copied = childNodes(next[0] as PictureGroup).picture;
    copied.frame.source.offsetXRatio = 9;
    copied.transform!.annotations![0]!.points[0]!.x = 0.9;
    copied.transform!.appearance!.border!.width = 9;
    expect(f.picture.frame.source.offsetXRatio).toBe(-0.2);
    expect(f.picture.transform!.annotations![0]!.points[0]!.x).toBe(0.1);
    expect(f.picture.transform!.appearance!.border!.width).toBe(2);
  });
  test("only standalone flat group IDs are remapped, consistently and separately from owned IDs", () => {
    const f = fixture();
    const a = { ...legacy("legacy"), groupId: "root" };
    const b = { ...picture("framed", 500), groupId: "root" };
    let counter = 0;
    const createId = vi.fn(() => `fresh-${++counter}`);
    const next = clonePictureRootsForClipboard([f.root, a, b], { createId });
    expect(createId).toHaveBeenCalledTimes(8);
    const root = next[0] as PictureGroup;
    const copiedA = next[1] as LegacyFloatingImage;
    const copiedB = next[2] as LegacyFloatingImage;
    expect(copiedA.groupId).toBe(copiedB.groupId);
    expect(copiedA.groupId).not.toBe("root");
    expect(copiedA.groupId).not.toBe(root.id);
    expect(nodes(next).some((node) => node.id === copiedA.groupId)).toBe(false);
    for (const { node } of traversePictureGroup(root)) expect(node).not.toHaveProperty("groupId");
    expect(a.groupId).toBe("root");
    expect(b.groupId).toBe("root");
  });
  test("fresh IDs cannot reuse any original node, original flat group, reserved or previous new identity", () => {
    const f = fixture();
    const original = [f.root, { ...legacy("legacy"), groupId: "flat-group" }];
    for (const collision of ["root", "inner", "picture", "flat-group", "destination"]) {
      const createId = vi.fn(() => collision);
      expect(() =>
        clonePictureRootsForClipboard(original, { createId, reservedIds: ["destination"] }),
      ).toThrow(/collision/);
      expect(createId).toHaveBeenCalledTimes(1);
    }
    const createId = vi.fn(() => "same-new-id");
    expect(() => clonePictureRootsForClipboard(original, { createId })).toThrow(/collision/);
    expect(createId).toHaveBeenCalledTimes(2);
    expect(original[0]).toEqual(f.root);
  });
  test("a flat identity allocated after every node still cannot collide with a fresh owned ID", () => {
    const original = [
      { ...legacy("a"), groupId: "flat" },
      { ...legacy("b"), groupId: "flat" },
    ];
    const ids = ["new-a", "new-b", "new-a"];
    expect(() => clonePictureRootsForClipboard(original, { createId: () => ids.shift()! })).toThrow(
      /collision/,
    );
    expect(original.map((root) => root.id)).toEqual(["a", "b"]);
    expect(original.map((root) => root.groupId)).toEqual(["flat", "flat"]);
  });
  test.each([undefined, null, 1, {}, Symbol("id"), "", "  "])(
    "malicious/invalid ID factory result %s returns no partial clone",
    (invalid) => {
      const f = fixture();
      const before = structuredClone(f.root);
      let counter = 0;
      const createId = () => (++counter === 3 ? invalid : `new-${counter}`) as string;
      expect(() => clonePictureRootsForClipboard([f.root], { createId })).toThrow(/non-empty/);
      expect(f.root).toEqual(before);
      expect(counter).toBe(3);
    },
  );
  test("a factory failure is atomic and is not retried", () => {
    const f = fixture();
    const before = structuredClone(f.root);
    let counter = 0;
    const createId = vi.fn(() => {
      if (++counter === 4) throw new Error("Factory failed");
      return `new-${counter}`;
    });
    expect(() => clonePictureRootsForClipboard([f.root], { createId })).toThrow("Factory failed");
    expect(createId).toHaveBeenCalledTimes(4);
    expect(f.root).toEqual(before);
  });
  test("complete durable forest validation happens before the factory is called", () => {
    const f = fixture();
    const createId = vi.fn(() => "new-id");
    f.picture.frame.source.widthRatio = -1;
    expect(() => clonePictureRootsForClipboard([f.root], { createId })).toThrow();
    expect(createId).not.toHaveBeenCalled();
    f.picture.frame.source.widthRatio = 1;
    expect(() => clonePictureRootsForClipboard([f.root, legacy("picture")], { createId })).toThrow(
      /Duplicate/,
    );
    expect(createId).not.toHaveBeenCalled();
  });
  test("reserved IDs use bounded dense data arrays and never invoke getters", () => {
    const reserved: string[] = [];
    const getter = vi.fn(() => "reserved");
    Object.defineProperty(reserved, "0", { get: getter });
    const createId = vi.fn(() => "new-id");
    expect(() =>
      clonePictureRootsForClipboard([fixture().root], { createId, reservedIds: reserved }),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(createId).not.toHaveBeenCalled();
  });
  test("a factory accessor cannot run while reading clone options", () => {
    const getter = vi.fn(() => () => "new-id");
    const options = {} as { createId: () => string };
    Object.defineProperty(options, "createId", { get: getter });
    expect(() => clonePictureRootsForClipboard([fixture().root], options)).toThrow(/data/);
    expect(getter).not.toHaveBeenCalled();
  });
  test("empty root selection allocates no identities", () => {
    const createId = vi.fn(() => "new-id");
    expect(clonePictureRootsForClipboard([], { createId })).toEqual([]);
    expect(createId).not.toHaveBeenCalled();
  });
});
