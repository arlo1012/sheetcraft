import { assertNativePictureSourceOrientation } from "./picture-source-orientation.js";
import {
  assertNativePictureGeometryPrecision,
  isIdentityNativePictureGeometry,
} from "./picture-frame-geometry.js";
import { isSupportedNativePictureFrame } from "./picture-capabilities.js";
import { PICTURE_PROPERTY_KEYS, type PictureProperties } from "@sheetcraft/core/picture-properties";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import {
  isFramedPictureObject,
  type StandalonePictureObject,
} from "@sheetcraft/core/picture-object";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { XlsxCompatibilityError } from "./types.js";
import type { CellImage } from "@sheetcraft/core/formula";
import { normalizeImageTransform, type FloatingImage, type Sheet } from "@sheetcraft/core/workbook";
import type { XlsxEncodeOptions, XlsxImageAsset } from "./types.js";
import { nativeDrawingAnchor, EMU_PER_PIXEL } from "./drawing-geometry.js";
import type { NativeImageAnchor } from "./native/model.js";

/** Reject unencodable geometry/appearance before normalization or resource registration. */
export function assertSupportedXlsxImageAppearance(
  image: Pick<CellImage, "transform"> & PictureProperties,
  issueLocation: string,
): void {
  if (Object.hasOwn(image, "frame")) {
    const issuePath = `${issueLocation}.frame`;
    throw new XlsxCompatibilityError(
      `Frame-aware in-cell pictures are not yet supported by XLSX export at ${issuePath}.`,
      {
        issues: [{ code: "feature-omitted", severity: "block", count: 1, locations: [issuePath] }],
      },
    );
  }
  const property = PICTURE_PROPERTY_KEYS.find((key) => Object.hasOwn(image, key));
  if (property) {
    const issuePath = `${issueLocation}.${property}`;
    throw new XlsxCompatibilityError(
      `Picture object properties are not yet supported by XLSX export at ${issuePath}.`,
      {
        issues: [{ code: "feature-omitted", severity: "block", count: 1, locations: [issuePath] }],
      },
    );
  }
  const appearance = image.transform?.appearance;
  if (
    appearance !== null &&
    appearance !== undefined &&
    (Object.hasOwn(appearance, "suppressThemeEffects") ||
      Object.hasOwn(appearance, "detailedStyle"))
  ) {
    const field = Object.hasOwn(appearance, "detailedStyle")
      ? "detailedStyle"
      : "suppressThemeEffects";
    const issuePath = `${issueLocation}.transform.appearance.${field}`;
    throw new XlsxCompatibilityError(
      `Picture ${field === "detailedStyle" ? "detailed styling" : "theme-effect suppression"} is not yet supported by XLSX export at ${issuePath}.`,
      {
        issues: [{ code: "feature-omitted", severity: "block", count: 1, locations: [issuePath] }],
      },
    );
  }
}

/** Reject unsupported objects before resource registration or drawing mutation. */
export function assertSupportedXlsxPicture(
  image: FloatingImage,
  issueLocation: string,
  sheet?: Sheet,
): asserts image is StandalonePictureObject {
  if (
    isPictureGroup(image) ||
    (isFramedPictureObject(image) &&
      !isSupportedNativePictureFrame(image, sheet ? createPictureSheetMetrics(sheet) : undefined))
  ) {
    const issuePath = `${issueLocation}.frame`;
    throw new XlsxCompatibilityError(
      `Picture geometry or appearance is outside the supported native rectangle slice at ${issuePath}.`,
      {
        issues: [{ code: "feature-omitted", severity: "block", count: 1, locations: [issuePath] }],
      },
    );
  }
  if (isFramedPictureObject(image)) {
    // The cell-image guard deliberately rejects every frame. Check only the
    // common properties here after proving this floating frame's full shape.
    assertSupportedXlsxImageAppearance(
      Object.fromEntries(
        PICTURE_PROPERTY_KEYS.filter((key) => Object.hasOwn(image, key)).map((key) => [
          key,
          image[key],
        ]),
      ),
      issueLocation,
    );
  } else assertSupportedXlsxImageAppearance(image, issueLocation);
}

export type XlsxImageAnchor = NativeImageAnchor;

