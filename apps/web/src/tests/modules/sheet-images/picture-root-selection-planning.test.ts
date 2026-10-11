// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createSheet, type LegacyFloatingImage } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import {
  movePictureRootSelectionBy,
  resizePictureRootSelectionBy,
} from "../../../modules/sheet-images/picture-root-selection-planning";
import { getPictureViewRect } from "../../../modules/sheet-images/picture-view-operations";
import { pictureGroup } from "./picture-group-fixture";
import { framedPicture } from "./framed-picture-fixture";
function view() {
  const sheet = createSheet("Synthetic", "s");
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 20 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 0, columns: 0 },
    bodyScrollPosition: { x: 0, y: 0 },
    viewportSize: { width: 600, height: 400 },
  });
  return { layout, metrics: createPictureViewMetrics(sheet, geometry, rows) };
}
function legacy(): LegacyFloatingImage {
  return {
    id: "old",
    assetId: "a",
    altText: "Old",
    anchor: { row: 0, column: 0 },
    offsetX: 30,
    offsetY: 50,
    width: 240,
    height: 160,
  };
}
describe("temporary mixed-root selection transforms", () => {
  test("clamped and perpendicular no-ops retain non-normalized free anchors and small sizes", () => {
    const context = view(),
      first = legacy(),
      second = { ...legacy(), id: "other", width: 10, height: 5, offsetX: 180 };
    first.offsetX = 0;
    const roots = [first, second],
      before = structuredClone(roots);
    expect(movePictureRootSelectionBy(roots, { x: -10, y: 0 }, context.layout, context)).toEqual(
      before,
    );
    expect(
      resizePictureRootSelectionBy(roots, second.id, "e", { x: 0, y: 20 }, context.layout, context),
    ).toEqual(before);
    expect(roots).toEqual(before);
  });
  test("a shared no-op cap is applied before projecting an overflowing pointer request", () => {
    const context = view(),
      group = pictureGroup(),
      frame = framedPicture();
    group.frame.angleDeg = 0;
    const leaf = group.members[0]!;
    leaf.frame.rect.widthRatio = 1e306;
    leaf.hidden = true;
    frame.frame.anchor = { mode: "fixed", x: 300, y: 100, size: { width: 10000, height: 80 } };
    const before = structuredClone([group, frame]);
    const next = resizePictureRootSelectionBy(
      [group, frame],
      group.id,
      "e",
      { x: 120, y: 0 },
      context.layout,
      context,
    )!;
    expect(next).toEqual(before);
    expect([group, frame]).toEqual(before);
  });
  test("side handle changes each root's local width by the same factor without grouping or moving its NW", () => {
    const context = view(),
      first = legacy(),
      second = pictureGroup(),
      frame = framedPicture();
    second.frame.angleDeg = frame.frame.angleDeg = 0;
    second.frame.anchor = { mode: "fixed", x: 300, y: 100, size: { width: 160, height: 96 } };
    const roots = [first, second, frame],
      before = structuredClone(roots);
    const next = resizePictureRootSelectionBy(
      roots,
      first.id,
      "e",
      { x: 48, y: 300 },
      context.layout,
      context,
    )!;
    expect(next.map((image) => getPictureViewRect(image, context.layout, context))).toEqual([
      { x: 30, y: 50, width: 288, height: 160 },
      { x: 300, y: 100, width: 192, height: 96 },
      { x: 194, y: 74, width: 144, height: 80 },
    ]);
    expect(roots).toEqual(before);
    expect(next.map((root) => root.id)).toEqual(roots.map((root) => root.id));
    expect(next[0]).not.toHaveProperty("groupId");
    expect(isPictureGroup(next[1]!) && next[1].members).toEqual(second.members);
  });
  test("group-initiated locked corner shares factors but each member keeps its own rotated opposite corner", () => {
    const context = view(),
      group = pictureGroup(),
      frame = framedPicture();
    group.lockAspectRatio = true;
    const before = [group, frame].map((image) =>
      getPictureViewRect(image, context.layout, context)!,
    );
    const rad = (group.frame.angleDeg * Math.PI) / 180;
    const next = resizePictureRootSelectionBy(
      [group, frame],
      group.id,
      "se",
      { x: Math.cos(rad) * 24, y: Math.sin(rad) * 24 },
      context.layout,
      context,
    )!;
    const after = next.map((image) => getPictureViewRect(image, context.layout, context)!);
    expect(after[0]!.width / before[0]!.width).toBeCloseTo(1.2, 10);
    expect(after[1]!.width / before[1]!.width).toBeCloseTo(1.2, 10);
    expect(after[1]!.height / before[1]!.height).toBeCloseTo(1.2, 10);
  });
  test("common shrink bound prevents independent rounding/clamping and preserves a real group asset", () => {
    const context = view(),
      first = legacy(),
      second = pictureGroup();
    second.frame.angleDeg = 0;
    second.frame.anchor = { mode: "fixed", x: 300, y: 100, size: { width: 2, height: 96 } };
    const next = resizePictureRootSelectionBy(
      [first, second],
      first.id,
      "e",
      { x: -239, y: 0 },
      context.layout,
      context,
    )!;
    expect(getPictureViewRect(next[0]!, context.layout, context)!.width).toBe(120);
    expect(getPictureViewRect(next[1]!, context.layout, context)!.width).toBe(1);
    expect(isPictureGroup(next[1]!) && next[1].members[0]).toEqual(second.members[0]);
  });
  test("move clamps the whole mixed selection at the legacy origin with one delta", () => {
    const context = view(),
      first = legacy(),
      second = pictureGroup();
    const before = resolvePictureGroup(second, context.metrics).layout.rect;
    const next = movePictureRootSelectionBy(
      [first, second],
      { x: -100, y: -100 },
      context.layout,
      context,
    )!;
    expect(getPictureViewRect(next[0]!, context.layout, context)).toEqual({
      x: 0,
      y: 0,
      width: 240,
      height: 160,
    });
    expect(getPictureViewRect(next[1]!, context.layout, context)).toEqual({
      ...before,
      x: before.x - 30,
      y: before.y - 50,
    });
  });
  test("invalid hidden child, duplicate identities and missing active target fail atomically", () => {
    const context = view(),
      first = legacy(),
      second = pictureGroup();
    second.hidden = true;
    const leaf = second.members[0]!;
    if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected leaf.");
    leaf.frame.source.widthRatio = Number.MAX_VALUE;
    const before = structuredClone([first, second]);
    expect(() =>
      resizePictureRootSelectionBy(
        [first, second],
        first.id,
        "e",
        { x: 1, y: 0 },
        context.layout,
        context,
      ),
    ).toThrow();
    expect([first, second]).toEqual(before);
    expect(() =>
      movePictureRootSelectionBy([first, first], { x: 1, y: 1 }, context.layout, context),
    ).toThrow();
    expect(
      resizePictureRootSelectionBy(
        [first],
        "missing",
        "e",
        { x: 1, y: 1 },
        context.layout,
        context,
      ),
    ).toBeNull();
  });
});
