import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  isFramedPictureObject,
  isLegacyPictureObject,
  normalizePictureObjectCollection,
} from "@sheetcraft/core/picture-object";
import { findPictureGroupNode, isPictureGroup } from "@sheetcraft/core/picture-group";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { prepareImageAsset } from "../../../../modules/image-assets/prepareImageAsset";
import { asset, deferred, file, fixture, metadata, oldAsset } from "./replacement-fixture";

vi.mock("../../../../modules/image-assets/prepareImageAsset", () => ({
  prepareImageAsset: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(prepareImageAsset).mockReset().mockResolvedValue(asset);
});

describe("source replacement semantics and history", () => {
  test.each(["framed", "owned"] as const)(
    "%s source uses centered cover and preserves geometry, metadata, siblings and undo assets",
    async (kind) => {
      const f = fixture();
      if (kind === "owned") f.selectOwned();
      await f.store.put(oldAsset);
      f.put.mockClear();
      const before = serializeWorkbook(f.session.workbook);
      const rootId = kind === "owned" ? f.leafPath[0]! : "framed";
      const original = kind === "owned" ? f.currentLeaf() : f.currentFramed();
      const sibling = structuredClone(f.currentLeaf([f.leafPath[0]!, "sibling"]));
      const frame = structuredClone(original.frame);
      await f.actions.insertFile(file, "floating", undefined, rootId);
      const current = kind === "owned" ? f.currentLeaf() : f.currentFramed();
      expect(current).toEqual({
        ...original,
        assetId: asset.id,
        frame: {
          ...frame,
          source: { widthRatio: 1, heightRatio: 3, offsetXRatio: 0, offsetYRatio: 0 },
        },
      });
      expect(current.transform).toEqual(metadata);
      expect(f.currentLeaf([f.leafPath[0]!, "sibling"])).toEqual(sibling);
      expect(f.currentGroup()).not.toHaveProperty("assetId");
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.execute.mock.calls[0]![0].type).toBe("setSheetFloatingImages");
      expect(f.setFloatingImage).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(f.session.workbook);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(await f.store.get(oldAsset.id)).toEqual(oldAsset);
      expect(await f.store.get(asset.id)).toEqual(asset);
      redoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.session.workbook)).toEqual(after);
      f.scope.stop();
    },
  );
  test.each(["framed", "owned"] as const)(
    "%s pending decode retains the latest geometry and descriptions/styles",
    async (kind) => {
      const f = fixture();
      const waiting = deferred<typeof asset>();
      vi.mocked(prepareImageAsset).mockReturnValue(waiting.promise);
      if (kind === "owned") f.selectOwned();
      const rootId = kind === "owned" ? f.leafPath[0]! : "framed";
      const pending = f.actions.insertFile(file, "floating", undefined, rootId);
      const planned = normalizePictureObjectCollection(f.sheet.floatingImages);
      const root = planned.find((entry) => entry.id === rootId)!;
      if (!isPictureGroup(root) && !isFramedPictureObject(root))
        throw new Error("Expected a framed owner.");
      const current = isPictureGroup(root) ? findPictureGroupNode(root, f.leafPath)?.node : root;
      if (!current || ("kind" in current && current.kind !== "grouped-picture-v1"))
        throw new Error("Expected a real source.");
      current.altText = "New user description";
      current.lockAspectRatio = true;
      current.transform = { appearance: { shadow: "soft" }, annotations: metadata.annotations };
      root.frame.anchor = { mode: "fixed", x: 80, y: 50, size: { width: 240, height: 80 } };
      current.frame.angleDeg = 91;
      executeWorkbookCommand(f.session, createSetSheetFloatingImagesCommand(f.sheet.id, planned));
      const beforeReplacement = serializeWorkbook(f.session.workbook);
      const geometry =
        kind === "owned"
          ? resolvePictureGroup(f.currentGroup(), f.getContext()!.metrics).members[0]!.layout
          : resolvePictureFrame(f.currentFramed().frame, f.getContext()!.metrics);
      waiting.resolve(asset);
      await pending;
      const replaced = kind === "owned" ? f.currentLeaf() : f.currentFramed();
      expect(replaced.altText).toBe("New user description");
      expect(replaced.lockAspectRatio).toBe(true);
      expect(replaced.transform).toEqual(current.transform);
      expect(replaced.frame.source).toEqual({
        widthRatio: 1,
        heightRatio: 6,
        offsetXRatio: 0,
        offsetYRatio: 0,
      });
      const after =
        kind === "owned"
          ? resolvePictureGroup(f.currentGroup(), f.getContext()!.metrics).members[0]!.layout
          : resolvePictureFrame(f.currentFramed().frame, f.getContext()!.metrics);
      expect(after?.rect).toEqual(geometry?.rect);
      expect(after?.angleDeg).toEqual(geometry?.angleDeg);
      expect(f.session.history.undoStack).toHaveLength(2);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.session.workbook)).toEqual(beforeReplacement);
      f.scope.stop();
    },
  );
  test.each([0, 90, 180, 270] as const)(
    "legacy %s-degree replacement keeps its latest display box, flips, descriptions and style",
    async (rotation) => {
      const f = fixture();
      f.select("legacy");
      const current = f.sheet.floatingImages.find((image) => image.id === "legacy")!;
      if (!isLegacyPictureObject(current)) throw new Error("Expected legacy source.");
      current.transform!.rotation = rotation;
      current.transform!.flipVertical = true;
      const waiting = deferred<typeof asset>();
      vi.mocked(prepareImageAsset).mockReturnValue(waiting.promise);
      const pending = f.actions.insertFile(file, "floating", undefined, current.id);
      current.width = 240;
      current.height = 80;
      current.offsetX = 26;
      current.altText = "Latest legacy description";
      waiting.resolve(asset);
      await pending;
      const next = f.sheet.floatingImages.find((image) => image.id === "legacy")!;
      if (!isLegacyPictureObject(next))
        throw new Error("Legacy replacement must retain its representation.");
      expect(next).toMatchObject({
        assetId: asset.id,
        altText: current.altText,
        width: 240,
        height: 80,
        offsetX: 26,
        offsetY: 18,
        anchor: current.anchor,
      });
      expect(next.transform).toMatchObject({
        ...metadata,
        flipHorizontal: true,
        flipVertical: true,
        ...(rotation ? { rotation } : {}),
      });
      const quarter = rotation === 90 || rotation === 270;
      expect(next.transform?.crop).toEqual(
        quarter
          ? { x: (1 - 2 / 3) / 2, y: 0, width: 2 / 3, height: 1 }
          : { x: 0, y: 5 / 12, width: 1, height: 1 / 6 },
      );
      expect(f.session.history.undoStack).toHaveLength(1);
      f.scope.stop();
    },
  );
  test.each(["", "Custom description"])(
    "preserves description %j without leaking the replacement filename",
    async (description) => {
      const f = fixture();
      f.currentFramed().altText = description;
      await f.actions.insertFile(file, "floating", undefined, "framed");
      expect(f.currentFramed().altText).toBe(description);
      f.scope.stop();
    },
  );
  test("same asset with a non-cover crop is a real crop reset; same cover is an informational no-op", async () => {
    const f = fixture();
    vi.mocked(prepareImageAsset).mockResolvedValue({ ...asset, id: "old" });
    await f.actions.insertFile(file, "floating", undefined, "framed");
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.currentFramed().frame.source).toEqual({
      widthRatio: 1,
      heightRatio: 3,
      offsetXRatio: 0,
      offsetYRatio: 0,
    });
    expect(f.actions.feedback.value).toBe("image.inserted");
    f.execute.mockClear();
    await f.actions.insertFile(file, "floating", undefined, "framed");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.actions.feedback.value).toBe("image.unchanged");
    f.scope.stop();
  });
});
