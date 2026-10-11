import { describe, expect, test } from "vitest";
import { createSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  capturePictureGroupInteraction,
  getOwnedPictureSelectionFragments,
  hitPictureRootAt,
  isPictureGroupInteractionCurrent,
  pictureRotationPointerDelta,
  planPictureGroupInteraction,
  type PictureGroupInteractionContext,
} from "../../../modules/sheet-images/picture-group-interaction";
import { pictureGroup } from "./picture-group-fixture";
import { framedPicture } from "./framed-picture-fixture";

function fixture() {
  const sheet = createSheet("Synthetic", "sheet");
  const geometry = createSheetGeometry({ rowCount: 20, columnCount: 20 });
  const rows = createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    viewportSize: { width: 600, height: 400 },
  });
  const group = pictureGroup();
  group.frame.anchor = { mode: "fixed", x: 100, y: 80, size: { width: 200, height: 100 } };
  group.frame.angleDeg = 0;
  group.members[0]!.frame.angleDeg = 37;
  group.members[0]!.frame.rect.widthRatio = 0.5;
  const standalone = framedPicture();
  standalone.id = "other";
  standalone.frame.anchor = { mode: "fixed", x: 380, y: 100, size: { width: 120, height: 80 } };
  const roots: FloatingImage[] = [group, standalone];
  const context: PictureGroupInteractionContext = {
    roots,
    owner: {},
    revision: 1,
    layout,
    frameContext: {
      layout,
      metrics: createPictureViewMetrics(sheet, geometry, rows),
    },
    scale: 1,
    readOnly: false,
  };
  return { group, standalone, context };
}

