import { isPictureGroup } from "@sheetcraft/core";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import {
  isFramedPictureObject,
  type StandalonePictureObject,
} from "@sheetcraft/core/picture-object";
import type { FloatingImage, LegacyFloatingImage, Workbook } from "@sheetcraft/core/workbook";

export class UnsupportedPictureDocumentError extends Error {
  readonly code = "unsupported-picture-frame";
  constructor(
    readonly sheetId: string,
    readonly imageIds: readonly string[],
  ) {
    super(
      `Frame-aware picture and owned group editing is not yet enabled (sheet ${sheetId}, pictures ${imageIds.join(", ")}).`,
    );
    this.name = "UnsupportedPictureDocumentError";
  }
}

/** Temporary live-document boundary while model and view consumers are integrated. */
export function assertWorkbookPictureSupport(workbook: Workbook): void {
  for (const sheet of workbook.sheets.values()) {
    const ids = sheet.floatingImages
      .filter((image) => isFramedPictureObject(image) || isPictureGroup(image))
      .map((image) => image.id);
    if (ids.length) throw new UnsupportedPictureDocumentError(sheet.id, ids);
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

/** Close every owned live-command ingress before Core can persist a newer picture. */
export function assertPictureCommandSupport(command: WorkbookCommand): void {
  switch (command.type) {
    case "setFloatingImage":
    case "restoreFloatingImageToCell":
      requireLegacyPicture(command.image);
      break;
    case "setSheetFloatingImages":
      requireLegacyPictures(command.images);
      break;
    case "restoreSheetDimensionState":
      requireLegacyPictures(command.floatingImageState ?? []);
      break;
    case "restoreCellShift":
      requireLegacyPictures(command.state.floatingImages);
      break;
    case "restoreSheetState":
      requireLegacyPictures(
        "state" in command
          ? command.state.floatingImages
          : (command.slice.floatingImageState ?? []),
      );
      break;
    case "restoreTableTransaction":
      for (const state of command.states) requireLegacyPictures(state.state.floatingImages);
      break;
    case "addSheet":
      requireLegacyPictures(command.sheet.floatingImages);
      break;
    case "batchDeleteSheetAxes":
      for (const nested of command.commands) assertPictureCommandSupport(nested);
      break;
  }
}

/** Internal snapshots do not implicitly enable paused external group packaging. */
export function assertExternalPictureGroupSupport(workbook: Workbook): void {
  for (const sheet of workbook.sheets.values()) {
    const ids = sheet.floatingImages.filter(isPictureGroup).map((group) => group.id);
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
