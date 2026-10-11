import { describe, expect, test, vi } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import {
  pictureFrameLocalToWorld,
  type ResolvedPictureFrame,
} from "@sheetcraft/core/picture-frame";
import type { GroupedGroup, GroupedPicture, PictureGroup } from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  createPictureViewMetrics,
  getPicturePaneTranslation,
  projectPictureFrameIntoPane,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  getPictureGroupViewportFragments,
  pictureGroupContainsViewportPoint,
} from "@sheetcraft/sheet-engine/picture-group-geometry";
import {
  getOwnedPictureGroupViewportFragments,
  hitOwnedPictureGroupViewportPoint,
} from "../../../modules/sheet-images/picture-owned-group-fragments";
import { pictureGroup } from "./picture-group-fixture";

function view(hiddenColumns: readonly number[] = []) {
  const sheet = createSheet("Synthetic", "sheet");
  sheet.hiddenColumns = new Set(hiddenColumns);
  const geometry = createSheetGeometry({
    rowCount: 30,
    columnCount: 30,
    hiddenColumns: sheet.hiddenColumns,
  });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 1, columns: 1 },
    bodyScrollPosition: { x: 13, y: 7 },
    viewportSize: { width: 500, height: 500 },
  });
  return { layout, metrics: createPictureViewMetrics(sheet, geometry, rows) };
}

function leaf(id = "leaf"): GroupedPicture {
  const node = pictureGroup().members[0]!;
  if (node.kind !== "grouped-picture-v1") throw new Error("Expected fixture leaf.");
  return { ...node, id, assetId: `asset-${id}` };
}

function nested(): PictureGroup {
  const child = leaf("nested-leaf");
  child.frame.rect = { xRatio: 0.15, yRatio: 0.1, widthRatio: 0.6, heightRatio: 0.4 };
  const subgroup: GroupedGroup = {
    kind: "grouped-group-v1",
    id: "subgroup",
    altText: "Synthetic source-free subgroup",
    frame: {
      kind: "group-local-frame-v1",
      rect: { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.7, heightRatio: 0.6 },
      angleDeg: 23,
    },
    members: [child],
  };
  const group = pictureGroup();
  group.frame.anchor = { mode: "fixed", x: 80, y: 60, size: { width: 200, height: 90 } };
  group.members = [leaf("bottom"), subgroup, leaf("top")];
  return group;
}

function resolvedLeaf(group: PictureGroup, context: ReturnType<typeof view>) {
  const node = resolvePictureGroup(group, context.metrics).members[0]!;
  if ("members" in node || !node.layout) throw new Error("Expected resolved fixture leaf.");
  return node;
}

function expectOrthogonal(geometry: ResolvedPictureFrame): void {
  const [a, b, , d] = geometry.corners;
  const x = { x: b.x - a.x, y: b.y - a.y },
    y = { x: d.x - a.x, y: d.y - a.y };
  expect(Math.hypot(x.x, x.y)).toBeCloseTo(geometry.rect.width, 10);
  expect(Math.hypot(y.x, y.y)).toBeCloseTo(geometry.rect.height, 10);
  expect((x.x * y.x + x.y * y.y) / (geometry.rect.width * geometry.rect.height)).toBeCloseTo(0, 12);
}

