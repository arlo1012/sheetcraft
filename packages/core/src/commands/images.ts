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
  DeleteFloatingImageCommand,
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
