import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { XlsxCompatibilityError } from "./types.js";
import type { CellImage } from "@sheetcraft/core/formula";
import {
  normalizeImageTransform,
  type FloatingImage,
  type LegacyFloatingImage,
  type Sheet,
} from "@sheetcraft/core/workbook";
import type { XlsxEncodeOptions, XlsxImageAsset } from "./types.js";
import { nativeDrawingAnchor, type NativeDrawingAnchor } from "./drawing-geometry.js";

/** Reject unencodable appearance intent before normalization or resource registration. */
export function assertSupportedXlsxImageAppearance(
  image: Pick<CellImage, "transform">,
  issueLocation: string,
): void {
  const appearance = image.transform?.appearance;
  if (
    appearance !== null &&
    appearance !== undefined &&
    Object.hasOwn(appearance, "suppressThemeEffects")
  ) {
    const location = `${issueLocation}.transform.appearance.suppressThemeEffects`;
    throw new XlsxCompatibilityError(
      `Picture theme-effect suppression is not yet supported by XLSX export at ${location}.`,
      {
        issues: [{ code: "feature-omitted", severity: "block", count: 1, locations: [location] }],
      },
    );
  }
}

/** The existing native writer cannot encode object-frame geometry. Reject before resources. */
export function assertSupportedXlsxPicture(
  image: FloatingImage,
  issueLocation: string,
): asserts image is LegacyFloatingImage {
  if (isFramedPictureObject(image) || isPictureGroup(image)) {
    const location = `${issueLocation}.frame`;
    throw new XlsxCompatibilityError(
      `Frame-aware pictures and owned groups are not yet supported by XLSX export at ${location}.`,
      {
        issues: [{ code: "feature-omitted", severity: "block", count: 1, locations: [location] }],
      },
    );
  }
  assertSupportedXlsxImageAppearance(image, issueLocation);
}

export type XlsxImageAnchor = NativeDrawingAnchor & {
  altText?: string;
  issueLocation?: string;
};

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
      );
      const asset = requireAsset(image.assetId, image.transform, issueLocation);
      output.addImage(addAsset(asset), {
        ...nativeDrawingAnchor(
          sheet,
          image.anchor.row,
          image.anchor.column,
          image.offsetX,
          image.offsetY,
          image.width,
          image.height,
        ),
        altText: image.altText,
        issueLocation: `${issueLocation}.floatingImages[${JSON.stringify(image.id)}].altText`,
      });
    },
  };
}
