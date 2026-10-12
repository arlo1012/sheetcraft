import { describe, expect, test } from "vitest";
import { createSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import { isPictureGroup, type GroupedGroup } from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  arrangeOwnedPictureSelection,
  captureOwnedPictureSelection,
  flipOwnedPictureSelection,
  isOwnedPictureSelectionCurrent,
  rotateOwnedPictureSelection,
} from "../../../modules/sheet-images/owned-picture-selection-commands";
import { getPictureViewRect } from "../../../modules/sheet-images/picture-view-operations";
import type { PictureAlignment } from "../../../modules/sheet-images/usePictureTools";
import { pictureGroup } from "./picture-group-fixture";
import { framedPicture } from "./framed-picture-fixture";

function fixture() {
  const sheet = createSheet("Synthetic", "sheet");
  const geometry = createSheetGeometry({ rowCount: 20, columnCount: 20 });
  const rows = createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    viewportSize: { width: 800, height: 500 },
  });
  const frameContext = { layout, metrics: createPictureViewMetrics(sheet, geometry, rows) };
  const group = pictureGroup();
  group.frame.anchor = { mode: "fixed", x: 100, y: 80, size: { width: 200, height: 100 } };
  const framed = framedPicture();
  framed.frame.anchor = { mode: "fixed", x: 390, y: 180, size: { width: 120, height: 80 } };
  const legacy: FloatingImage = {
    id: "legacy",
    assetId: "legacy-asset",
    altText: "Synthetic legacy",
    anchor: { row: 1, column: 1 },
    offsetX: 20,
    offsetY: 12,
    width: 60,
    height: 50,
  };
  const untouched = framedPicture();
  untouched.id = "untouched";
  untouched.hidden = true;
  const roots = [legacy, group, untouched, framed];
  const context = {
    roots,
    owner: {},
    revision: 1,
    layout,
    frameContext,
    scale: 1,
    readOnly: false,
  };
  const selection = { rootIds: [group.id, legacy.id, framed.id], path: null };
  const capture = () => captureOwnedPictureSelection(context, selection, framed.id);
  return { roots, group, framed, legacy, untouched, context, selection, capture };
}