describe("prepared owned-picture leaf pane projection", () => {
  test("keeps canonical nodes, complete owner paths, genuine assets and nested stacking order", () => {
    const group = nested(),
      context = view();
    const fragments = getOwnedPictureGroupViewportFragments(group, context);
    const order = [...new Set(fragments.map((fragment) => fragment.image.id))];
    expect(order).toEqual(["bottom", "nested-leaf", "top"]);
    for (const fragment of fragments) {
      expect(fragment.rootId).toBe("owned-group");
      expect(fragment.kind).toBe("group-leaf");
      expect(fragment.image.kind).toBe("grouped-picture-v1");
      expect(fragment.image.assetId).toBe(`asset-${fragment.image.id}`);
      expect(fragment.path).toEqual(
        fragment.image.id === "nested-leaf"
          ? ["owned-group", "subgroup", "nested-leaf"]
          : ["owned-group", fragment.image.id],
      );
      expect(fragment.image).not.toHaveProperty("anchor");
      expect(fragment.image.frame).not.toHaveProperty("anchor");
      expect(fragment.image).not.toHaveProperty("members");
    }
    fragments[0]!.image.frame.rect.xRatio = 9;
    expect(group.members[0]!.frame.rect.xRatio).toBe(0);
  });

  test("composes nested arbitrary angles after unequal local scaling without shear", () => {
    const group = nested(),
      context = view();
    const frames = getOwnedPictureGroupViewportFragments(group, context).filter(
      ({ image }) => image.id === "nested-leaf",
    );
    expect(frames.length).toBeGreaterThan(0);
    for (const { geometry } of frames) {
      expect(geometry.angleDeg).toBe(97);
      expect(geometry.rect.width).toBeCloseTo(84);
      expect(geometry.rect.height).toBeCloseTo(21.6);
      expectOrthogonal(geometry);
    }
  });

  test("moves source offsets and all leaf geometry into the same frozen pane once", () => {
    const group = pictureGroup(),
      context = view();
    const picture = group.members[0]!;
    if (picture.kind !== "grouped-picture-v1") throw new Error("Expected fixture leaf.");
    picture.frame.source = {
      widthRatio: 2,
      heightRatio: 0.5,
      offsetXRatio: 0.25,
      offsetYRatio: -0.2,
    };
    picture.frame.flipHorizontal = true;
    picture.frame.flipVertical = true;
    const canonical = resolvedLeaf(group, context);
    const fragments = getOwnedPictureGroupViewportFragments(group, context);
    expect(fragments.map(({ paneId }) => paneId)).toEqual(["topLeft", "top", "left", "body"]);
    for (const fragment of fragments) {
      expect(fragment.geometry).toEqual(
        projectPictureFrameIntoPane(canonical.layout!, fragment.paneId, context.layout),
      );
      const delta = getPicturePaneTranslation(fragment.paneId, context.layout);
      expect(fragment.geometry.sourceRect!.x).toBe(canonical.layout!.sourceRect!.x + delta.x);
      expect(fragment.geometry.sourceRect!.y).toBe(canonical.layout!.sourceRect!.y + delta.y);
      expect(fragment.image.frame.flipHorizontal).toBe(true);
      expect(fragment.image.frame.flipVertical).toBe(true);
      const clip = context.layout.panes[fragment.paneId].clip;
      expect(fragment.clippedBounds.x).toBeGreaterThanOrEqual(clip.x);
      expect(fragment.clippedBounds.y).toBeGreaterThanOrEqual(clip.y);
      expect(fragment.clippedBounds.x + fragment.clippedBounds.width).toBeLessThanOrEqual(
        clip.x + clip.width,
      );
    }
    // Root selection remains a source-free projection independent from leaf content.
    for (const fragment of getPictureGroupViewportFragments(group, context))
      expect(fragment.geometry).not.toHaveProperty("sourceRect");
  });

  test.each(["root", "parent", "leaf"] as const)(
    "honors %s visibility without losing visible siblings",
    (hidden) => {
      const group = nested(),
        context = view();
      const parent = group.members[1]!;
      if (parent.kind !== "grouped-group-v1") throw new Error("Expected fixture subgroup.");
      if (hidden === "root") group.hidden = true;
      else if (hidden === "parent") parent.hidden = true;
      else parent.members[0]!.hidden = true;
      const fragments = getOwnedPictureGroupViewportFragments(group, context);
      expect([...new Set(fragments.map(({ image }) => image.id))]).toEqual(
        hidden === "root" ? [] : ["bottom", "top"],
      );
    },
  );

  test.each(["source", "derived"] as const)(
    "rejects a hidden late invalid %s before any pane projection",
    (invalid) => {
      const group = nested(),
        context = view();
      const parent = group.members[1]!;
      if (parent.kind !== "grouped-group-v1") throw new Error("Expected fixture subgroup.");
      parent.hidden = true;
      const child = parent.members[0]!;
      if (child.kind !== "grouped-picture-v1") throw new Error("Expected fixture leaf.");
      if (invalid === "source") child.frame.source.widthRatio = 0;
      else child.frame.rect.widthRatio = Number.MAX_VALUE;
      const project = vi.fn(() => context.layout);
      const guarded = {
        metrics: context.metrics,
        get layout() {
          return project();
        },
      };
      expect(() => getOwnedPictureGroupViewportFragments(group, guarded)).toThrow();
      expect(project).not.toHaveBeenCalled();
    },
  );

  test("a collapsed worksheet owner emits no leaves while invalid hidden sources still reject", () => {
    const group = pictureGroup(),
      context = view([0]);
    group.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    expect(getOwnedPictureGroupViewportFragments(group, context)).toEqual([]);
    const child = group.members[0]!;
    if (child.kind !== "grouped-picture-v1") throw new Error("Expected fixture leaf.");
    child.hidden = true;
    child.frame.source.heightRatio = Number.NaN;
    expect(() => getOwnedPictureGroupViewportFragments(group, context)).toThrow();
  });

  test("rejects cycles, duplicate ownership IDs, excessive depth and accessor-backed children", () => {
    const context = view();
    const duplicate = pictureGroup();
    duplicate.members.push(leaf(duplicate.members[0]!.id));
    expect(() => getOwnedPictureGroupViewportFragments(duplicate, context)).toThrow("Duplicate");
    const cyclic = nested();
    const parent = cyclic.members[1]!;
    if (parent.kind !== "grouped-group-v1") throw new Error("Expected fixture subgroup.");
    parent.members.push(parent);
    expect(() => getOwnedPictureGroupViewportFragments(cyclic, context)).toThrow("shared");
    const accessor = pictureGroup();
    const get = vi.fn(() => leaf());
    Object.defineProperty(accessor.members, "0", { get });
    expect(() => getOwnedPictureGroupViewportFragments(accessor, context)).toThrow();
    expect(get).not.toHaveBeenCalled();
    const deep = pictureGroup();
    let members = deep.members;
    for (let index = 0; index < 33; index++) {
      const owner: GroupedGroup = {
        kind: "grouped-group-v1",
        id: `owner-${index}`,
        altText: "Synthetic owner",
        frame: {
          kind: "group-local-frame-v1",
          rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          angleDeg: 0,
        },
        members: [leaf(`deep-leaf-${index}`)],
      };
      members.splice(0, members.length, owner);
      members = owner.members;
    }
    expect(() => getOwnedPictureGroupViewportFragments(deep, context)).toThrow("depth");
  });
});

