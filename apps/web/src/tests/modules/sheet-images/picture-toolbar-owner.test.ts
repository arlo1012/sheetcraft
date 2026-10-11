import { describe, expect, test, vi } from "vitest";
import { ref, shallowRef } from "vue";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import {
  getActiveSheet,
  cloneFloatingImage,
  createSheet,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { usePictureTools } from "../../../modules/sheet-images/usePictureTools";
import { usePictureToolbarOwner } from "../../../modules/sheet-images/usePictureToolbarOwner";
import { getPictureToolGeometry } from "../../../modules/sheet-images/picture-tool-geometry";
import { framedPicture } from "./framed-picture-fixture";

const legacy: LegacyFloatingImage = {
  id: "legacy",
  assetId: "legacy-asset",
  altText: "Legacy",
  anchor: { row: 1, column: 1 },
  offsetX: 2,
  offsetY: 3,
  width: 240,
  height: 120,
};
function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  sheet.floatingImages = [cloneFloatingImage(legacy), framedPicture()];
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 30 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 0, columns: 0 },
    bodyScrollPosition: { x: 0, y: 0 },
    viewportSize: { width: 800, height: 500 },
  });
  const context = shallowRef({ layout, metrics: createPictureViewMetrics(sheet, geometry, rows) });
  const selectedIds = ref(["framed"]),
    generation = ref(0),
    revision = ref(0);
  const currentSheet = shallowRef(sheet),
    currentWorkbook = shallowRef(session.workbook);
  let busy = false,
    rejected = false,
    exception = false;
  const execute = vi.fn((command: WorkbookCommand) => {
    if (exception) throw new Error("Authoritative owner failure");
    if (rejected) return false;
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value += 1;
    return changed;
  });
  const tools = usePictureTools({
    getSheet: () => currentSheet.value,
    selectedIds,
    getFrameContext: () => context.value,
    isBusy: () => busy,
    execute,
  });
  const owner = usePictureToolbarOwner({
    getWorkbook: () => currentWorkbook.value,
    getSheet: () => currentSheet.value,
    getGeneration: () => generation.value,
    getImage: () => {
      void revision.value;
      return currentSheet.value.floatingImages.find(
        (image) => image.id === selectedIds.value.at(-1),
      );
    },
    getSelectedIds: () => selectedIds.value,
    getFrameContext: () => context.value,
    isBusy: () => busy,
    resize: tools.resizeOne,
    aspectRatio: tools.setAspectRatio,
    appearance: tools.applyAppearance,
  });
  return {
    session,
    sheet,
    context,
    selectedIds,
    generation,
    revision,
    currentSheet,
    currentWorkbook,
    execute,
    tools,
    owner,
    reject: () => (rejected = true),
    throw: () => (exception = true),
    setBusy: () => (busy = true),
  };
}
function frame(f: ReturnType<typeof fixture>) {
  const image = f.sheet.floatingImages[1]!;
  if (!isFramedPictureObject(image)) throw new Error("Expected framed picture");
  return image;
}