describe("owned picture selection command planning", () => {
  test("mixed root quarter-turn and flip retain forest order and real source-free containers", () => {
    const f = fixture();
    const rotated = rotateOwnedPictureSelection(f.capture(), 1);
    expect(rotated.map(({ id }) => id)).toEqual(f.roots.map(({ id }) => id));
    expect(rotated[2]).toEqual(f.untouched);
    expect(rotated[1]).toMatchObject({
      kind: "picture-group-v1",
      frame: { anchor: f.group.frame.anchor, angleDeg: 127 },
      members: f.group.members,
    });
    expect(rotated[1]).not.toHaveProperty("assetId");
    expect(rotated[3]).toMatchObject({
      frame: { anchor: f.framed.frame.anchor, angleDeg: 127, source: f.framed.frame.source },
    });
    expect(rotated[0]).toMatchObject({ width: 50, height: 60, transform: { rotation: 90 } });
    const flipped = flipOwnedPictureSelection(f.capture(), "horizontal");
    expect(flipped[1]).not.toHaveProperty("assetId");
    expect(flipped[2]).toEqual(f.untouched);
    expect(flipped[3]).toMatchObject({ frame: { angleDeg: 323, flipHorizontal: true } });
    expect(f.roots).toEqual(f.context.roots);
    expect(f.group.frame.angleDeg).toBe(37);
  });

  test("six alignment edges and bicenter use every root's real layout", () => {
    const actions: PictureAlignment[] = [
      "left",
      "center",
      "right",
      "top",
      "middle",
      "bottom",
      "both",
    ];
    for (const action of actions) {
      const f = fixture();
      const next = arrangeOwnedPictureSelection(
        f.capture(),
        f.selection.rootIds,
        action,
        "last-selected",
      );
      const base = getPictureViewRect(f.framed, f.context.layout, f.context.frameContext)!;
      for (const root of next.filter(({ id }) => f.selection.rootIds.includes(id))) {
        const rect = getPictureViewRect(root, f.context.layout, f.context.frameContext)!;
        if (action === "left") expect(rect.x).toBeCloseTo(base.x);
        if (action === "center" || action === "both")
          expect(rect.x + rect.width / 2).toBeCloseTo(base.x + base.width / 2);
        if (action === "right") expect(rect.x + rect.width).toBeCloseTo(base.x + base.width);
        if (action === "top") expect(rect.y).toBeCloseTo(base.y);
        if (action === "middle" || action === "both")
          expect(rect.y + rect.height / 2).toBeCloseTo(base.y + base.height / 2);
        if (action === "bottom") expect(rect.y + rect.height).toBeCloseTo(base.y + base.height);
      }
      expect(next[2]).toEqual(f.untouched);
      expect(next.map(({ id }) => id)).toEqual(f.roots.map(({ id }) => id));
      const group = next[1];
      if (!isPictureGroup(group)) throw new Error("Expected actual group.");
      expect(group.members).toEqual(f.group.members);
    }
  });

  test("horizontal and vertical distribution keep the real outer endpoints and equal gaps", () => {
    for (const action of ["horizontal", "vertical"] as const) {
      const f = fixture();
      const axis = action === "horizontal" ? "x" : "y";
      const size = action === "horizontal" ? "width" : "height";
      const rects = (roots: readonly FloatingImage[]) =>
        roots
          .filter(({ id }) => f.selection.rootIds.includes(id))
          .map((root) => getPictureViewRect(root, f.context.layout, f.context.frameContext)!)
          .sort((a, b) => a[axis] - b[axis]);
      const before = rects(f.roots);
      const after = rects(arrangeOwnedPictureSelection(f.capture(), f.selection.rootIds, action));
      expect(after[0]![axis]).toBeCloseTo(before[0]![axis]);
      expect(after[2]![axis] + after[2]![size]).toBeCloseTo(before[2]![axis] + before[2]![size]);
      expect(after[1]![axis] - after[0]![axis] - after[0]![size]).toBeCloseTo(
        after[2]![axis] - after[1]![axis] - after[1]![size],
      );
    }
  });

  test("owned leaf rotation and flip retain its real owner, siblings, IDs and asset", () => {
    const f = fixture();
    const child = f.group.members[0]!;
    if (child.kind !== "grouped-picture-v1") throw new Error("Expected leaf.");
    child.frame.source.offsetXRatio = 0.2;
    const selection = { rootIds: [f.group.id], path: [f.group.id, child.id] };
    const snapshot = captureOwnedPictureSelection(f.context, selection, f.group.id);
    const before = resolvePictureGroup(f.group, f.context.frameContext.metrics).members[0]!.layout!;
    const rotated = rotateOwnedPictureSelection(snapshot, -1)[1];
    if (!isPictureGroup(rotated)) throw new Error("Expected group.");
    const after = resolvePictureGroup(rotated, f.context.frameContext.metrics).members[0]!.layout!;
    expect(after.rect).toEqual(before.rect);
    expect(after.angleDeg).toBe(344);
    expect(rotated.frame).toEqual(f.group.frame);
    expect(rotated.members[0]).toMatchObject({
      id: child.id,
      assetId: child.assetId,
      frame: { source: child.frame.source },
    });
    const flipped = flipOwnedPictureSelection(snapshot, "horizontal")[1];
    if (!isPictureGroup(flipped)) throw new Error("Expected group.");
    expect(flipped.frame).toEqual(f.group.frame);
    expect(flipped.members[0]).toMatchObject({
      id: child.id,
      assetId: child.assetId,
      frame: { flipHorizontal: true, source: { offsetXRatio: -0.2 } },
    });
    expect(f.group.members[0]!.frame).toEqual(child.frame);
  });

  test("nested container flip mirrors only its leased descendants, including hidden source offsets", () => {
    const f = fixture();
    const leaf = f.group.members[0]!;
    if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected leaf.");
    leaf.hidden = true;
    leaf.frame.rect = { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.3, heightRatio: 0.4 };
    leaf.frame.source.offsetXRatio = 0.2;
    const nested: GroupedGroup = {
      kind: "grouped-group-v1",
      id: "nested",
      altText: "Synthetic nested group",
      frame: {
        kind: "group-local-frame-v1",
        rect: { xRatio: 0.2, yRatio: 0.1, widthRatio: 0.5, heightRatio: 0.7 },
        angleDeg: 22,
      },
      members: [leaf],
    };
    f.group.members = [nested];
    const selection = { rootIds: [f.group.id], path: [f.group.id, nested.id] };
    const snapshot = captureOwnedPictureSelection(f.context, selection, f.group.id);
    const before = resolvePictureGroup(f.group, f.context.frameContext.metrics).members[0]!.layout!;
    const next = flipOwnedPictureSelection(snapshot, "horizontal")[1];
    if (!isPictureGroup(next)) throw new Error("Expected group.");
    const resolved = resolvePictureGroup(next, f.context.frameContext.metrics).members[0]!;
    expect(resolved.layout!.rect.x).toBeCloseTo(before.rect.x);
    expect(resolved.layout!.rect.y).toBeCloseTo(before.rect.y);
    expect(resolved.layout!.angleDeg).toBe(301);
    expect(next.frame).toEqual(f.group.frame);
    expect(next.members[0]).not.toHaveProperty("assetId");
    expect(next.members[0]).toMatchObject({
      members: [
        {
          id: leaf.id,
          hidden: true,
          assetId: leaf.assetId,
          frame: { flipHorizontal: true, source: { offsetXRatio: -0.2 } },
        },
      ],
    });
    const reflected = next.members[0];
    if (reflected?.kind !== "grouped-group-v1") throw new Error("Expected owned container.");
    expect(reflected.members[0]!.frame.rect.xRatio).toBeCloseTo(0.6);
    expect(next.members[0]!.frame.rect.widthRatio).toBeCloseTo(nested.frame.rect.widthRatio);
  });

  test("leases reject owner, unrelated root, metric, pane and root/member selection drift", () => {
    const f = fixture();
    const snapshot = f.capture();
    expect(isOwnedPictureSelectionCurrent(snapshot, f.context, f.selection, f.framed.id)).toBe(
      true,
    );
    expect(
      isOwnedPictureSelectionCurrent(
        snapshot,
        { ...f.context, owner: {} },
        f.selection,
        f.framed.id,
      ),
    ).toBe(false);
    expect(
      isOwnedPictureSelectionCurrent(
        snapshot,
        { ...f.context, revision: 2 },
        f.selection,
        f.framed.id,
      ),
    ).toBe(false);
    expect(
      isOwnedPictureSelectionCurrent(
        snapshot,
        f.context,
        { rootIds: [f.group.id], path: [f.group.id, f.group.members[0]!.id] },
        f.group.id,
      ),
    ).toBe(false);
    f.untouched.altText = "in-place unrelated edit";
    expect(isOwnedPictureSelectionCurrent(snapshot, f.context, f.selection, f.framed.id)).toBe(
      false,
    );
    f.untouched.altText = "Synthetic";
    f.context.frameContext.metrics = { ...f.context.frameContext.metrics };
    expect(isOwnedPictureSelectionCurrent(snapshot, f.context, f.selection, f.framed.id)).toBe(
      false,
    );
    const fresh = f.capture();
    f.context.layout.panes.body.clip.width -= 1;
    expect(isOwnedPictureSelectionCurrent(fresh, f.context, f.selection, f.framed.id)).toBe(false);
  });

  test("readonly, arbitrary numeric rotation, inner arrangement and unsupported snap refuse atomically", () => {
    const f = fixture();
    const readonly = captureOwnedPictureSelection({ ...f.context, readOnly: true }, f.selection);
    expect(() => rotateOwnedPictureSelection(readonly, 1)).toThrow(/read-only/);
    expect(() => flipOwnedPictureSelection(readonly, "vertical")).toThrow(/read-only/);
    expect(() => rotateOwnedPictureSelection(f.capture(), 0.25 as 1)).toThrow(/quarter-turn/);
    expect(() =>
      arrangeOwnedPictureSelection(f.capture(), f.selection.rootIds, "unknown" as PictureAlignment),
    ).toThrow(/Unsupported/);
    const inner = captureOwnedPictureSelection(f.context, {
      rootIds: [f.group.id],
      path: [f.group.id, f.group.members[0]!.id],
    });
    expect(() => arrangeOwnedPictureSelection(inner, [f.group.id], "left")).toThrow(
      /root selection/,
    );
    expect(f.group.frame.angleDeg).toBe(37);
  });
});
