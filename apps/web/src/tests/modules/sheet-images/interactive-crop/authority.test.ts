import { afterEach, describe, expect, test } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import type { LegacyFloatingImage } from "@sheetcraft/core/workbook";
import {
  getPicturePaneTranslation,
  projectPictureFrameIntoPane,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import { fixture, leafPath } from "./fixture";

const fixtures: ReturnType<typeof fixture>[] = [];
function owner(id?: string, path: readonly string[] | null = null) {
  const value = fixture(id, path);
  fixtures.push(value);
  return value;
}
afterEach(() => fixtures.splice(0).forEach((value) => value.scope.stop()));

describe("interactive crop exact owner authority", () => {
  test.each([
    "sheet",
    "generation",
    "revision",
    "selection",
    "path",
    "readonly",
    "permission",
    "context",
    "metrics",
    "metric-function",
    "metric-count",
    "metric-closure",
    "forest-reference",
    "forest-in-place",
    "forest-order",
    "unrelated-hidden-source",
  ] as const)("a changed %s refuses the captured pointer and complete-forest commit", (change) => {
    const f = owner("owned-group", leafPath);
    expect(f.crop.start()).toBe(true);
    f.gesture();
    const snapshot = f.crop.captureGesture()!;
    if (change === "sheet") f.activeSheet.value = { ...f.sheet };
    else if (change === "generation") f.generation.value++;
    else if (change === "revision") f.revision.value++;
    else if (change === "selection") f.selectedIds.value = ["legacy0"];
    else if (change === "path") f.selectedPath.value = ["owned-group", "sibling"];
    else if (change === "readonly") f.readOnly.value = true;
    else if (change === "permission") f.sheet.properties.protected = true;
    else if (change === "context") f.context.value = undefined;
    else if (change === "metrics")
      f.context.value = {
        ...f.context.value!,
        metrics: { ...f.context.value!.metrics },
      };
    else if (change === "metric-function") {
      const axis = f.context.value!.metrics.columns,
        prefix = axis.visiblePrefix;
      axis.visiblePrefix = (index) => prefix(index);
    } else if (change === "metric-count") {
      Object.defineProperty(f.context.value!.metrics.rows, "count", { value: 100 });
    } else if (change === "metric-closure") {
      const offset = f.geometry.getColumnOffset;
      f.geometry.getColumnOffset = (index) => offset(index) + (index > 0 ? 1 : 0);
    } else if (change === "forest-reference") f.sheet.floatingImages = [...f.sheet.floatingImages];
    else if (change === "forest-in-place") f.ownedLeaf().frame.source.offsetXRatio += 0.1;
    else if (change === "forest-order") f.sheet.floatingImages.reverse();
    else {
      const hidden = f.root("hidden");
      if (isPictureGroup(hidden)) throw new Error("Expected unrelated hidden source.");
      hidden.assetId = "replacement-hidden-asset";
    }
    const afterChange = serializeWorkbook(f.session.workbook);
    expect(f.crop.captureGesture()).toBeUndefined();
    expect(f.crop.previewGesture(snapshot, "source", { x: 30, y: 20 })).toBe(false);
    f.crop.cancelGesture(snapshot);
    f.crop.finishGesture(snapshot);
    expect(f.crop.undoDraft()).toBe(false);
    expect(f.crop.redoDraft()).toBe(false);
    expect(f.crop.apply()).toBe(false);
    expect(f.crop.active.value).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.session.history.redoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(afterChange);
  });

  test("scroll keeps the worksheet draft and reprojects it through the current pane", () => {
    const f = owner();
    const before = serializeWorkbook(f.session.workbook);
    expect(f.crop.start()).toBe(true);
    f.gesture();
    const snapshot = f.crop.captureGesture()!;
    const view = f.crop.view.value!;
    const beforeProjection = projectPictureFrameIntoPane(
      view.geometry,
      "body",
      f.context.value!.layout,
    );
    f.scroll({ x: 70, y: 35 });
    expect(f.crop.active.value).toBe(true);
    expect(f.crop.captureGesture()!.sessionId).toBe(snapshot.sessionId);
    expect(f.crop.captureGesture()!.crop).toBe(snapshot.crop);
    const projected = projectPictureFrameIntoPane(
      f.crop.view.value!.geometry,
      "body",
      f.context.value!.layout,
    );
    expect(getPicturePaneTranslation("body", f.context.value!.layout)).toEqual({ x: -70, y: -35 });
    expect(projected.rect.x).toBeCloseTo(beforeProjection.rect.x - 70);
    expect(projected.rect.y).toBeCloseTo(beforeProjection.rect.y - 35);
    expect(f.crop.previewGesture(snapshot, "source", { x: 5, y: 6 })).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.crop.apply()).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test("old pointer snapshots cannot touch a new crop session for the same source", () => {
    const f = owner();
    expect(f.crop.start()).toBe(true);
    const old = f.gesture();
    f.crop.cancel();
    expect(f.crop.start()).toBe(true);
    const current = f.crop.captureGesture()!;
    expect(current.sessionId).not.toBe(old.sessionId);
    expect(f.crop.previewGesture(old, "source", { x: 20, y: 30 })).toBe(false);
    expect(f.crop.previewGesture(old, "se", { x: 20, y: 30 })).toBe(false);
    f.crop.cancelGesture(old);
    f.crop.finishGesture(old);
    expect(f.crop.captureGesture()!.crop).toBe(current.crop);
    expect(f.crop.undoDraft()).toBe(false);
    expect(f.crop.apply()).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("a repeated Start retains its current draft and cannot retarget a different owner", () => {
    const f = owner();
    expect(f.crop.start()).toBe(true);
    f.gesture();
    const draft = f.crop.captureGesture()!;
    expect(f.crop.start()).toBe(true);
    expect(f.crop.captureGesture()!.crop).toBe(draft.crop);
    f.selectedIds.value = ["legacy0"];
    expect(f.crop.previewGesture(draft, "source", { x: 15, y: 3 })).toBe(false);
    expect(f.crop.start()).toBe(true);
    expect(f.crop.view.value!.picture.id).toBe("legacy0");
    expect(f.crop.captureGesture()!.sessionId).not.toBe(draft.sessionId);
    expect(f.crop.previewGesture(draft, "source", { x: 15, y: 3 })).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test.each([
    "container",
    "hidden-root",
    "hidden-leaf",
    "missing-root",
    "missing-leaf",
    "wrong-root-path",
    "multiple-selection",
    "leaf-as-root",
    "plain-metadata-members",
    "readonly",
    "permission",
    "legacy-reflection",
    "invalid-revision",
  ] as const)("%s cannot acquire a real source owner", (change) => {
    const f = owner();
    if (change === "container") f.selectedIds.value = ["owned-group"];
    else if (change === "hidden-root") f.selectedIds.value = ["hidden"];
    else if (change === "hidden-leaf") {
      f.selectedIds.value = ["owned-group"];
      f.selectedPath.value = ["owned-group", "sibling"];
    } else if (change === "missing-root") f.selectedIds.value = ["missing"];
    else if (change === "missing-leaf") {
      f.selectedIds.value = ["owned-group"];
      f.selectedPath.value = ["owned-group", "missing"];
    } else if (change === "wrong-root-path") f.selectedPath.value = leafPath;
    else if (change === "multiple-selection") f.selectedIds.value = ["framed", "legacy0"];
    else if (change === "leaf-as-root") f.selectedIds.value = ["owned-leaf"];
    else if (change === "plain-metadata-members") {
      f.selectedIds.value = ["legacy0"];
      Object.assign(f.root(), { members: [] });
    } else if (change === "readonly") f.readOnly.value = true;
    else if (change === "permission") f.sheet.properties.protected = true;
    else if (change === "legacy-reflection") {
      f.selectedIds.value = ["legacy0"];
      const legacy = f.root() as LegacyFloatingImage;
      legacy.transform = { ...legacy.transform, appearance: { reflection: true } };
    } else f.revision.value = -1;
    const before = serializeWorkbook(f.session.workbook);
    expect(f.crop.canStart.value).toBe(false);
    expect(f.crop.start()).toBe(false);
    expect(f.crop.active.value).toBe(false);
    expect(f.crop.view.value).toBeUndefined();
    expect(f.crop.previewRoots.value).toBeUndefined();
    expect(f.crop.captureGesture()).toBeUndefined();
    expect(f.crop.apply()).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("a source below a hidden ancestor cannot start through its otherwise valid full path", () => {
    const f = owner("owned-group", ["owned-group", "nested", "owned-leaf"]);
    const group = f.owned(),
      leaf = group.members[0]!;
    group.members[0] = {
      kind: "grouped-group-v1",
      id: "nested",
      altText: "Hidden ancestor",
      hidden: true,
      frame: {
        kind: "group-local-frame-v1",
        angleDeg: 0,
        rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
      },
      members: [leaf],
    };
    expect(isPictureGroup(group)).toBe(true);
    expect(f.crop.canStart.value).toBe(false);
    expect(f.crop.start()).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("disposing its owner revokes the draft and all later pointer/command entry points", () => {
    const f = owner();
    const before = serializeWorkbook(f.session.workbook);
    expect(f.crop.start()).toBe(true);
    const snapshot = f.gesture();
    f.scope.stop();
    expect(f.crop.active.value).toBe(false);
    expect(f.crop.start()).toBe(false);
    expect(f.crop.previewGesture(snapshot, "source", { x: 1, y: 1 })).toBe(false);
    expect(f.crop.apply()).toBe(false);
    expect(f.crop.undoDraft()).toBe(false);
    expect(f.crop.redoDraft()).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
});