describe("picture ribbon geometry and owned intents", () => {
  test("derives local size instead of rotated visual bounds and never invents geometry", () => {
    const f = fixture();
    expect(getPictureToolGeometry(frame(f))).toBeUndefined();
    expect(f.owner.value!.geometry).toEqual({ width: 120, height: 80, angleDeg: 37 });
    expect(getPictureToolGeometry(legacy)).toEqual({ width: 240, height: 120, angleDeg: 0 });
  });
  test("numeric size commits once, preserves source/anchor, and restores the complete ordered snapshot", () => {
    const f = fixture(),
      before = serializeWorkbook(f.session.workbook);
    const original = frame(f),
      first = resolvePictureFrame(original.frame, f.context.value.metrics);
    expect(f.owner.value!.resize({ axis: "width", value: 180 })).toBe(true);
    const next = frame(f),
      afterGeometry = resolvePictureFrame(next.frame, f.context.value.metrics);
    expect(afterGeometry.rect.width).toBeCloseTo(180);
    expect(afterGeometry.rect.height).toBeCloseTo(120);
    expect(afterGeometry.corners[0].x).toBeCloseTo(first.corners[0].x);
    expect(afterGeometry.corners[0].y).toBeCloseTo(first.corners[0].y);
    expect(next.frame.source).toEqual(original.frame.source);
    expect(next.frame.anchor.mode).toBe(original.frame.anchor.mode);
    expect(next).not.toHaveProperty("width");
    expect(f.sheet.floatingImages[0]).toEqual(legacy);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.session.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  });
  test("aspect-only and unchanged size are atomic and do not fabricate flat geometry", () => {
    const f = fixture(),
      original = structuredClone(frame(f).frame);
    expect(f.owner.value!.aspectRatio(false)).toBe(true);
    expect(frame(f).frame).toEqual(original);
    expect(frame(f).lockAspectRatio).toBe(false);
    expect(f.owner.value!.resize({ axis: "height", value: 80 })).toBe(true);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.owner.value!.resize({ axis: "height", value: 100 })).toBe(true);
    expect(resolvePictureFrame(frame(f).frame, f.context.value.metrics).rect.width).toBe(120);
  });
  test.each(["refused", "thrown", "busy", "protected"] as const)(
    "rejected %s size preserves snapshot/history and reports failure",
    (kind) => {
      const f = fixture();
      if (kind === "refused") f.reject();
      if (kind === "thrown") f.throw();
      if (kind === "busy") f.setBusy();
      if (kind === "protected") f.sheet.properties.protected = true;
      const before = serializeWorkbook(f.session.workbook);
      // Tool result is authoritative; a stale ribbon intent itself is ignored.
      expect(f.tools.resizeOne(frame(f), { axis: "width", value: 200 })).toBe(false);
      expect(f.tools.sizeFeedback.value).toBe("picture.operationFailed");
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );
  test("invalid size and missing current context do not call the owner", () => {
    const f = fixture();
    expect(f.tools.resizeOne(frame(f), { axis: "width", value: 0 })).toBe(false);
    expect(f.tools.sizeFeedback.value).toBe("picture.invalidSize");
    const noContext = usePictureTools({
      getSheet: () => f.sheet,
      selectedIds: f.selectedIds,
      isBusy: () => false,
      execute: f.execute,
    });
    expect(noContext.resizeOne(frame(f), { axis: "width", value: 200 })).toBe(false);
    expect(noContext.sizeFeedback.value).toBe("picture.operationFailed");
    expect(f.execute).not.toHaveBeenCalled();
  });
  test.each(["generation", "sheet", "selection", "source", "context"] as const)(
    "old displayed owner cannot resize or change lock after %s changes",
    (kind) => {
      const f = fixture(),
        old = f.owner.value!;
      if (kind === "generation") f.generation.value += 1;
      if (kind === "sheet") f.currentSheet.value = createSheet("Replacement", f.sheet.id);
      if (kind === "selection") f.selectedIds.value = ["legacy"];
      if (kind === "source") {
        f.sheet.floatingImages[1] = { ...frame(f), altText: "New source" };
        f.revision.value += 1;
      }
      if (kind === "context") f.context.value = { ...f.context.value };
      expect(old.resize({ axis: "width", value: 200 })).toBe(false);
      expect(old.aspectRatio(false)).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );
  test("an old toolbar lease stays invalid after selection or context leaves and returns", () => {
    const f = fixture(),
      original = f.owner.value!;
    f.selectedIds.value = ["legacy"];
    f.selectedIds.value = ["framed"];
    expect(original.resize({ axis: "width", value: 200 })).toBe(false);
    const current = f.owner.value!;
    expect(current.appearanceDraftKey).not.toBe(original.appearanceDraftKey);
    const context = f.context.value;
    f.context.value = { ...context };
    f.context.value = context;
    expect(current.aspectRatio(false)).toBe(false);
    expect(f.owner.value!.appearanceDraftKey).not.toBe(current.appearanceDraftKey);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("only an accepted exact owned size/lock mutation retains the numeric editor draft key", () => {
    const f = fixture(),
      original = f.owner.value!;
    expect(original.resize({ axis: "width", value: 180 })).toBe(true);
    expect(f.owner.value!.draftKey).toBe(original.draftKey);
    expect(f.owner.value!.aspectRatio(false)).toBe(true);
    expect(f.owner.value!.draftKey).toBe(original.draftKey);
    f.sheet.floatingImages[1] = { ...frame(f), assetId: "another-source" };
    f.revision.value += 1;
    expect(f.owner.value!.draftKey).not.toBe(original.draftKey);
  });
  test("same-size source/context ownership changes retain toolbar target key but reset the numeric draft key", () => {
    const f = fixture(),
      original = f.owner.value!;
    f.sheet.floatingImages[1] = { ...frame(f), assetId: "replacement-source" };
    f.revision.value += 1;
    const replacement = f.owner.value!;
    expect(replacement.key).toBe(original.key);
    expect(replacement.geometry).toEqual(original.geometry);
    expect(replacement.draftKey).not.toBe(original.draftKey);
    f.context.value = { ...f.context.value };
    expect(f.owner.value!.draftKey).not.toBe(replacement.draftKey);
    expect(replacement.resize({ axis: "width", value: 200 })).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("appearance commits keep the active style editor owner while source/context changes reset it", () => {
    const f = fixture(),
      original = f.owner.value!;
    expect(original.appearance({ opacity: 0.5 })).toBe(true);
    const afterStyle = f.owner.value!;
    expect(afterStyle.appearanceDraftKey).toBe(original.appearanceDraftKey);
    expect(afterStyle.appearance({ brightness: 0.8 })).toBe(true);
    expect(f.owner.value!.appearanceDraftKey).toBe(original.appearanceDraftKey);
    f.sheet.floatingImages[1] = { ...frame(f), assetId: "replacement" };
    f.revision.value += 1;
    const replacement = f.owner.value!;
    expect(replacement.appearanceDraftKey).not.toBe(original.appearanceDraftKey);
    f.context.value = { ...f.context.value };
    expect(f.owner.value!.appearanceDraftKey).not.toBe(replacement.appearanceDraftKey);
  });
  test("legacy sibling edits preserve framed source exactly, and unsupported reflection rejects the whole mixed selection", () => {
    const f = fixture(),
      original = structuredClone(frame(f));
    f.selectedIds.value = ["legacy"];
    expect(f.owner.value!.resize({ axis: "width", value: 300 })).toBe(true);
    expect(frame(f)).toEqual(original);
    f.selectedIds.value = ["legacy", "framed"];
    const before = serializeWorkbook(f.session.workbook);
    expect(f.tools.applyAppearance({ reflection: true })).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.tools.applyAppearance({ opacity: 0.5 })).toBe(true);
    expect(frame(f).frame).toEqual(original.frame);
    expect(frame(f).transform?.appearance?.opacity).toBe(0.5);
  });
  test.each([Number.NaN, Infinity, -Infinity])(
    "invalid border width %s is rejected before history and reports failure",
    (width) => {
      const f = fixture(),
        before = serializeWorkbook(f.session.workbook);
      expect(f.tools.applyAppearance({ border: { color: "#000000", width } })).toBe(false);
      expect(f.tools.operationFeedback.value).toBe("picture.operationFailed");
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );
  test("a toolbar appearance callback owns every selected source and refuses a sibling replacement", () => {
    const f = fixture();
    f.selectedIds.value = ["legacy", "framed"];
    const old = f.owner.value!;
    f.sheet.floatingImages[0] = { ...legacy, assetId: "new-source" };
    const before = serializeWorkbook(f.session.workbook);
    expect(old.appearance({ opacity: 0.5 })).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
  test("an incomplete or duplicate selected appearance target set cannot silently patch a subset", () => {
    const f = fixture(),
      before = serializeWorkbook(f.session.workbook);
    f.selectedIds.value = ["legacy", "missing"];
    expect(f.tools.applyAppearance({ opacity: 0.5 })).toBe(false);
    f.selectedIds.value = ["framed", "framed"];
    expect(f.tools.applyAppearance({ opacity: 0.5 })).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
});