function floatingAnchor(sheet: Sheet, image: StandalonePictureObject): XlsxImageAnchor {
  if (!isFramedPictureObject(image))
    return nativeDrawingAnchor(
      sheet,
      image.anchor.row,
      image.anchor.column,
      image.offsetX,
      image.offsetY,
      image.width,
      image.height,
    );
  const metrics = createPictureSheetMetrics(sheet);
  const { rect, collapsed } = resolvePictureFrame(image.frame, metrics);
  const emu = (value: number): number => {
    const result = Math.round(value * EMU_PER_PIXEL);
    if (!Number.isSafeInteger(result) || result < 0)
      throw new RangeError("Picture geometry cannot be represented by an XLSX anchor.");
    return result;
  };
  if (collapsed || rect.width < 1 || rect.height < 1)
    throw new RangeError("Collapsed picture geometry cannot be exported to XLSX.");
  emu(rect.width);
  emu(rect.height);
  const frame = image.frame.anchor;
  const marker = (point: {
    column: { index: number; offset: number };
    row: { index: number; offset: number };
  }) => {
    if (point.column.index >= metrics.columns.count || point.row.index >= metrics.rows.count)
      throw new RangeError("Picture geometry exceeds the XLSX worksheet boundary.");
    const free = frame.mode !== "fixed" && frame.offsetMode === "free-pixels";
    if (
      !free &&
      (point.column.offset > metrics.columns.visibleSize(point.column.index) ||
        point.row.offset > metrics.rows.visibleSize(point.row.index))
    )
      throw new RangeError("Clamped picture insets cannot be exported without changing geometry.");
    if (point.column.offset > 1_000_000 || point.row.offset > 1_000_000)
      throw new RangeError("Picture marker offsets exceed the native import budget.");
    return {
      nativeCol: point.column.index,
      nativeColOff: emu(point.column.offset),
      nativeRow: point.row.index,
      nativeRowOff: emu(point.row.offset),
    };
  };
  const ext = { width: rect.width, height: rect.height };
  if (frame.mode === "fixed")
    return {
      tl: { nativeCol: 0, nativeColOff: 0, nativeRow: 0, nativeRowOff: 0 },
      ext,
      placement: { kind: "absolute", x: emu(frame.x), y: emu(frame.y) },
    };
  if (frame.mode === "move-and-size")
    return { tl: marker(frame.start), ext, placement: { kind: "twoCell", end: marker(frame.end) } };
  return { tl: marker(frame.origin), ext };
}

export type XlsxImageWorksheet = {
  addImage: (imageId: number, range: XlsxImageAnchor) => void;
};

export type XlsxImageWorkbook = {
  addImage: (image: { buffer: Uint8Array; extension: "png" | "jpeg" | "gif" }) => number;
};

function imageAssetKey(assetId: string, transform: XlsxImageAsset["transform"]): string {
  return JSON.stringify([assetId, normalizeImageTransform(transform) ?? null]);
}

function imageAssetsByKey(
  options: XlsxEncodeOptions | undefined,
): ReadonlyMap<string, XlsxImageAsset> {
  const assets = new Map<string, XlsxImageAsset>();
  for (const asset of options?.images ?? []) {
    const key = imageAssetKey(asset.assetId, asset.transform);
    if (!assets.has(key)) assets.set(key, asset);
  }
  return assets;
}