describe("prepared exact owned-leaf hit path", () => {
  test("hits rotated content outside the root frame and keeps root selection distinct", () => {
    const context = view(),
      group = pictureGroup();
    group.frame.angleDeg = 0;
    group.frame.anchor = { mode: "fixed", x: 100, y: 70, size: { width: 100, height: 60 } };
    const picture = group.members[0]!;
    picture.frame.angleDeg = 45;
    const geometry = resolvedLeaf(group, context).layout!;
    const sheetPoint = pictureFrameLocalToWorld(geometry.rect, geometry.angleDeg, { x: 1, y: 1 });
    const delta = getPicturePaneTranslation("body", context.layout);
    const point = { x: sheetPoint.x + delta.x, y: sheetPoint.y + delta.y };
    const hit = hitOwnedPictureGroupViewportPoint(group, point, context);
    expect(hit?.image.id).toBe("owned-leaf");
    expect(hit?.path).toEqual(["owned-group", "owned-leaf"]);
    expect(hit?.geometry.sourceRect).not.toBeNull();
    expect(hit?.paneId).toBe("body");
    expect(pictureGroupContainsViewportPoint(group, point, context)).toBe(false);
    const root = getPictureGroupViewportFragments(group, context).find(
      ({ paneId }) => paneId === "body",
    )!;
    expect(hit!.clippedBounds.y).toBeLessThan(root.clippedBounds.y);
  });

  test("returns the top nested genuine leaf and skips hidden ancestor branches", () => {
    const context = view(),
      group = pictureGroup();
    group.frame.angleDeg = 0;
    group.frame.anchor = { mode: "fixed", x: 130, y: 70, size: { width: 120, height: 80 } };
    const bottom = leaf("bottom"),
      top = leaf("top");
    bottom.frame.angleDeg = top.frame.angleDeg = 0;
    const parent: GroupedGroup = {
      kind: "grouped-group-v1",
      id: "parent",
      altText: "Synthetic parent",
      frame: {
        kind: "group-local-frame-v1",
        rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
        angleDeg: 0,
      },
      members: [top],
    };
    group.members = [bottom, parent];
    const point = { x: 177, y: 103 };
    const hit = hitOwnedPictureGroupViewportPoint(group, point, context);
    expect(hit?.image.assetId).toBe("asset-top");
    expect(hit?.path).toEqual(["owned-group", "parent", "top"]);
    parent.hidden = true;
    expect(hitOwnedPictureGroupViewportPoint(group, point, context)?.image.id).toBe("bottom");
    bottom.hidden = true;
    expect(hitOwnedPictureGroupViewportPoint(group, point, context)).toBeNull();
  });

  test("rejects AABB-only hits, finite points outside pane clips and nonfinite points", () => {
    const context = view(),
      group = pictureGroup();
    group.frame.angleDeg = 0;
    group.frame.anchor = { mode: "fixed", x: 130, y: 100, size: { width: 120, height: 80 } };
    group.members[0]!.frame.angleDeg = 45;
    const fragment = getOwnedPictureGroupViewportFragments(group, context).find(
      ({ paneId }) => paneId === "body",
    )!;
    const point = { x: fragment.geometry.bounds.x + 1, y: fragment.geometry.bounds.y + 1 };
    expect(hitOwnedPictureGroupViewportPoint(group, point, context)).toBeNull();
    expect(hitOwnedPictureGroupViewportPoint(group, { x: 510, y: 103 }, context)).toBeNull();
    expect(hitOwnedPictureGroupViewportPoint(group, { x: -1, y: 103 }, context)).toBeNull();
    expect(() =>
      hitOwnedPictureGroupViewportPoint(group, { x: Number.NaN, y: 10 }, context),
    ).toThrow("finite");
  });
});
