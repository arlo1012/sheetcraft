import { ref } from "vue";
import { vi } from "vitest";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { pictureFrameFromLegacy, resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { isPictureGroup, type PictureGroup } from "@sheetcraft/core/picture-group";
import { groupPictureRoots } from "@sheetcraft/core/picture-group-planning";
import {
  resolvePictureGroup,
  type ResolvedPictureGroupNode,
} from "@sheetcraft/core/picture-group-layout";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
  type PictureObject,
} from "@sheetcraft/core/picture-object";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { getActiveSheet, type LegacyFloatingImage, type Sheet } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { usePictureTools } from "../../../../modules/sheet-images/usePictureTools";
import { framedPicture } from "../framed-picture-fixture";

export function legacy(id: string, x = 10): LegacyFloatingImage {
  return {
    id,
    assetId: `asset-${id}`,
    altText: id,
    anchor: { row: 0, column: 0 },
    offsetX: x,
    offsetY: 10,
    width: 80,
    height: 40,
  };
}
export function framed(id = "framed"): PictureObject {
  return { ...framedPicture(), id, assetId: `asset-${id}` };
}
export function contextFor(sheet: Sheet): PictureFrameLayoutContext {
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 30 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  return {
    metrics: createPictureSheetMetrics(sheet),
    layout: createSheetViewportLayout({
      geometry,
      rows,
      freeze: { rows: 0, columns: 0 },
      bodyScrollPosition: { x: 0, y: 0 },
      viewportSize: { width: 800, height: 500 },
    }),
  };
}
export function requireGroup(root: PictureObject | undefined): PictureGroup {
  if (!root || !isPictureGroup(root)) throw new Error("Expected an owned root group.");
  return root;
}
export function fixture(images: PictureObject[] = [legacy("a"), framed("b"), legacy("c", 400)]) {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  sheet.floatingImages = normalizePictureObjectCollection(images);
  const selectedIds = ref(images.slice(0, 2).map((image) => image.id));
  const context = contextFor(sheet);
  let currentSheet = sheet;
  let currentContext: PictureFrameLayoutContext | undefined = context;
  let getContext = () => currentContext;
  let busy = false;
  const execute = vi.fn((command: WorkbookCommand): unknown =>
    executeWorkbookCommand(session, command),
  );
  const tools = usePictureTools({
    getSheet: () => currentSheet,
    selectedIds,
    isBusy: () => busy,
    execute,
    getFrameContext: () => getContext(),
  });
  return {
    session,
    sheet,
    selectedIds,
    context,
    execute,
    tools,
    ids: () => sheet.floatingImages.map((image) => image.id),
    setSheet: (value: Sheet) => {
      currentSheet = value;
    },
    setContext: (value: PictureFrameLayoutContext | undefined) => {
      currentContext = value;
    },
    getContextWith: (value: () => PictureFrameLayoutContext | undefined) => {
      getContext = value;
    },
    setBusy: () => {
      busy = true;
    },
    forest: () => normalizePictureObjectCollection(sheet.floatingImages),
    owned: (ids = selectedIds.value, id = "owned") => {
      sheet.floatingImages = groupPictureRoots(
        sheet.floatingImages,
        ids,
        { id, altText: id },
        context.metrics,
      );
      selectedIds.value = [id];
      return requireGroup(sheet.floatingImages.find((root) => root.id === id));
    },
  };
}
export function geometries(roots: readonly PictureObject[], context: PictureFrameLayoutContext) {
  const result = new Map<
    string,
    { rect: { x: number; y: number; width: number; height: number }; angleDeg: number }
  >();
  function visit(node: ResolvedPictureGroupNode): void {
    if (node.layout)
      result.set(node.node.id, { rect: node.layout.rect, angleDeg: node.layout.angleDeg });
    if ("members" in node) node.members.forEach(visit);
  }
  for (const root of roots) {
    if (isPictureGroup(root)) visit(resolvePictureGroup(root, context.metrics));
    else {
      const resolved = resolvePictureFrame(
        isFramedPictureObject(root) ? root.frame : pictureFrameFromLegacy(root, context.metrics),
        context.metrics,
      );
      result.set(root.id, { rect: resolved.rect, angleDeg: resolved.angleDeg });
    }
  }
  return result;
}

export function leaf(
  id: string,
  xRatio = 0,
  yRatio = 0,
): import("@sheetcraft/core/picture-group").GroupedPicture {
  return {
    kind: "grouped-picture-v1",
    id,
    assetId: "shared-asset",
    altText: `Alt ${id}`,
    frame: {
      kind: "group-member-frame-v1",
      rect: { xRatio, yRatio, widthRatio: 0.2, heightRatio: 0.2 },
      angleDeg: 17,
      source: { widthRatio: 1.3, heightRatio: 0.8, offsetXRatio: -0.15, offsetYRatio: 0.2 },
      flipHorizontal: true,
    },
    transform: {
      appearance: { opacity: 0.8 },
      annotations: [{ kind: "pen", points: [{ x: 0.1, y: 0.2 }], color: "#123456", width: 0.01 }],
    },
  };
}
export function tree(): PictureGroup {
  return {
    kind: "picture-group-v1",
    id: "root",
    altText: "Root",
    frame: {
      kind: "group-frame-v1",
      anchor: { mode: "fixed", x: 100, y: 100, size: { width: 400, height: 200 } },
      angleDeg: 31,
    },
    members: [
      {
        kind: "grouped-group-v1",
        id: "inner",
        altText: "Inner",
        hidden: true,
        frame: {
          kind: "group-local-frame-v1",
          rect: { xRatio: 0, yRatio: 0, widthRatio: 0.8, heightRatio: 0.5 },
          angleDeg: 23,
        },
        members: [leaf("a"), leaf("b", 0.7, 0.6)],
      },
      leaf("c", 0.65, 0.7),
    ],
  };
}
export function expectSameGeometry(
  actual: ReturnType<typeof geometries>,
  expected: ReturnType<typeof geometries>,
  ids: string[],
  expect: typeof import("vitest").expect,
): void {
  for (const id of ids) {
    expect(actual.get(id)?.angleDeg).toBeCloseTo(expected.get(id)!.angleDeg, 10);
    for (const key of ["x", "y", "width", "height"] as const)
      expect(actual.get(id)?.rect[key]).toBeCloseTo(expected.get(id)!.rect[key], 8);
  }
}