export function createXlsxImageExporter(
  target: XlsxImageWorkbook,
  options: XlsxEncodeOptions | undefined,
) {
  const assets = imageAssetsByKey(options);
  const excelImageIds = new Map<string, number>();
  const orientationChecked = new WeakSet<Uint8Array>();

  function requireAsset(
    assetId: string,
    transform: XlsxImageAsset["transform"],
    issueLocation: string,
  ): XlsxImageAsset {
    const asset = assets.get(imageAssetKey(assetId, transform));
    if (!asset) throw new Error(`Missing XLSX image resource for ${issueLocation}.`);
    return asset;
  }

  function addAsset(asset: XlsxImageAsset): number {
    const key = imageAssetKey(asset.assetId, asset.transform);
    const existing = excelImageIds.get(key);
    if (existing !== undefined) return existing;
    if (
      !Number.isFinite(asset.width) ||
      asset.width <= 0 ||
      !Number.isFinite(asset.height) ||
      asset.height <= 0
    )
      throw new Error(`Invalid XLSX image dimensions for asset ${asset.assetId}.`);
    const imageId = target.addImage({ buffer: asset.bytes, extension: asset.extension });
    excelImageIds.set(key, imageId);
    return imageId;
  }

  return {
    registerSheetBackground(assetId: string, issueLocation: string): string {
      const asset = requireAsset(assetId, undefined, issueLocation);
      return `xl/media/image${addAsset(asset) + 1}.${asset.extension}`;
    },
    registerCellImage(
      image: CellImage,
      issueLocation: string,
    ): { mediaFilename: string; altText: string } {
      assertSupportedXlsxImageAppearance(image, issueLocation);
      const asset = requireAsset(image.assetId, image.transform, issueLocation);
      return {
        mediaFilename: `xl/media/image${addAsset(asset) + 1}.${asset.extension}`,
        altText: image.altText,
      };
    },

    addFloatingImage(
      output: XlsxImageWorksheet,
      sheet: Sheet,
      image: FloatingImage,
      issueLocation: string,
    ): void {
      assertSupportedXlsxPicture(
        image,
        `${issueLocation}.floatingImages[${JSON.stringify(image.id)}]`,
        sheet,
      );
      const anchor = floatingAnchor(sheet, image);
      const blocked = (field: string, message: string): never => {
        throw new XlsxCompatibilityError(message, {
          issues: [
            {
              code: "feature-omitted",
              severity: "block",
              count: 1,
              locations: [`${issueLocation}.floatingImages[${JSON.stringify(image.id)}].${field}`],
            },
          ],
        });
      };
      let geometry;
      try {
        geometry = isFramedPictureObject(image)
          ? assertNativePictureGeometryPrecision(image.frame, anchor.ext)
          : undefined;
      } catch {
        blocked("frame", "Picture geometry cannot meet the native fixed-point precision budget.");
      }
      const asset = requireAsset(
        image.assetId,
        isFramedPictureObject(image) ? undefined : image.transform,
        issueLocation,
      );
      const transformed = geometry && !isIdentityNativePictureGeometry(geometry);
      try {
        if (isFramedPictureObject(image))
          assertNativePictureGeometryPrecision(image.frame, anchor.ext, asset);
      } catch {
        blocked(
          "frame.source",
          "Picture crop cannot meet the decoded source-pixel precision budget.",
        );
      }
      if (transformed && !orientationChecked.has(asset.bytes)) {
        try {
          assertNativePictureSourceOrientation(asset.bytes, asset.extension);
          orientationChecked.add(asset.bytes);
        } catch {
          blocked(
            "source-orientation",
            "Native picture geometry cannot verify this source's orientation metadata.",
          );
        }
      }
      const metrics = createPictureSheetMetrics(sheet);
      // Every picture's shape bbox must agree with the worksheet anchor,
      // including identity and legacy pictures. The zero-origin default in the
      // low-level writer is not a proven local-coordinate convention for pic.
      const transformOrigin =
        anchor.placement?.kind === "absolute"
          ? { x: anchor.placement.x, y: anchor.placement.y }
          : {
              x: Math.round(
                metrics.columns.visiblePrefix(anchor.tl.nativeCol) * EMU_PER_PIXEL +
                  anchor.tl.nativeColOff,
              ),
              y: Math.round(
                metrics.rows.visiblePrefix(anchor.tl.nativeRow) * EMU_PER_PIXEL +
                  anchor.tl.nativeRowOff,
              ),
            };
      output.addImage(addAsset(asset), {
        ...anchor,
        ...(transformed ? { geometry } : {}),
        transformOrigin,
        ...(isFramedPictureObject(image) && image.transform?.appearance?.detailedStyle
          ? { style: image.transform.appearance.detailedStyle }
          : {}),
        altText: image.altText,
        ...(image.lockAspectRatio === undefined ? {} : { lockAspectRatio: image.lockAspectRatio }),
        issueLocation: `${issueLocation}.floatingImages[${JSON.stringify(image.id)}].altText`,
      });
    },
  };
}