describe("owned group interaction planner", () => {
  test("a real rotated child hit remains available beyond its parent's frame", () => {
    const f = fixture();
    f.group.members[0]!.frame.rect.xRatio = -0.6;
    const resolved = resolvePictureGroup(f.group, f.context.frameContext.metrics);
    const child = resolved.members[0]!.layout!;
    const point = {
      x: child.rect.x + child.rect.width / 2,
      y: child.rect.y + child.rect.height / 2,
    };
    expect(point.x).toBeLessThan(resolved.layout.rect.x);
    expect(
      hitPictureRootAt(f.context.roots, point, f.context.layout, f.context.frameContext),
    ).toMatchObject({ kind: "group-leaf", path: [f.group.id, f.group.members[0]!.id] });
  });
  test("global standalone hits win over selected-container empty or occupied bounds", () => {
    const f = fixture();
    f.standalone.frame.anchor = { mode: "fixed", x: 120, y: 90, size: { width: 120, height: 80 } };
    f.standalone.frame.angleDeg = 0;
    expect(
      hitPictureRootAt(
        f.context.roots,
        { x: 160, y: 130 },
        f.context.layout,
        f.context.frameContext,
        [f.group.id],
      ),
    ).toMatchObject({ kind: "framed", image: { id: "other" } });
    f.context.roots = [f.standalone, f.group];
    expect(
      hitPictureRootAt(
        f.context.roots,
        { x: 250, y: 130 },
        f.context.layout,
        f.context.frameContext,
        [f.group.id],
      ),
    ).toMatchObject({ kind: "group-frame", rootId: f.group.id });
  });
  test("selected root-gap fallback carries no asset or picture source", () => {
    const f = fixture();
    const hit = hitPictureRootAt(
      f.context.roots,
      { x: 275, y: 130 },
      f.context.layout,
      f.context.frameContext,
      [f.group.id],
    );
    expect(hit).toMatchObject({ kind: "group-frame", path: [f.group.id] });
    expect(hit).not.toHaveProperty("image");
    expect(hit && hit.kind !== "legacy" ? hit.geometry : null).not.toHaveProperty("sourceRect");
  });
  test("root and child selection projections are source-free", () => {
    const f = fixture();
    for (const path of [[f.group.id], [f.group.id, f.group.members[0]!.id]]) {
      const fragments = getOwnedPictureSelectionFragments(
        f.context.roots,
        path,
        f.context.frameContext,
      );
      expect(fragments.length).toBeGreaterThan(0);
      for (const fragment of fragments) {
        expect(fragment).not.toHaveProperty("image");
        expect(fragment.geometry).not.toHaveProperty("sourceRect");
        expect(fragment.geometry).not.toHaveProperty("sourceCorners");
      }
    }
  });
  test("root move and resize retain the complete forest and the real owned sources", () => {
    const f = fixture();
    const snapshot = capturePictureGroupInteraction(f.context, [f.group.id], [f.group.id]);
    const moved = planPictureGroupInteraction(snapshot, "move", { x: 20, y: 30 });
    expect(moved).toHaveLength(2);
    expect(moved[0]).toMatchObject({
      frame: { anchor: { x: 120, y: 110 } },
      members: f.group.members,
    });
    expect(moved[1]).toEqual(f.standalone);
    const resized = planPictureGroupInteraction(snapshot, "e", { x: 40, y: 0 });
    expect(resized[0]).toMatchObject({
      frame: { anchor: { x: 100, y: 80, size: { width: 240, height: 100 } } },
    });
    expect(resized[1]).toEqual(f.standalone);
    expect(f.group.frame.anchor).toMatchObject({ x: 100, y: 80, size: { width: 200 } });
  });
  test("ordinary root multi-selection moves once and resizes each member around its own edge", () => {
    const f = fixture();
    f.standalone.frame.angleDeg = 0;
    const snapshot = capturePictureGroupInteraction(
      f.context,
      [f.group.id],
      [f.group.id, f.standalone.id],
    );
    const moved = planPictureGroupInteraction(snapshot, "move", { x: 20, y: 30 });
    expect(moved).toMatchObject([
      { frame: { anchor: { x: 120, y: 110 } } },
      { frame: { anchor: { x: 400, y: 130 } } },
    ]);
    const resized = planPictureGroupInteraction(snapshot, "e", { x: 40, y: 0 });
    expect(resized).toMatchObject([
      { frame: { anchor: { x: 100, y: 80, size: { width: 240, height: 100 } } } },
      { frame: { anchor: { x: 380, y: 100, size: { width: 144, height: 80 } } } },
    ]);
    expect(() => planPictureGroupInteraction(snapshot, "rotate", { x: 0, y: 0 }, 37)).toThrow(
      /not supported/,
    );
  });
  test("owned child resize holds its actual rotated opposite edge and preserves parent placement", () => {
    const f = fixture();
    f.group.frame.angleDeg = 23;
    const path = [f.group.id, f.group.members[0]!.id];
    const snapshot = capturePictureGroupInteraction(f.context, path, [f.group.id]);
    const angle = (snapshot.world.angleDeg * Math.PI) / 180;
    const next = planPictureGroupInteraction(snapshot, "e", {
      x: Math.cos(angle) * 40,
      y: Math.sin(angle) * 40,
    });
    const group = next[0] as typeof f.group;
    const child = resolvePictureGroup(group, f.context.frameContext.metrics).members[0]!.layout!;
    expect(child.rect.width).toBeCloseTo(snapshot.world.rect.width + 40);
    expect(child.rect.height).toBe(snapshot.world.rect.height);
    for (const corner of [0, 3]) {
      expect(child.corners[corner]!.x).toBeCloseTo(snapshot.world.corners[corner]!.x);
      expect(child.corners[corner]!.y).toBeCloseTo(snapshot.world.corners[corner]!.y);
    }
    expect(group.frame).toEqual(f.group.frame);
    expect(group.members[0]).toMatchObject({
      assetId: f.group.members[0]!.kind === "grouped-picture-v1" ? f.group.members[0]!.assetId : "",
    });
    expect(next[1]).toEqual(f.standalone);
  });
  test("arbitrary root and child rotation retain the real center and source lease", () => {
    const f = fixture();
    for (const path of [[f.group.id], [f.group.id, f.group.members[0]!.id]]) {
      const snapshot = capturePictureGroupInteraction(f.context, path, [f.group.id]);
      const next = planPictureGroupInteraction(snapshot, "rotate", { x: 0, y: 0 }, 13.75);
      const resolved = resolvePictureGroup(
        next[0] as typeof f.group,
        f.context.frameContext.metrics,
      );
      const world = path.length === 1 ? resolved.layout : resolved.members[0]!.layout!;
      expect(world.angleDeg).toBeCloseTo(snapshot.world.angleDeg + 13.75);
      expect(world.rect).toEqual(snapshot.world.rect);
      expect(next[1]).toEqual(f.standalone);
    }
    expect(
      pictureRotationPointerDelta({ x: 100, y: 100 }, { x: 100, y: 50 }, { x: 150, y: 100 }),
    ).toBe(90);
    expect(
      pictureRotationPointerDelta({ x: 100, y: 100 }, { x: 100, y: 50 }, { x: 120, y: 50 }),
    ).toBeCloseTo(21.801409486);
  });
  test("owner, revision, context, collection identity, membership, source, and readonly changes cancel", () => {
    const f = fixture();
    const snapshot = capturePictureGroupInteraction(f.context, [f.group.id], [f.group.id]);
    expect(isPictureGroupInteractionCurrent(snapshot, f.context)).toBe(true);
    for (const change of [
      { owner: {} },
      { revision: 2 },
      { layout: { ...f.context.layout } },
      { frameContext: { ...f.context.frameContext } },
      { roots: [...f.context.roots] },
      { scale: 2 },
      { readOnly: true },
    ])
      expect(isPictureGroupInteractionCurrent(snapshot, { ...f.context, ...change })).toBe(false);
    f.group.members[0]!.frame.rect.widthRatio = 0.6;
    expect(isPictureGroupInteractionCurrent(snapshot, f.context)).toBe(false);
    f.group.members[0]!.frame.rect.widthRatio = 0.5;
    if (f.group.members[0]!.kind === "grouped-picture-v1")
      f.group.members[0]!.assetId = "new-source";
    expect(isPictureGroupInteractionCurrent(snapshot, f.context)).toBe(false);
  });
  test("missing participants and overflowing hidden subtrees reject the whole plan", () => {
    const f = fixture();
    expect(() =>
      capturePictureGroupInteraction(f.context, [f.group.id], [f.group.id, "missing"]),
    ).toThrow(/missing/);
    const leaf = f.group.members[0]!;
    if (leaf.kind !== "grouped-picture-v1") throw new Error("Fixture needs an actual leaf.");
    leaf.hidden = true;
    leaf.frame.source.widthRatio = 1e306;
    const snapshot = capturePictureGroupInteraction(f.context, [f.group.id], [f.group.id]);
    expect(() => planPictureGroupInteraction(snapshot, "e", { x: 1e8, y: 0 })).toThrow();
    expect(snapshot.roots).toHaveLength(2);
    expect(resolvePictureLayout({ x: 0, y: 0, width: 200, height: 100 }, 37).corners).toHaveLength(
      4,
    );
  });
});
