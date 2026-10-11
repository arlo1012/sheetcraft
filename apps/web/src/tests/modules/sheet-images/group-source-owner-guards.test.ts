import { describe, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { usePictureDialogSessions } from "../../../modules/sheet-images/usePictureDialogSessions";
import { usePictureToolbarOwner } from "../../../modules/sheet-images/usePictureToolbarOwner";
import { usePictureTools } from "../../../modules/sheet-images/usePictureTools";
import {
  getPictureToolGeometry,
  resizePictureTo,
} from "../../../modules/sheet-images/picture-tool-geometry";
import { fixture, group } from "./group-source-guard-fixture";
import { framedPicture } from "./framed-picture-fixture";

const resize = { width: 400, height: 200, locked: false, all: false };
const compression = { format: "jpeg" as const, maxSide: 400, quality: 0.8, all: false };
describe("source-only group dialog owners", () => {
  test("mixed selections cannot replace existing drafts and all-picture confirms reject atomically", async () => {
    const f = fixture();
    const setImage = vi.fn(() => true);
    const compress = vi.fn(async () => true);
    const resizeMany = vi.fn(() => true);
    const dialogs = usePictureDialogSessions({
      getWorkbook: () => f.session.workbook,
      getSheet: () => f.sheet,
      getGeneration: () => 0,
      getSelectedImage: () =>
        f.sheet.floatingImages.find((image) => image.id === f.selectedIds.value[0]),
      getSelectedIds: () => f.selectedIds.value,
      isBusy: () => false,
      hasAsset: () => true,
      setImage,
      compress,
      resize: resizeMany,
      resizeFeedback: () => undefined,
    });
    dialogs.openAnnotation();
    dialogs.openCompression();
    dialogs.openBatchSize();
    const annotation = dialogs.annotation.value!;
    const compressionDraft = dialogs.compression.value!;
    const batch = dialogs.batch.value!;
    const before = serializeWorkbook(f.session.workbook);
    f.selectedIds.value = [f.image.id, f.container.id];
    dialogs.openAnnotation();
    dialogs.openCompression();
    dialogs.openBatchSize();
    expect(dialogs.annotation.value).toBe(annotation);
    expect(dialogs.compression.value).toBe(compressionDraft);
    expect(dialogs.batch.value).toBe(batch);
    expect(annotation.confirm(f.image)).toBe(false);
    expect(await compressionDraft.confirm(compression)).toBe(false);
    expect(batch.confirm(resize)).toBe(false);
    f.selectedIds.value = [f.image.id];
    expect(await compressionDraft.confirm({ ...compression, all: true })).toBe(false);
    expect(batch.confirm({ ...resize, all: true })).toBe(false);
    f.sheet.floatingImages[0] = group(f.image.id);
    expect(annotation.confirm(f.image)).toBe(false);
    expect(await compressionDraft.confirm(compression)).toBe(false);
    expect(batch.confirm(resize)).toBe(false);
    expect(annotation.error.value).toBe("picture.operationFailed");
    expect(compressionDraft.error.value).toBe("picture.operationFailed");
    expect(batch.error.value).toBe("picture.operationFailed");
    expect(setImage).not.toHaveBeenCalled();
    expect(compress).not.toHaveBeenCalled();
    expect(resizeMany).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    f.sheet.floatingImages[0] = f.image;
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
  test("a container never opens a source-only dialog", () => {
    const f = fixture();
    f.selectedIds.value = [f.container.id];
    const hasAsset = vi.fn(() => true);
    const dialogs = usePictureDialogSessions({
      getWorkbook: () => f.session.workbook,
      getSheet: () => f.sheet,
      getGeneration: () => 0,
      getSelectedImage: () => f.container,
      getSelectedIds: () => f.selectedIds.value,
      isBusy: () => false,
      hasAsset,
      setImage: vi.fn(),
      compress: vi.fn(async () => true),
      resize: vi.fn(() => true),
      resizeFeedback: () => undefined,
    });
    dialogs.openAnnotation();
    dialogs.openCompression();
    dialogs.openBatchSize();
    expect(dialogs.annotation.value).toBeUndefined();
    expect(dialogs.compression.value).toBeUndefined();
    expect(dialogs.batch.value).toBeUndefined();
    expect(hasAsset).not.toHaveBeenCalled();
  });
});
describe("standalone toolbar and geometry boundaries", () => {
  test("group roots and mixed targets have no source draft and cannot alter size, appearance or flat membership", () => {
    const f = fixture();
    const tools = usePictureTools({
      getSheet: () => f.sheet,
      selectedIds: f.selectedIds,
      isBusy: () => false,
      execute: f.execute,
    });
    const owner = usePictureToolbarOwner({
      getWorkbook: () => f.session.workbook,
      getSheet: () => f.sheet,
      getGeneration: () => 0,
      getImage: () => f.sheet.floatingImages.find((image) => image.id === f.selectedIds.value[0]),
      getSelectedIds: () => f.selectedIds.value,
      getFrameContext: () => undefined,
      isBusy: () => false,
      resize: tools.resizeOne,
      aspectRatio: tools.setAspectRatio,
      appearance: tools.applyAppearance,
    });
    const oldOwner = owner.value!;
    expect(oldOwner.geometry).toEqual({ width: 200, height: 100, angleDeg: 0 });
    const before = serializeWorkbook(f.session.workbook);
    f.selectedIds.value = [f.image.id, f.container.id];
    expect(owner.value).toBeUndefined();
    expect(oldOwner.resize({ axis: "width", value: 400 })).toBe(false);
    expect(tools.resizeMany(resize)).toBe(false);
    expect(tools.applyAppearance({ opacity: 0.5 })).toBe(false);
    expect(tools.group()).toBe(false);
    f.selectedIds.value = [f.container.id];
    expect(owner.value).toBeUndefined();
    expect(tools.resizeOne(f.container, { axis: "width", value: 400 })).toBe(false);
    expect(tools.setAspectRatio(f.container, true)).toBe(false);
    expect(tools.group(true)).toBe(false);
    expect(getPictureToolGeometry(f.container)).toBeUndefined();
    expect(() => resizePictureTo(f.container, { axis: "width", value: 400 })).toThrow();
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("unselected groups do not block framed numeric or appearance owners", () => {
    const f = fixture();
    const framed = framedPicture();
    f.sheet.floatingImages.push(framed);
    f.selectedIds.value = [framed.id];
    const geometry = createSheetGeometry({ rowCount: 30, columnCount: 30 });
    const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
    const layout = createSheetViewportLayout({
      geometry,
      rows,
      freeze: { rows: 0, columns: 0 },
      bodyScrollPosition: { x: 0, y: 0 },
      viewportSize: { width: 800, height: 500 },
    });
    const context = { layout, metrics: createPictureViewMetrics(f.sheet, geometry, rows) };
    const tools = usePictureTools({
      getSheet: () => f.sheet,
      selectedIds: f.selectedIds,
      getFrameContext: () => context,
      isBusy: () => false,
      execute: f.execute,
    });
    expect(tools.resizeOne(framed, { axis: "width", value: 240 })).toBe(true);
    expect(tools.applyAppearance({ opacity: 0.5 })).toBe(true);
    expect(f.sheet.floatingImages.find((image) => image.id === f.container.id)).toEqual(
      f.container,
    );
    expect(f.session.history.undoStack).toHaveLength(2);
  });
  test("root metadata and layer edits preserve owned children and never synthesize a source or flat group", () => {
    const f = fixture();
    f.selectedIds.value = [f.container.id];
    const tools = usePictureTools({
      getSheet: () => f.sheet,
      selectedIds: f.selectedIds,
      isBusy: () => false,
      execute: f.execute,
    });
    tools.rename(f.container, "Container label");
    const renamed = f.sheet.floatingImages.find((image) => image.id === f.container.id)!;
    tools.toggleVisibility(renamed);
    tools.layer("back");
    const edited = f.sheet.floatingImages[0]!;
    expect(isPictureGroup(edited)).toBe(true);
    if (!isPictureGroup(edited)) throw new Error("Expected the same group root.");
    expect(edited.altText).toBe("Container label");
    expect(edited.hidden).toBe(true);
    expect(edited.frame).toEqual(f.container.frame);
    expect(edited.members).toEqual(f.container.members);
    expect(Object.hasOwn(edited, "assetId")).toBe(false);
    expect(Object.hasOwn(edited, "groupId")).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(3);
  });
});
