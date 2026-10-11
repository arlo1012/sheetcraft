import { describe, expect, test, vi } from "vitest";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { isPictureGroup, traversePictureGroup } from "@sheetcraft/core/picture-group";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { createSheet } from "@sheetcraft/core/workbook";
import {
  createOwnedPictureClipboardSession,
  OwnedPictureClipboardError,
} from "../../../../modules/sheet-images/owned-picture-clipboard";
import { fixture, translateRoots } from "./fixture";

describe("owned picture clipboard plans", () => {
  test("copy regenerates every owned ID and shares real leaf assets without mutating either sheet", () => {
    const f = fixture();
    const original = structuredClone(f.sheet.floatingImages);
    const captured = f.capture("copy", ["legacy", "owned-group"]);
    const destination = createSheet("Destination", "destination-sheet");
    const destinationMetrics = createPictureSheetMetrics({
      ...destination,
      rowHeights: new Map([[0, 83]]),
    });
    const placeRoots = vi.fn(translateRoots);
    const first = f.clipboard.planPaste({
      ...captured,
      sheet: destination,
      revision: 9,
      ownerGeneration: 8,
      sourceMetrics: f.metrics,
      destinationMetrics,
      placeRoots,
    });
    expect(first.roots.map((root) => root.id)).toEqual(["fresh-1", "fresh-5"]);
    const group = first.roots[0]!;
    if (!isPictureGroup(group)) throw new Error("Expected cloned group.");
    expect(traversePictureGroup(group).map(({ node }) => node.id)).toEqual([
      "fresh-1",
      "fresh-2",
      "fresh-3",
      "fresh-4",
    ]);
    const leaves = traversePictureGroup(group).filter(
      ({ node }) => node.kind === "grouped-picture-v1",
    );
    expect(leaves.map(({ node }) => ("assetId" in node ? node.assetId : undefined))).toEqual([
      "synthetic-asset",
      "synthetic-asset",
    ]);
    expect(Object.hasOwn(group, "assetId")).toBe(false);
    const legacy = first.roots[1]!;
    if (isPictureGroup(legacy)) throw new Error("Expected standalone picture.");
    expect(legacy.assetId).toBe("synthetic-asset");
    expect(legacy.groupId).toBe("fresh-6");
    expect(first.nextForest).toEqual(first.roots);
    expect(placeRoots).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        sourceMetrics: f.metrics,
        destinationMetrics,
        sourceSheetId: "source-sheet",
        sourceRevision: 7,
        sourceOwnerGeneration: 3,
      }),
    );
    expect(f.sheet.floatingImages).toEqual(original);
    expect(destination.floatingImages).toEqual([]);
    expect(f.clipboard.complete(first, true)).toBe(false);
    expect(f.clipboard.getCurrent()).toBeDefined();
    const second = f.clipboard.planPaste({
      ...captured,
      sheet: destination,
      revision: 9,
      ownerGeneration: 8,
      sourceMetrics: f.metrics,
      destinationMetrics,
      placeRoots: translateRoots,
    });
    expect(second.roots[0]!.id).not.toBe(first.roots[0]!.id);
    expect(f.clipboard.getCurrent()!.roots).toEqual(captured.roots);
  });

  test("cut moves complete roots in existing stacking positions and retains all identities", () => {
    const f = fixture();
    const original = structuredClone(f.sheet.floatingImages);
    f.capture("cut", ["legacy", "owned-group"]);
    const plan = f.paste();
    expect(plan.mode).toBe("cut");
    expect(plan.nextForest.map((root) => root.id)).toEqual(["framed", "owned-group", "legacy"]);
    expect(plan.nextForest[0]).toEqual(original[0]);
    const group = plan.roots[0]!;
    const source = original[1]!;
    if (!isPictureGroup(group) || !isPictureGroup(source)) throw new Error("Expected groups.");
    expect(group.members).toEqual(source.members);
    expect(group.frame.anchor).not.toEqual(source.frame.anchor);
    expect(f.sheet.floatingImages).toEqual(original);
    expect(f.clipboard.getCurrent()).toBeDefined();
    expect(f.clipboard.complete(plan, true)).toBe(true);
    expect(f.clipboard.getCurrent()).toBeUndefined();
  });

  test("a leaf extracted in effective source metrics pastes with destination metrics and preserves world size", () => {
    const f = fixture();
    const captured = f.capture("copy", ["nested-leaf"]);
    const sourceRoot = captured.roots[0]!;
    if (!isFramedPictureObject(sourceRoot)) throw new Error("Expected framed leaf.");
    const sourceWorld = resolvePictureFrame(sourceRoot.frame, f.metrics);
    const destination = createSheet("Destination", "destination-sheet");
    const destinationMetrics = createPictureSheetMetrics({
      ...destination,
      rowHeights: new Map([
        [0, 5],
        [1, 100],
      ]),
      columnWidths: new Map([
        [0, 18],
        [1, 122],
      ]),
    });
    const plan = f.clipboard.planPaste({
      ...captured,
      sheet: destination,
      revision: 10,
      ownerGeneration: 4,
      sourceMetrics: f.metrics,
      destinationMetrics,
      placeRoots: translateRoots,
    });
    const pasted = plan.roots[0]!;
    if (!isFramedPictureObject(pasted)) throw new Error("Expected framed leaf.");
    const world = resolvePictureFrame(pasted.frame, destinationMetrics);
    expect(world.rect.x).toBeCloseTo(sourceWorld.rect.x + 12, 9);
    expect(world.rect.y).toBeCloseTo(sourceWorld.rect.y + 18, 9);
    expect(world.rect.width).toBeCloseTo(sourceWorld.rect.width, 9);
    expect(world.rect.height).toBeCloseTo(sourceWorld.rect.height, 9);
    expect(pasted.frame.source).toEqual(sourceRoot.frame.source);
    expect(pasted.assetId).toBe(sourceRoot.assetId);
    expect(pasted.id).not.toBe(sourceRoot.id);
  });

  test.each(["child-collision", "flat-group-collision", "original-id", "duplicate-id"] as const)(
    "rejects %s from the ID factory without consuming or editing",
    (failure) => {
      const f = fixture();
      let count = 0;
      const clipboard = createOwnedPictureClipboardSession({
        createToken: () => "local",
        createId: () => {
          count += 1;
          if (failure === "child-collision") return "nested-leaf";
          if (failure === "flat-group-collision") return "flat-group";
          if (failure === "original-id") return "owned-group";
          return "same-id";
        },
      });
      const captured = clipboard.capture({
        sheet: f.sheet,
        revision: 7,
        ownerGeneration: 3,
        sourceMetrics: f.metrics,
        mode: "copy",
        selectedIds: ["owned-group"],
      });
      const before = structuredClone(f.sheet.floatingImages);
      expect(() =>
        clipboard.planPaste({
          ...captured,
          sheet: f.sheet,
          revision: 7,
          ownerGeneration: 3,
          sourceMetrics: f.metrics,
          destinationMetrics: f.metrics,
          placeRoots: translateRoots,
        }),
      ).toThrow(/collision/);
      expect(count).toBeGreaterThan(0);
      expect(clipboard.getCurrent()!.token).toBe(captured.token);
      expect(f.sheet.floatingImages).toEqual(before);
    },
  );

  test.each([
    "remove-child",
    "change-hidden-source",
    "reorder-roots",
    "change-angle",
    "change-id",
  ] as const)("rejects a placement that tries to %s", (change) => {
    const f = fixture();
    const captured = f.capture("cut", ["owned-group", "legacy"]);
    const before = structuredClone(f.sheet.floatingImages);
    expect(() =>
      f.clipboard.planPaste({
        ...captured,
        sheet: f.sheet,
        revision: 7,
        ownerGeneration: 3,
        sourceMetrics: f.metrics,
        destinationMetrics: f.metrics,
        placeRoots: (input) => {
          const roots = translateRoots(input);
          const group = roots[0]!;
          if (!isPictureGroup(group)) throw new Error("Expected group.");
          if (change === "remove-child") group.members.pop();
          if (change === "change-hidden-source") {
            const nested = group.members[1]!;
            if (nested.kind !== "grouped-group-v1") throw new Error("Expected nested group.");
            const leaf = nested.members[0]!;
            if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected leaf.");
            leaf.frame.source.offsetXRatio = 0.8;
          }
          if (change === "reorder-roots") roots.reverse();
          if (change === "change-angle") group.frame.angleDeg += 1;
          if (change === "change-id") group.id = "unauthorized-id";
          return roots;
        },
      }),
    ).toThrow(new OwnedPictureClipboardError("invalid-placement"));
    expect(f.clipboard.getCurrent()!.token).toBe(captured.token);
    expect(f.sheet.floatingImages).toEqual(before);
  });

  test("validates every hidden descendant after movement with the actual destination metrics", () => {
    const f = fixture();
    const group = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(group)) throw new Error("Expected group.");
    group.members[0]!.hidden = true;
    group.members[0]!.frame.rect.widthRatio = 1e-8;
    const captured = f.capture("cut");
    expect(() =>
      f.clipboard.planPaste({
        ...captured,
        sheet: f.sheet,
        revision: 7,
        ownerGeneration: 3,
        sourceMetrics: f.metrics,
        destinationMetrics: f.metrics,
        placeRoots: ({ roots }) =>
          roots.map((root) => {
            if (!isPictureGroup(root)) throw new Error("Expected group.");
            return {
              ...root,
              frame: {
                ...root.frame,
                anchor: {
                  mode: "fixed" as const,
                  x: 1e12,
                  y: 10,
                  size: { width: 120, height: 80 },
                },
              },
            };
          }),
      }),
    ).toThrow(/represented/);
    expect(f.clipboard.getCurrent()!.token).toBe(captured.token);
  });

  test("a malformed unselected destination ownership tree rejects the whole next-forest plan", () => {
    const f = fixture();
    const captured = f.capture("copy", ["legacy"]);
    const destination = createSheet("Destination", "destination-sheet");
    destination.floatingImages = structuredClone(f.sheet.floatingImages);
    const group = destination.floatingImages[1]!;
    if (!isPictureGroup(group)) throw new Error("Expected group.");
    group.members[0]!.id = "framed";
    const placeRoots = vi.fn(translateRoots);
    expect(() =>
      f.clipboard.planPaste({
        ...captured,
        sheet: destination,
        revision: 7,
        ownerGeneration: 3,
        sourceMetrics: f.metrics,
        destinationMetrics: createPictureSheetMetrics(destination),
        placeRoots,
      }),
    ).toThrow(/Duplicate picture IDs/);
    expect(placeRoots).not.toHaveBeenCalled();
    expect(f.clipboard.getCurrent()!.token).toBe(captured.token);
  });

  test("explicit destination metrics are required even for fixed-frame pictures", () => {
    const f = fixture();
    const captured = f.capture("copy");
    expect(() =>
      f.clipboard.planPaste({
        ...captured,
        sheet: f.sheet,
        revision: 7,
        ownerGeneration: 3,
        sourceMetrics: f.metrics,
        destinationMetrics: undefined as never,
        placeRoots: translateRoots,
      }),
    ).toThrow(/effective worksheet metrics/);
  });
});
