import { anchorPictureFrameRect } from "../picture-frame.js";
import { createPictureSheetMetrics } from "../picture-axis-metrics.js";
import { MIN_FLOATING_IMAGE_SIZE, MAX_FLOATING_IMAGE_SIZE } from "../workbook.js";
import { isFramedCellImage } from "../cell-picture-frame.js";
import { planFloatingPictureToCell } from "../picture-cell-conversion.js";
import { assertFillDataValidation } from "./fill-validation.js";
import { createSetCellContentCommand } from "./values.js";
export { planFloatingPictureToCell } from "../picture-cell-conversion.js";
import { normalizePictureProperties } from "../picture-properties.js";
import { isPictureGroup } from "../picture-group.js";
import { normalizePictureObjectCollection } from "../picture-object.js";
import { isFramedPictureObject } from "../picture-object.js";
import { assertPictureObjectsForSheet } from "../picture-object-sheet.js";
import {
  cloneFloatingImage,
  cloneCellContent,
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
  RestorePictureCellConversionCommand,
  SetFloatingImageCommand,
  SetSheetFloatingImagesCommand,
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
  options: {
    path?: readonly string[];
    expectedCellContent?: import("../formula/types.js").CellContent | null;
    expectedAddress?: import("../workbook.js").CellAddress;
  } = {},
): ConvertFloatingImageToCellCommand {
  if (typeof id !== "string" || !id.trim()) throw invalidCommandPayload("id", id);
  if (
    options.path !== undefined &&
    (!Array.isArray(options.path) ||
      options.path.length < 1 ||
      options.path.length > 33 ||
      options.path.some((part) => typeof part !== "string" || !part.trim()))
  )
    throw invalidCommandPayload("path", options.path);
  if (options.expectedAddress) assertCellAddress(options.expectedAddress);
  return {
    type: "convertFloatingImageToCell",
    sheetId,
    id,
    ...(options.path ? { path: [...options.path] } : {}),
    ...(Object.hasOwn(options, "expectedCellContent")
      ? {
          expectedCellContent: options.expectedCellContent
            ? cloneCellContent(options.expectedCellContent)
            : null,
        }
      : {}),
    ...(options.expectedAddress ? { expectedAddress: { ...options.expectedAddress } } : {}),
  };
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
  assertPictureObjectsForSheet([image], sheet);
  const index = sheet.floatingImages.findIndex((candidate) => candidate.id === image.id);
  const previous = index < 0 ? undefined : sheet.floatingImages[index];
  if (
    command.index !== undefined &&
    (!Number.isInteger(command.index) ||
      command.index < 0 ||
      command.index >= sheet.floatingImages.length + (previous ? 0 : 1))
  )
    throw invalidCommandPayload("index", command.index);
  if (
    previous &&
    JSON.stringify(previous) === JSON.stringify(image) &&
    (command.index === undefined || command.index === index)
  )
    return null;
  const planned = sheet.floatingImages.slice();
  if (index < 0) planned.splice(command.index ?? planned.length, 0, image);
  else if (command.index !== undefined && command.index !== index) {
    planned.splice(index, 1);
    planned.splice(command.index, 0, image);
  } else planned[index] = image;
  const normalized = validateCommandPayload("images", planned, () =>
    normalizePictureObjectCollection(planned),
  );
  assertPictureObjectsForSheet(normalized, sheet);
  sheet.floatingImages = normalized;
  return previous
    ? createSetFloatingImageCommand(command.sheetId, previous, index)
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
): RestorePictureCellConversionCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  if (typeof command.id !== "string" || !command.id.trim())
    throw invalidCommandPayload("id", command.id);
  const plan = validateCommandPayload("picture conversion", command, () =>
    planFloatingPictureToCell(sheet, command.id, command.path),
  );
  if (!plan) return null;
  const content = getCellContent(sheet, plan.address);
  if (
    command.expectedAddress &&
    (command.expectedAddress.row !== plan.address.row ||
      command.expectedAddress.column !== plan.address.column)
  )
    throw invalidCommandPayload(
      "expectedAddress",
      command.expectedAddress,
      "The picture destination changed after confirmation.",
    );
  if (
    Object.hasOwn(command, "expectedCellContent") &&
    JSON.stringify(content) !== JSON.stringify(command.expectedCellContent ?? null)
  )
    throw invalidCommandPayload(
      "expectedCellContent",
      command.expectedCellContent,
      "The destination content changed after confirmation.",
    );
  assertFillDataValidation(
    workbook,
    createSetCellContentCommand(sheet.id, plan.address, { kind: "image", image: plan.image }),
  );
  assertPictureObjectsForSheet(plan.roots, sheet);
  const inverse: RestorePictureCellConversionCommand = {
    type: "restorePictureCellConversion",
    sheetId: sheet.id,
    address: { ...plan.address },
    images: normalizePictureObjectCollection(sheet.floatingImages),
    content,
  };
  setCellContent(sheet, plan.address, { kind: "image", image: plan.image });
  sheet.floatingImages = plan.roots;
  return inverse;
}

