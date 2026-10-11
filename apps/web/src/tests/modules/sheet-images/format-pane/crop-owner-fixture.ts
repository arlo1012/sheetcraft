import { vi } from "vitest";
import { effectScope, ref, shallowRef } from "vue";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import {
  normalizePictureObjectCollection,
  isFramedPictureObject,
} from "@sheetcraft/core/picture-object";
import { isPictureGroup, type PictureGroupPath } from "@sheetcraft/core/picture-group";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { getActiveSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { assertPictureCommandSupport } from "../../../../modules/sheet-images/picture-document-support";
import { useOwnedPictureFormatPane } from "../../../../modules/sheet-images/useOwnedPictureFormatPane";
import type { PictureIntrinsicSize } from "../../../../modules/sheet-images/usePictureIntrinsicSize";
import { resolveOwnedPictureNode } from "../../../../modules/sheet-images/picture-group-interaction";
import {
  createPictureFormatFieldIntent,
  type PictureFormatField,
  type PictureFormatReset,
} from "../../../../modules/sheet-images/picture-format-pane-model";
import { pictureGroup } from "../picture-group-fixture";
import { framedPicture } from "../framed-picture-fixture";

export function cropOwnerFixture(
  id = "framed",
  path: PictureGroupPath | null = null,
  initialIntrinsic?: PictureIntrinsicSize,
) {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook),
    frame = framedPicture(),
    group = pictureGroup();
  const firstLeaf = group.members[0]!;
  if (firstLeaf.kind !== "grouped-picture-v1") throw new Error("Expected source leaf.");
  group.members.push({
    ...firstLeaf,
    id: "sibling",
    frame: { ...firstLeaf.frame, rect: { ...firstLeaf.frame.rect, xRatio: 0.5, widthRatio: 0.5 } },
  });
  frame.frame.source = { widthRatio: 1.5, heightRatio: 2, offsetXRatio: 0.25, offsetYRatio: -0.1 };
  frame.frame.flipHorizontal = true;
  frame.transform = { appearance: { border: { color: "#ff0000", width: 2 }, grayscale: 1 } };
  sheet.floatingImages = normalizePictureObjectCollection([
    group,
    frame,
    {
      id: "legacy",
      assetId: "old",
      altText: "Keep description",
      anchor: { row: 1, column: 1 },
      offsetX: 2,
      offsetY: 3,
      width: 240,
      height: 120,
      transform: {
        rotation: 90,
        flipVertical: true,
        crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
        appearance: { opacity: 0.8 },
      },
    },
  ]);
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
  const selectedIds = ref([id]),
    selectedPath = shallowRef(path),
    generation = ref(0),
    revision = ref(0),
    busy = ref(false),
    open = ref(true);
  const intrinsic = shallowRef<PictureIntrinsicSize | undefined>(initialIntrinsic);
  let refusal = false,
    exception = false;
  const execute = vi.fn((forest: readonly FloatingImage[]) => {
    if (exception) throw new Error("Owner failure");
    if (refusal) return false;
    const command = createSetSheetFloatingImagesCommand(sheet.id, forest);
    assertPictureCommandSupport(command, session.workbook);
    const accepted = executeWorkbookCommand(session, command);
    if (accepted) revision.value++;
    return accepted;
  });
  const scope = effectScope();
  const pane = scope.run(() =>
    useOwnedPictureFormatPane({
      getWorkbook: () => session.workbook,
      getSheet: () => sheet,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getContext: () => context.value,
      getSelectedPath: () => selectedPath.value,
      getSelectedIds: () => selectedIds.value,
      isBusy: () => busy.value,
      isOpen: () => open.value,
      getIntrinsicSize: () => intrinsic.value,
      execute,
    }),
  )!;
  function field<F extends PictureFormatField>(
    key: F,
    value: Parameters<typeof createPictureFormatFieldIntent<F>>[2],
  ) {
    return createPictureFormatFieldIntent(
      pane.snapshot.value!,
      key,
      value,
      `field-${revision.value}-${key}`,
    );
  }
  function reset(type: PictureFormatReset) {
    const snapshot = pane.snapshot.value!;
    return {
      type,
      owner: snapshot.owner,
      baseRevision: snapshot.revision,
      intentId: `reset-${revision.value}-${type}`,
    };
  }
  function resolved() {
    const root = sheet.floatingImages.find((root) => root.id === selectedIds.value[0])!;
    if (isPictureGroup(root))
      return resolveOwnedPictureNode(sheet.floatingImages, selectedPath.value!, context.value)!
        .layout!;
    if (!isFramedPictureObject(root)) throw new Error("Expected promoted picture.");
    return resolvePictureFrame(root.frame, context.value.metrics);
  }
  return {
    session,
    sheet,
    context,
    pane,
    selectedIds,
    selectedPath,
    generation,
    revision,
    busy,
    open,
    intrinsic,
    execute,
    scope,
    field,
    reset,
    resolved,
    refuse: () => {
      refusal = true;
    },
    throw: () => {
      exception = true;
    },
  };
}
