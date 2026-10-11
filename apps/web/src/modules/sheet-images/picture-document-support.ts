import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import type { FloatingImage, LegacyFloatingImage, Workbook } from "@sheetcraft/core/workbook";

export class UnsupportedPictureDocumentError extends Error {
  readonly code = "unsupported-picture-frame";
  constructor(
    readonly sheetId: string,
    readonly imageIds: readonly string[],
  ) {
    super(
      `Frame-aware picture editing is not yet enabled (sheet ${sheetId}, pictures ${imageIds.join(", ")}).`,
    );
    this.name = "UnsupportedPictureDocumentError";
  }
}

/** Temporary live-document boundary while model and view consumers are integrated. */
export function assertWorkbookPictureSupport(workbook: Workbook): void {
  for (const sheet of workbook.sheets.values()) {
    const ids = sheet.floatingImages.filter(isFramedPictureObject).map((image) => image.id);
    if (ids.length) throw new UnsupportedPictureDocumentError(sheet.id, ids);
  }
}

/** Legacy consumers must reject the complete collection before side effects. */
export function requireLegacyPictures(
  images: readonly FloatingImage[],
): readonly LegacyFloatingImage[] {
  if (images.some(isFramedPictureObject))
    throw new UnsupportedPictureDocumentError(
      "picture-consumer",
      images.filter(isFramedPictureObject).map((image) => image.id),
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
