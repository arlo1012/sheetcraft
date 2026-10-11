import { vi } from "vitest";
import { effectScope } from "vue";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSetFloatingImageCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  getActiveSheet,
  type FloatingImage,
  type LegacyFloatingImage,
  type Sheet,
} from "@sheetcraft/core/workbook";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
  type FramedFloatingImage,
} from "@sheetcraft/core/picture-object";
import {
  findPictureGroupNode,
  isPictureGroup,
  type GroupedPicture,
  type PictureGroup,
  type PictureGroupPath,
} from "@sheetcraft/core/picture-group";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { useSheetImageActions } from "../../../../modules/sheet-images/useSheetImageActions";
import { createMemoryImageAssetStore } from "../../../../modules/image-assets/imageAssetStore";
import { framedPicture } from "../framed-picture-fixture";
import { pictureGroup } from "../picture-group-fixture";

export const file = new File(["synthetic source"], "new-private-path.png", { type: "image/png" });
export const asset = {
  id: "replacement",
  width: 180,
  height: 360,
  mimeType: "image/png",
  blob: file,
};
export const oldAsset = { ...asset, id: "old", width: 800, height: 400 };
export const source = { widthRatio: 3.75, heightRatio: 2.5, offsetXRatio: 0.2, offsetYRatio: 0.1 };
export const metadata = {
  appearance: { border: { color: "#FF0000", width: 2 }, brightness: 0.6 },
  annotations: [
    { kind: "pen" as const, color: "#0000FF", width: 0.02, points: [{ x: 0.1, y: 0.2 }] },
  ],
};
export function legacy(): LegacyFloatingImage {
  return {
    id: "legacy",
    assetId: "old",
    altText: "Description",
    anchor: { row: 2, column: 3 },
    offsetX: 12,
    offsetY: 18,
    width: 120,
    height: 80,
    transform: {
      ...metadata,
      rotation: 90,
      flipHorizontal: true,
      crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
    },
    lockAspectRatio: false,
  };
}
export function contextFor(sheet: Sheet): PictureFrameLayoutContext {
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 30 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  return {
    metrics: createPictureSheetMetrics(sheet),
    layout: createSheetViewportLayout({
      geometry,
      rows,
      viewportSize: { width: 800, height: 500 },
    }),
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  const framed = framedPicture();
  framed.assetId = "old";
  framed.altText = "Description";
  framed.frame.source = { ...source };
  framed.frame.flipHorizontal = true;
  framed.transform = metadata;
  framed.lockAspectRatio = false;
  const group = pictureGroup();
  group.frame.anchor = { mode: "fixed", x: 40, y: 10, size: { width: 120, height: 80 } };
  const leaf = group.members[0]! as GroupedPicture;
  leaf.assetId = "old";
  leaf.altText = "Owned description";
  leaf.frame.source = { ...source };
  leaf.frame.flipVertical = true;
  leaf.transform = metadata;
  leaf.lockAspectRatio = false;
  group.members.push({
    ...leaf,
    id: "sibling",
    altText: "Sibling description",
    frame: { ...leaf.frame, rect: { ...leaf.frame.rect, xRatio: 1.5 } },
  });
  sheet.floatingImages = normalizePictureObjectCollection([framed, group, legacy()]);
  let active = sheet;
  let generation = 0;
  let ids = [framed.id];
  let path: PictureGroupPath | null = null;
  let context: PictureFrameLayoutContext | undefined = contextFor(sheet);
  let refused = false;
  const store = createMemoryImageAssetStore();
  const put = vi.spyOn(store, "put");
  const execute = vi.fn((command: WorkbookCommand) =>
    refused ? false : executeWorkbookCommand(session, command),
  );
  const setFloatingImage = vi.fn((image: FloatingImage, sheetId: string) =>
    execute(createSetFloatingImageCommand(sheetId, image)),
  );
  const flush = vi.fn(() => true);
  const scope = effectScope();
  const actions = scope.run(() =>
    useSheetImageActions({
      assetStore: store,
      execute,
      getWorkbook: () => session.workbook,
      getSheet: () => active,
      getGeneration: () => generation,
      getAddress: () => ({ row: 0, column: 0 }),
      getSelectedIds: () => ids,
      getSelectedPath: () => path,
      getFrameContext: () => context,
      flushPendingEdits: flush,
      setFloatingImage,
      setCellImage: vi.fn(),
      convertCellImageToFloating: vi.fn(),
    }),
  )!;
  function select(rootId: string, memberPath: PictureGroupPath | null = null) {
    ids = [rootId];
    path = memberPath;
  }
  function currentFramed(): FramedFloatingImage {
    const image = sheet.floatingImages.find((entry) => entry.id === framed.id)!;
    if (!isFramedPictureObject(image)) throw new Error("Expected framed root.");
    return image;
  }
  function currentGroup(): PictureGroup {
    const image = sheet.floatingImages.find((entry) => entry.id === group.id)!;
    if (!isPictureGroup(image)) throw new Error("Expected real owned group.");
    return image;
  }
  const leafPath = [group.id, leaf.id];
  function currentLeaf(memberPath: PictureGroupPath = leafPath): GroupedPicture {
    const node = findPictureGroupNode(currentGroup(), memberPath)?.node;
    if (node?.kind !== "grouped-picture-v1") throw new Error("Expected exact owned leaf.");
    return node;
  }
  return {
    session,
    sheet,
    store,
    put,
    actions,
    execute,
    setFloatingImage,
    flush,
    scope,
    leafPath,
    select,
    setSelectedIds: (value: string[]) => {
      ids = value;
    },
    currentFramed,
    currentGroup,
    currentLeaf,
    selectOwned: () => select(group.id, leafPath),
    setContext: (value: PictureFrameLayoutContext | undefined) => {
      context = value;
    },
    getContext: () => context,
    replaceSheet: (value: Sheet) => {
      active = value;
      session.workbook.sheets.set(sheet.id, value);
    },
    changeGeneration: () => {
      generation += 1;
    },
    refuse: () => {
      refused = true;
    },
  };
}
