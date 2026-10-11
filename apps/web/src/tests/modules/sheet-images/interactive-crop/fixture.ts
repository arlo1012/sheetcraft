import { vi } from "vitest";
import { effectScope, ref, shallowRef } from "vue";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
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
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { ResolvedPictureCrop } from "@sheetcraft/core/picture-crop-edit";
import { createSheetGeometry, type Point } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  createPictureViewMetrics,
  type PictureFrameLayoutContext,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  usePictureCropSession,
  type PictureCropDirection,
} from "../../../../modules/sheet-images/usePictureCropSession";
import { assertPictureCommandSupport } from "../../../../modules/sheet-images/picture-document-support";
import { framedPicture } from "../framed-picture-fixture";
import { pictureGroup } from "../picture-group-fixture";

export const metadata = {
  appearance: { opacity: 0.8, border: { color: "#FF0000", width: 2 } },
  annotations: [
    { kind: "pen" as const, color: "#0000FF", width: 0.02, points: [{ x: 0.1, y: 0.2 }] },
  ],
};
export const leafPath = ["owned-group", "owned-leaf"];

function legacy(id: string, rotation: 0 | 90): LegacyFloatingImage {
  return {
    id,
    assetId: `asset-${id}`,
    altText: `Description ${id}`,
    anchor: { row: 1, column: 1 },
    offsetX: 12,
    offsetY: 18,
    width: 240,
    height: 120,
    groupId: "plain-metadata",
    lockAspectRatio: false,
    transform: {
      ...metadata,
      rotation,
      flipHorizontal: true,
      flipVertical: true,
      crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
    },
  };
}

/** All drafts use real owners and production command/paint preflight before Core history. */
export function fixture(id = "framed", path: PictureGroupPath | null = null) {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  const frame = framedPicture();
  frame.frame.source = { widthRatio: 1.5, heightRatio: 2, offsetXRatio: 0.25, offsetYRatio: -0.1 };
  frame.frame.flipHorizontal = true;
  frame.frame.flipVertical = true;
  frame.transform = metadata;
  frame.groupId = "plain-metadata";
  frame.lockAspectRatio = false;
  const group = pictureGroup();
  const leaf = group.members[0]!;
  if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected real source leaf.");
  leaf.frame.angleDeg = 0;
  leaf.frame.source = {
    widthRatio: 1.75,
    heightRatio: 1.3,
    offsetXRatio: -0.2,
    offsetYRatio: 0.15,
  };
  leaf.frame.flipHorizontal = true;
  leaf.frame.flipVertical = true;
  leaf.transform = metadata;
  leaf.lockAspectRatio = false;
  group.members.push({
    ...leaf,
    id: "sibling",
    altText: "Keep hidden sibling",
    hidden: true,
    frame: { ...leaf.frame, rect: { ...leaf.frame.rect, xRatio: 1.5, widthRatio: 0.5 } },
  });
  const hidden = { ...legacy("hidden", 0), hidden: true };
  const roots = normalizePictureObjectCollection([
    legacy("legacy0", 0),
    group,
    hidden,
    frame,
    legacy("legacy90", 90),
  ]);
  assertPictureCommandSupport(
    createSetSheetFloatingImagesCommand(sheet.id, roots),
    session.workbook,
  );
  sheet.floatingImages = roots;
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 30 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  function layout(scroll = { x: 0, y: 0 }) {
    return createSheetViewportLayout({
      geometry,
      rows,
      freeze: { rows: 0, columns: 0 },
      bodyScrollPosition: scroll,
      viewportSize: { width: 800, height: 500 },
    });
  }
  const context = shallowRef<PictureFrameLayoutContext | undefined>({
    layout: layout(),
    metrics: createPictureViewMetrics(sheet, geometry, rows),
  });
  const activeSheet = shallowRef<Sheet>(sheet);
  const selectedIds = ref([id]);
  const selectedPath = shallowRef<PictureGroupPath | null>(path);
  const generation = ref(0),
    revision = ref(0),
    readOnly = ref(false);
  const failure = vi.fn();
  const commit = (forest: readonly FloatingImage[]) => {
    const command = createSetSheetFloatingImagesCommand(sheet.id, forest);
    assertPictureCommandSupport(command, session.workbook);
    const accepted = executeWorkbookCommand(session, command);
    if (accepted) revision.value++;
    return accepted;
  };
  const execute = vi.fn(commit);
  const scope = effectScope();
  const crop = scope.run(() =>
    usePictureCropSession({
      getSheet: () => activeSheet.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getContext: () => context.value,
      getSelectedIds: () => selectedIds.value,
      getSelectedPath: () => selectedPath.value,
      isReadOnly: () => readOnly.value,
      execute,
      onFailure: failure,
    }),
  )!;
  function root(rootId = selectedIds.value[0]!): FloatingImage {
    const value = sheet.floatingImages.find((entry) => entry.id === rootId);
    if (!value) throw new Error("Expected exact root.");
    return value;
  }
  function framed(rootId = "framed"): FramedFloatingImage {
    const value = root(rootId);
    if (!isFramedPictureObject(value)) throw new Error("Expected canonical frame.");
    return value;
  }
  function owned(): PictureGroup {
    const value = root("owned-group");
    if (!isPictureGroup(value)) throw new Error("Expected real owner.");
    return value;
  }
  function ownedLeaf(): GroupedPicture {
    const value = findPictureGroupNode(owned(), leafPath)?.node;
    if (value?.kind !== "grouped-picture-v1") throw new Error("Expected real owned source.");
    return value;
  }
  function gesture(direction: PictureCropDirection = "source", delta: Point = { x: 12, y: -8 }) {
    const snapshot = crop.captureGesture();
    if (!snapshot || !crop.previewGesture(snapshot, direction, delta))
      throw new Error("Expected current crop gesture.");
    crop.finishGesture(snapshot);
    return snapshot;
  }
  return {
    session,
    sheet,
    crop,
    context,
    activeSheet,
    selectedIds,
    selectedPath,
    generation,
    revision,
    readOnly,
    execute,
    commit,
    failure,
    scope,
    geometry,
    root,
    framed,
    owned,
    ownedLeaf,
    gesture,
    scroll: (point: Point) => {
      const current = context.value!;
      context.value = { ...current, layout: layout(point) };
    },
  };
}

export function physicalSource(crop: ResolvedPictureCrop) {
  const { layout, source } = crop;
  return {
    center: pictureFrameLocalToWorld(layout.rect, layout.angleDeg, {
      x: layout.rect.width * (0.5 + source.offsetXRatio),
      y: layout.rect.height * (0.5 + source.offsetYRatio),
    }),
    width: layout.rect.width * source.widthRatio,
    height: layout.rect.height * source.heightRatio,
  };
}
