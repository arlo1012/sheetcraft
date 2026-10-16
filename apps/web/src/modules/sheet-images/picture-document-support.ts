import { isPictureGroup } from "@sheetcraft/core";
import { isFramedCellImage, normalizeCellImage } from "@sheetcraft/core/cell-picture-frame";
import type { CellContent } from "@sheetcraft/core/formula";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
  type StandalonePictureObject,
} from "@sheetcraft/core/picture-object";
import {
  DEFAULT_COLUMN_WIDTH,
  getDefaultRowHeight,
  type FloatingImage,
  type LegacyFloatingImage,
  type Sheet,
  type SheetSparseState,
  type Workbook,
} from "@sheetcraft/core/workbook";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeWorkbook,
} from "@sheetcraft/core/serialization";
import { assertPictureObjectsForSheet } from "@sheetcraft/core/picture-object-sheet";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { getDrawingThemeEffects } from "./drawing-theme-effects";
import { assertPicturePaintSupport } from "./picture-paint-effects";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { captureCellPictureSourcePresentation } from "./cell-picture-presentation";
import { planPictureSourcePresentation } from "./picture-source-presentation";

/** Pure content admission shares the source painter's geometry and appearance contract. */
function assertCellPictureSupport(
  content: CellContent | null | undefined,
  theme: WorkbookTheme,
): void {
  if (content?.kind !== "image") return;
  const image = normalizeCellImage(content.image);
  if (isFramedCellImage(image))
    planPictureSourcePresentation(captureCellPictureSourcePresentation(image), theme);
}

export class UnsupportedPictureDocumentError extends Error {
  readonly code = "unsupported-picture-frame";
  constructor(
    readonly sheetId: string,
    readonly imageIds: readonly string[],
  ) {
    super(
      `This consumer does not support frame-aware pictures or owned groups (sheet ${sheetId}, pictures ${imageIds.join(", ")}).`,
    );
    this.name = "UnsupportedPictureDocumentError";
  }
}

/** Internal editing/recovery supports genuine owned trees; legacy-only endpoints remain separate. */
export function assertWorkbookPictureSupport(workbook: Workbook): void {
  const effects = getDrawingThemeEffects(workbook.theme);
  for (const sheet of workbook.sheets.values()) {
    for (const cell of sheet.cells.values()) assertCellPictureSupport(cell.content, workbook.theme);
    const roots = normalizePictureObjectCollection(sheet.floatingImages);
    assertPictureObjectsForSheet(roots, sheet);
    assertPicturePaintSupport(
      roots,
      effects,
      roots.some((image) => isFramedPictureObject(image) || isPictureGroup(image))
        ? createPictureSheetMetrics(sheet)
        : undefined,
    );
  }
}

/** Legacy consumers must reject the complete collection before side effects. */
export function requireLegacyPictures(
  images: readonly FloatingImage[],
): readonly LegacyFloatingImage[] {
  if (images.some((image) => isFramedPictureObject(image) || isPictureGroup(image)))
    throw new UnsupportedPictureDocumentError(
      "picture-consumer",
      images
        .filter((image) => isFramedPictureObject(image) || isPictureGroup(image))
        .map((image) => image.id),
    );
  return images as readonly LegacyFloatingImage[];
}
export function requireLegacyPicture(image: FloatingImage): LegacyFloatingImage {
  return requireLegacyPictures([image])[0]!;
}