export function applyConvertCellImageToFloatingCommand(
  workbook: Workbook,
  command: ConvertCellImageToFloatingCommand,
): RestorePictureCellConversionCommand | null {
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
  const source = content.image;
  const metrics = createPictureSheetMetrics(sheet);
  const frameAnchor = isFramedCellImage(source)
    ? anchorPictureFrameRect(
        [source.frame.size.width, source.frame.size.height].every(
          (value) => value >= MIN_FLOATING_IMAGE_SIZE && value <= MAX_FLOATING_IMAGE_SIZE,
        )
          ? "move-only"
          : "move-and-size",
        {
          x: metrics.columns.visiblePrefix(address.column),
          y: metrics.rows.visiblePrefix(address.row),
          ...source.frame.size,
        },
        metrics,
      )
    : undefined;
  const image = normalizeCommandFloatingImage(
    isFramedCellImage(source)
      ? {
          id: command.imageId,
          assetId: source.assetId,
          altText: source.altText,
          ...normalizePictureProperties(source),
          ...(source.transform ? { transform: source.transform } : {}),
          ...(source.lockAspectRatio === undefined
            ? {}
            : { lockAspectRatio: source.lockAspectRatio }),
          frame: {
            kind: "object-frame-v1",
            anchor: frameAnchor!,
            source: { ...source.frame.source },
            angleDeg: source.frame.angleDeg,
            ...(source.frame.flipHorizontal ? { flipHorizontal: true } : {}),
            ...(source.frame.flipVertical ? { flipVertical: true } : {}),
            ...(source.frame.cropShape ? { cropShape: source.frame.cropShape } : {}),
          },
        }
      : {
          id: command.imageId,
          assetId: source.assetId,
          altText: source.altText,
          ...normalizePictureProperties(source),
          ...(source.transform ? { transform: source.transform } : {}),
          anchor: address,
          offsetX: 0,
          offsetY: 0,
          ...size,
        },
  );
  const nextImages = validateCommandPayload("images", [...sheet.floatingImages, image], () =>
    normalizePictureObjectCollection([...sheet.floatingImages, image]),
  );
  assertPictureObjectsForSheet(nextImages, sheet);
  const inverse: RestorePictureCellConversionCommand = {
    type: "restorePictureCellConversion",
    sheetId: sheet.id,
    address: { ...address },
    images: normalizePictureObjectCollection(sheet.floatingImages),
    content: cloneCellContent(content),
  };
  setCellContent(sheet, address, null);
  sheet.floatingImages = nextImages;
  return inverse;
}

export function applyRestoreFloatingImageToCellCommand(
  workbook: Workbook,
  command: RestoreFloatingImageToCellCommand,
): ConvertFloatingImageToCellCommand {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const image = normalizeCommandFloatingImage(command.image);
  if (isFramedPictureObject(image) || isPictureGroup(image))
    throw invalidCommandPayload(
      "image.frame",
      image.frame,
      "Restoring a framed cell conversion is not supported.",
    );
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
  const planned = sheet.floatingImages.slice();
  planned.splice(command.index, 0, image);
  const nextImages = validateCommandPayload("images", planned, () =>
    normalizePictureObjectCollection(planned),
  );
  assertPictureObjectsForSheet(nextImages, sheet);
  setCellContent(sheet, command.address, command.content);
  sheet.floatingImages = nextImages;
  return createConvertFloatingImageToCellCommand(command.sheetId, image.id);
}

/** History restores exact cell content and the complete ownership forest in one transaction. */
export function applyRestorePictureCellConversionCommand(
  workbook: Workbook,
  command: RestorePictureCellConversionCommand,
): RestorePictureCellConversionCommand {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  assertCellAddress(command.address);
  const images = validateCommandPayload("images", command.images, () =>
    normalizePictureObjectCollection(command.images),
  );
  const content =
    command.content === null
      ? null
      : validateCommandPayload("content", command.content, () =>
          cloneCellContent(command.content!),
        );
  assertPictureObjectsForSheet(images, sheet);
  const inverse: RestorePictureCellConversionCommand = {
    type: "restorePictureCellConversion",
    sheetId: sheet.id,
    address: { ...command.address },
    images: normalizePictureObjectCollection(sheet.floatingImages),
    content: getCellContent(sheet, command.address),
  };
  setCellContent(sheet, command.address, content);
  sheet.floatingImages = images;
  return inverse;
}

/** Replaces one sheet's picture collection atomically for grouping, arranging, and batch edits. */
export function createSetSheetFloatingImagesCommand(
  sheetId: string,
  images: readonly FloatingImage[],
): SetSheetFloatingImagesCommand {
  if (!Array.isArray(images)) throw invalidCommandPayload("images", images);
  const normalized = validateCommandPayload("images", images, () =>
    normalizePictureObjectCollection(images),
  );
  return { type: "setSheetFloatingImages", sheetId, images: normalized };
}
export function applySetSheetFloatingImagesCommand(
  workbook: Workbook,
  command: SetSheetFloatingImagesCommand,
): SetSheetFloatingImagesCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const next = createSetSheetFloatingImagesCommand(command.sheetId, command.images);
  assertPictureObjectsForSheet(next.images, sheet);
  if (JSON.stringify(sheet.floatingImages) === JSON.stringify(next.images)) return null;
  const inverse = createSetSheetFloatingImagesCommand(command.sheetId, sheet.floatingImages);
  sheet.floatingImages = next.images;
  return inverse;
}
