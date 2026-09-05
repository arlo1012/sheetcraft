import {
  cloneFloatingImage,
  getCellContent,
  normalizeFloatingImageForSheet,
  setCellContent,
  type FloatingImage,
  type Workbook,
} from "../workbook.js";
import { getMergedCellAnchor } from "../merged-cells.js";
import type {
  ConvertFloatingImageToCellCommand,
  ConvertCellImageToFloatingCommand,
  DeleteFloatingImageCommand,
  FloatingImageSize,
  RestoreFloatingImageToCellCommand,
  SetFloatingImageCommand,
} from "./contracts.js";
import {
  assertCellAddress,
  getSheetOrThrow,
  invalidCommandPayload,
  validateCommandPayload,
} from "./helpers.js";

function normalizeCommandFloatingImage(value: FloatingImage): FloatingImage {
  return validateCommandPayload("image", value, () => normalizeFloatingImageForSheet(value));
}

function normalizeFloatingImageSize(size: FloatingImageSize): FloatingImageSize {
  const image = validateCommandPayload("size", size, () =>
    normalizeFloatingImageForSheet({
      id: "validation",
      assetId: "validation",
      altText: "",
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: size?.width,
      height: size?.height,
    }),
  );
  return { width: image.width, height: image.height };
}

export function createSetFloatingImageCommand(
  sheetId: string,
  image: FloatingImage,
  index?: number,
): SetFloatingImageCommand {
  if (index !== undefined && (!Number.isInteger(index) || index < 0)) {
    throw invalidCommandPayload("index", index);
  }
  return {
    type: "setFloatingImage",
    sheetId,
    image: normalizeCommandFloatingImage(image),
    ...(index === undefined ? {} : { index }),
  };
}

export function createDeleteFloatingImageCommand(
  sheetId: string,
  id: string,
): DeleteFloatingImageCommand {
  if (typeof id !== "string" || !id.trim()) throw invalidCommandPayload("id", id);
  return { type: "deleteFloatingImage", sheetId, id };
}

export function createConvertFloatingImageToCellCommand(
  sheetId: string,
  id: string,
): ConvertFloatingImageToCellCommand {
  if (typeof id !== "string" || !id.trim()) throw invalidCommandPayload("id", id);
  return { type: "convertFloatingImageToCell", sheetId, id };
}

export function createConvertCellImageToFloatingCommand(
  sheetId: string,
  address: { row: number; column: number },
  imageId: string,
  size: FloatingImageSize,
): ConvertCellImageToFloatingCommand {
  assertCellAddress(address);
  if (typeof imageId !== "string" || !imageId.trim())
    throw invalidCommandPayload("imageId", imageId);
  return {
    type: "convertCellImageToFloating",
    sheetId,
    address: { ...address },
    imageId,
    size: normalizeFloatingImageSize(size),
  };
}

export function applySetFloatingImageCommand(
  workbook: Workbook,
  command: SetFloatingImageCommand,
): SetFloatingImageCommand | DeleteFloatingImageCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const image = normalizeCommandFloatingImage(command.image);
  const index = sheet.floatingImages.findIndex((candidate) => candidate.id === image.id);
  const previous = index < 0 ? undefined : sheet.floatingImages[index];
  if (previous && JSON.stringify(previous) === JSON.stringify(image)) return null;
  if (index < 0) {
    if (
      command.index !== undefined &&
      (!Number.isInteger(command.index) ||
        command.index < 0 ||
        command.index > sheet.floatingImages.length)
    ) {
      throw invalidCommandPayload("index", command.index);
    }
    sheet.floatingImages.splice(command.index ?? sheet.floatingImages.length, 0, image);
  } else sheet.floatingImages[index] = image;
  return previous
    ? createSetFloatingImageCommand(command.sheetId, previous)
    : createDeleteFloatingImageCommand(command.sheetId, image.id);
}

export function applyDeleteFloatingImageCommand(
  workbook: Workbook,
  command: DeleteFloatingImageCommand,
): SetFloatingImageCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  if (typeof command.id !== "string" || !command.id.trim())
    throw invalidCommandPayload("id", command.id);
  const index = sheet.floatingImages.findIndex((image) => image.id === command.id);
  if (index < 0) return null;
  const [previous] = sheet.floatingImages.splice(index, 1);
  if (!previous) return null;
  return createSetFloatingImageCommand(command.sheetId, cloneFloatingImage(previous), index);
}

export function applyConvertFloatingImageToCellCommand(
  workbook: Workbook,
  command: ConvertFloatingImageToCellCommand,
): RestoreFloatingImageToCellCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  if (typeof command.id !== "string" || !command.id.trim())
    throw invalidCommandPayload("id", command.id);
  const index = sheet.floatingImages.findIndex((image) => image.id === command.id);
  if (index < 0) return null;
  const image = sheet.floatingImages[index];
  if (!image) return null;
  const address = getMergedCellAnchor(sheet.mergedCells, image.anchor) ?? image.anchor;
  const content = getCellContent(sheet, address);
  sheet.floatingImages.splice(index, 1);
  setCellContent(sheet, address, {
    kind: "image",
    image: { assetId: image.assetId, altText: image.altText },
  });
  return {
    type: "restoreFloatingImageToCell",
    sheetId: command.sheetId,
    image: cloneFloatingImage(image),
    index,
    address: { ...address },
    content,
  };
}

export function applyConvertCellImageToFloatingCommand(
  workbook: Workbook,
  command: ConvertCellImageToFloatingCommand,
): ConvertFloatingImageToCellCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  assertCellAddress(command.address);
  if (typeof command.imageId !== "string" || !command.imageId.trim())
    throw invalidCommandPayload("imageId", command.imageId);
  const size = normalizeFloatingImageSize(command.size);
  const address = getMergedCellAnchor(sheet.mergedCells, command.address) ?? command.address;
  const content = getCellContent(sheet, address);
  if (content?.kind !== "image") return null;
  if (sheet.floatingImages.some((image) => image.id === command.imageId)) {
    throw invalidCommandPayload("imageId", command.imageId, "Floating image id already exists.");
  }
  const image = normalizeCommandFloatingImage({
    id: command.imageId,
    assetId: content.image.assetId,
    altText: content.image.altText,
    anchor: address,
    offsetX: 0,
    offsetY: 0,
    ...size,
  });
  setCellContent(sheet, address, null);
  sheet.floatingImages.push(image);
  return createConvertFloatingImageToCellCommand(command.sheetId, image.id);
}

export function applyRestoreFloatingImageToCellCommand(
  workbook: Workbook,
  command: RestoreFloatingImageToCellCommand,
): ConvertFloatingImageToCellCommand {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const image = normalizeCommandFloatingImage(command.image);
  assertCellAddress(command.address);
  if (
    !Number.isInteger(command.index) ||
    command.index < 0 ||
    command.index > sheet.floatingImages.length
  ) {
    throw invalidCommandPayload("index", command.index);
  }
  if (sheet.floatingImages.some((candidate) => candidate.id === image.id)) {
    throw invalidCommandPayload("image.id", image.id, "Floating image id already exists.");
  }
  setCellContent(sheet, command.address, command.content);
  sheet.floatingImages.splice(command.index, 0, image);
  return createConvertFloatingImageToCellCommand(command.sheetId, image.id);
}