/** Preflight complete proposed trees before history, assets or worksheet state changes. */
export function assertPictureCommandSupport(command: WorkbookCommand, workbook: Workbook): void {
  const theme = command.type === "setWorkbookTheme" ? command.theme : workbook.theme;
  const effects = getDrawingThemeEffects(theme);
  function check(images: readonly FloatingImage[], sheet?: Sheet): void {
    const roots = normalizePictureObjectCollection(images);
    if (sheet) assertPictureObjectsForSheet(roots, sheet);
    assertPicturePaintSupport(
      roots,
      effects,
      sheet && roots.some((image) => isFramedPictureObject(image) || isPictureGroup(image))
        ? createPictureSheetMetrics(sheet)
        : undefined,
    );
  }
  function checkState(sheetId: string, state: SheetSparseState): void {
    for (const cell of state.cells) assertCellPictureSupport(cell.content, theme);
    const sheet = workbook.sheets.get(sheetId);
    check(
      state.floatingImages,
      sheet
        ? {
            ...sheet,
            rowHeights: new Map(state.rowHeights.map(({ index, size }) => [index, size])),
            defaultRowHeight: state.defaultRowHeight,
            columnWidths: new Map(state.columnWidths.map(({ index, size }) => [index, size])),
            hiddenRows: new Set(state.hiddenRows),
            hiddenColumns: new Set(state.hiddenColumns),
            defaultColumnWidth: state.defaultColumnWidth ?? DEFAULT_COLUMN_WIDTH,
          }
        : undefined,
    );
  }
  function checkProjectedWorkbook(): void {
    // Let Core project structural reflow on a detached snapshot rather than duplicate
    // its axis/restore algorithms or accidentally validate against outgoing metrics.
    const proposed = deserializeWorkbook(serializeWorkbook(workbook));
    applyWorkbookCommand(proposed, command, { fromHistory: true });
    assertWorkbookPictureSupport(proposed);
  }
  const sheet = "sheetId" in command ? workbook.sheets.get(command.sheetId) : undefined;
  switch (command.type) {
    case "setCellContents":
      for (const change of command.changes) assertCellPictureSupport(change.content, theme);
      break;
    case "restoreCellStyles":
      for (const change of command.changes) assertCellPictureSupport(change.content, theme);
      break;
    case "setWorkbookTheme":
      for (const candidate of workbook.sheets.values()) {
        for (const cell of candidate.cells.values()) assertCellPictureSupport(cell.content, theme);
        check(candidate.floatingImages, candidate);
      }
      break;
    case "setFloatingImage": {
      const images = sheet?.floatingImages.slice() ?? [];
      const index = images.findIndex((image) => image.id === command.image.id);
      if (index < 0) images.push(command.image);
      else images[index] = command.image;
      check(images, sheet);
      break;
    }
    case "restoreFloatingImageToCell":
      assertCellPictureSupport(command.content, theme);
      requireLegacyPicture(command.image);
      check([...(sheet?.floatingImages ?? []), command.image], sheet);
      break;
    case "convertFloatingImageToCell":
    case "convertCellImageToFloating":
    case "restorePictureCellConversion":
      checkProjectedWorkbook();
      break;
    case "setSheetFloatingImages":
      check(command.images, sheet);
      break;
    case "restoreSheetDimensionState":
      if (sheet) {
        const dimensions = new Map(command.dimensions.map(({ index, size }) => [index, size]));
        check(command.floatingImageState ?? sheet.floatingImages, {
          ...sheet,
          ...(command.axis === "row"
            ? {
                rowHeights: dimensions,
                defaultRowHeight: command.defaultRowHeight ?? getDefaultRowHeight(sheet),
                hiddenRows: new Set(command.hiddenIndexes),
              }
            : {
                columnWidths: dimensions,
                hiddenColumns: new Set(command.hiddenIndexes),
                defaultColumnWidth: command.defaultColumnWidth ?? DEFAULT_COLUMN_WIDTH,
              }),
        });
      } else check(command.floatingImageState ?? []);
      break;
    case "restoreCellShift":
      checkState(command.sheetId, command.state);
      break;
    case "restoreSheetState":
      if ("state" in command) checkState(command.sheetId, command.state);
      else checkProjectedWorkbook();
      break;
    case "restoreTableTransaction":
      for (const state of command.states) checkState(state.sheetId, state.state);
      break;
    case "addSheet": {
      const added = deserializeSheet(command.sheet);
      for (const cell of added.cells.values()) assertCellPictureSupport(cell.content, theme);
      check(added.floatingImages, added);
      break;
    }
    case "batchDeleteSheetAxes": {
      const proposed = deserializeWorkbook(serializeWorkbook(workbook));
      for (const nested of command.commands) {
        assertPictureCommandSupport(nested, proposed);
        applyWorkbookCommand(proposed, nested, { fromHistory: true });
        assertWorkbookPictureSupport(proposed);
      }
      break;
    }
    case "resizeSheetDimension":
    case "resizeSheetDimensions":
    case "setSheetDimensionSizes":
    case "setSheetDimensionHidden":
    case "resetSheetDimensionSizes":
    case "setSheetDefaultColumnWidth":
    case "insertSheetAxis":
    case "deleteSheetAxis":
    case "moveSheetAxis":
      if (
        sheet?.floatingImages.some((image) => isFramedPictureObject(image) || isPictureGroup(image))
      )
        checkProjectedWorkbook();
      break;
  }
}

/** Internal snapshots do not implicitly enable paused external group packaging. */
export function assertExternalPictureGroupSupport(workbook: Workbook): void {
  for (const sheet of workbook.sheets.values()) {
    const ids = sheet.floatingImages
      .filter((image) => isPictureGroup(image) || isFramedPictureObject(image))
      .map((image) => image.id);
    for (const [key, cell] of sheet.cells)
      if (cell.content?.kind === "image" && Object.hasOwn(cell.content.image, "frame"))
        ids.push(`cell:${key}`);
    if (ids.length) throw new UnsupportedPictureDocumentError(sheet.id, ids);
  }
}

/** Prepared single-picture consumers have no source/asset contract for containers. */
export function requireStandalonePictures(
  images: readonly FloatingImage[],
): readonly StandalonePictureObject[] {
  const ids = images.filter(isPictureGroup).map((group) => group.id);
  if (ids.length) throw new UnsupportedPictureDocumentError("picture-container-consumer", ids);
  return images as readonly StandalonePictureObject[];
}
export function requireStandalonePicture(image: FloatingImage): StandalonePictureObject {
  return requireStandalonePictures([image])[0]!;
}
