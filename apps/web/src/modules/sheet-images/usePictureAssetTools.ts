import { isGroupedPicture, type PictureGroupPath } from "@sheetcraft/core/picture-group";
import {
  capturePictureSourceSelection,
  isPictureSourceSelectionCurrent,
  mapPictureSourceAssets,
  type PictureAssetSource,
  type PictureSourceSelection,
} from "./picture-source-selection";
import { isLegacyPictureObject } from "@sheetcraft/core/picture-object";
import { resolvePictureFrame, resolvePictureSourceLayout } from "@sheetcraft/core/picture-frame";
import { cloneWorkbookTheme, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { resolveOwnedPictureNode } from "./picture-group-interaction";
import { pictureToolGeometryIdentity } from "./picture-tool-geometry";
import {
  capturePictureSourcePresentation,
  type PictureSourcePresentation,
} from "./picture-source-presentation";
import { exportPictureSourceBlob } from "./picture-source-export";
import { requireLegacyPictures } from "./picture-document-support";
import { getCurrentScope, onScopeDispose, readonly, ref } from "vue";
import { canEditPictureSelection } from "@sheetcraft/core/picture-protection";
import {
  createSetSheetFloatingImagesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  cloneFloatingImage,
  type FloatingImage,
  type LegacyFloatingImage,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import type { ImageAsset, ImageAssetStore } from "../image-assets/imageAssetStore";
import { imageAssetFeedback } from "../image-assets/imageAssetFeedback";
import { prepareImageAsset } from "../image-assets/prepareImageAsset";
import { downloadBlob } from "../../shared/files/download";
import {
  convertPictureBlob,
  type PictureCompression,
  type PictureFileFormat,
} from "./picture-asset-conversion";
import type { MessageKey } from "../../shared/i18n";

export function usePictureAssetTools(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration?: () => number;
  getSelectedIds: () => readonly string[];
  getSelectedPath?: () => PictureGroupPath | null;
  getFrameContext?: () => PictureFrameLayoutContext | undefined;
  assetStore: ImageAssetStore;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  feedback: (key: MessageKey, error?: boolean) => void;
}) {
  const busy = ref(false);
  let disposed = false;
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
    });
  function pictures(all = false): FloatingImage[] {
    return options
      .getSheet()
      .floatingImages.filter((image) => all || options.getSelectedIds().includes(image.id));
  }
  function legacyPictures(all = false) {
    try {
      const selected = pictures(all);
      const ids = options.getSelectedIds();
      if (!all && (new Set(ids).size !== ids.length || selected.length !== ids.length))
        throw new Error("Incomplete picture selection.");
      return requireLegacyPictures(selected).map((image) => cloneFloatingImage(image));
    } catch {
      options.feedback("picture.assetFailed", true);
      return null;
    }
  }
  function sourcesCurrent(
    sheet: Sheet,
    selected: readonly LegacyFloatingImage[],
    all: boolean,
  ): boolean {
    const current = pictures(all);
    return (
      options.getSheet() === sheet &&
      current.length === selected.length &&
      current.every(
        (image) =>
          isLegacyPictureObject(image) &&
          selected.some((source) => source.id === image.id && source.assetId === image.assetId),
      )
    );
  }
  async function exportPictures(format: PictureFileFormat, all = false): Promise<void> {
    if (disposed || busy.value || options.isBusy()) return;
    if (typeof all !== "boolean" || !["png", "jpeg", "webp"].includes(format)) return;
    const workbook = options.getWorkbook(),
      sheet = options.getSheet(),
      generation = options.getGeneration?.() ?? 0,
      selectedIds = JSON.stringify(options.getSelectedIds()),
      selectedPath = JSON.stringify(options.getSelectedPath?.() ?? null),
      context = options.getFrameContext?.(),
      geometryIdentity = pictureToolGeometryIdentity(context);
    let selection: PictureSourceSelection;
    let selected: {
      image: PictureAssetSource;
      presentation?: PictureSourcePresentation;
    }[];
    let theme: WorkbookTheme;
    try {
      selection = capturePictureSourceSelection(
        sheet.floatingImages,
        options.getSelectedIds(),
        options.getSelectedPath?.(),
        all,
      );
      if (selection.sources.length > 100) {
        options.feedback("picture.assetActionTooLarge", true);
        return;
      }
      theme = cloneWorkbookTheme(workbook.theme);
      selected = selection.sources.map(({ node, path }) => {
        if (isGroupedPicture(node)) {
          if (!context) throw new Error("Current picture geometry is unavailable.");
          const geometry = resolveOwnedPictureNode(selection.roots, path, context)?.layout;
          if (!geometry) throw new Error("Current owned picture geometry is unavailable.");
          return {
            image: node,
            presentation: capturePictureSourcePresentation(
              node,
              resolvePictureSourceLayout(geometry.rect, geometry.angleDeg, node.frame.source),
            ),
          };
        }
        if (isLegacyPictureObject(node)) return { image: node, presentation: undefined };
        if (!context) throw new Error("Current picture geometry is unavailable.");
        const geometry = resolvePictureFrame(node.frame, context.metrics);
        return { image: node, presentation: capturePictureSourcePresentation(node, geometry) };
      });
    } catch {
      options.feedback("picture.assetFailed", true);
      return;
    }
    const forest = JSON.stringify(selection.roots),
      themeIdentity = JSON.stringify(workbook.theme);
    const valid = () => {
      try {
        if (
          disposed ||
          options.getWorkbook() !== workbook ||
          options.getSheet() !== sheet ||
          workbook.sheets.get(sheet.id) !== sheet ||
          (options.getGeneration?.() ?? 0) !== generation ||
          JSON.stringify(options.getSelectedIds()) !== selectedIds ||
          JSON.stringify(options.getSelectedPath?.() ?? null) !== selectedPath ||
          JSON.stringify(workbook.theme) !== themeIdentity ||
          !isPictureSourceSelectionCurrent(selection, sheet.floatingImages)
        )
          return false;
        const currentGeometry = pictureToolGeometryIdentity(options.getFrameContext?.());
        return (
          geometryIdentity.every((value, index) => value === currentGeometry[index]) &&
          JSON.stringify(
            capturePictureSourceSelection(sheet.floatingImages, selection.rootIds, selection.path)
              .roots,
          ) === forest
        );
      } catch {
        return false;
      }
    };
    busy.value = true;
    try {
      const files: Record<string, Uint8Array> = {};
      const sources = new Map<string, Blob>();
      let sourceBytes = 0,
        outputBytes = 0;
      async function readSource(id: string): Promise<Blob | undefined> {
        if (!valid()) return;
        const existing = sources.get(id);
        if (existing) return existing;
        const source = await options.assetStore.get(id);
        if (!valid()) return;
        if (!source) throw new Error("Missing picture asset.");
        sourceBytes += source.blob.size;
        if (sourceBytes > 64 * 1024 * 1024) throw new RangeError("Picture source batch too large.");
        sources.set(id, source.blob);
        return source.blob;
      }
      for (const [index, entry] of selected.entries()) {
        const { image, presentation } = entry;
        const source = await readSource(image.assetId);
        if (!valid()) return;
        if (!source) throw new Error("Missing picture asset.");
        const blob = presentation
          ? await exportPictureSourceBlob(source, presentation, format, theme, readSource, valid)
          : await convertPictureBlob(source, image.transform, format);
        if (!valid()) return;
        if (!blob) return;
        outputBytes += blob.size;
        if (outputBytes > 64 * 1024 * 1024) throw new RangeError("Picture output batch too large.");
        const name = `${index + 1}-${(image.altTitle || image.altText || "picture")
          .replace(/\.[^.]+$/, "")
          .replace(/[\\/:*?"<>|]/g, "_")
          .replace(/\p{Cc}/gu, "_")
          .slice(0, 120)}.${format}`;
        files[name] = new Uint8Array(await blob.arrayBuffer());
        if (!valid()) return;
      }
      if (!valid()) return;
      if (selected.length === 1) {
        const [name, bytes] = Object.entries(files)[0]!;
        downloadBlob(new Blob([new Uint8Array(bytes)], { type: `image/${format}` }), name);
      } else {
        const { zipSync } = await import("fflate");
        if (!valid()) return;
        downloadBlob(
          new Blob([new Uint8Array(zipSync(files, { level: 0 }))], {
            type: "application/zip",
          }),
          "pictures.zip",
        );
      }
      options.feedback("picture.exported");
    } catch (error) {
      if (valid())
        options.feedback(
          error instanceof RangeError && error.message.includes("batch too large")
            ? "picture.assetActionTooLarge"
            : (imageAssetFeedback(error) ?? "picture.assetFailed"),
          true,
        );
    } finally {
      busy.value = false;
    }
  }
  async function compress(
    settings: PictureCompression,
    shouldContinue: () => boolean = () => true,
  ): Promise<boolean> {
    if (
      disposed ||
      !shouldContinue() ||
      busy.value ||
      options.isBusy() ||
      !Number.isFinite(settings.maxSide) ||
      settings.maxSide < 96 ||
      settings.maxSide > 4096 ||
      !Number.isFinite(settings.quality) ||
      settings.quality < 0.1 ||
      settings.quality > 1
    )
      return false;
    const workbook = options.getWorkbook();
    const sheet = options.getSheet();
    const generation = options.getGeneration?.() ?? 0;
    let selection: PictureSourceSelection;
    try {
      selection = capturePictureSourceSelection(
        sheet.floatingImages,
        options.getSelectedIds(),
        options.getSelectedPath?.(),
        settings.all,
      );
    } catch {
      options.feedback("picture.assetFailed", true);
      return false;
    }
    const selected = selection.sources.map((source) => source.node);
    if (new Set(selected.map((node) => node.assetId)).size > 100) {
      options.feedback("picture.assetActionTooLarge", true);
      return false;
    }
    const selectedIds = [...options.getSelectedIds()],
      selectedPath = JSON.stringify(options.getSelectedPath?.() ?? null);
    if (!canEditPictureSelection(sheet, selection.rootIds)) return false;
    busy.value = true;
    const valid = () =>
      options.getWorkbook() === workbook &&
      !disposed &&
      shouldContinue() &&
      options.getSheet() === sheet &&
      (options.getGeneration?.() ?? 0) === generation &&
      workbook.sheets.get(sheet.id) === sheet &&
      canEditPictureSelection(sheet, selection.rootIds) &&
      JSON.stringify(options.getSelectedIds()) === JSON.stringify(selectedIds) &&
      JSON.stringify(options.getSelectedPath?.() ?? null) === selectedPath &&
      (!settings.all || sheet.floatingImages.length === selection.roots.length) &&
      isPictureSourceSelectionCurrent(selection, sheet.floatingImages);
    try {
      const converted = new Map<string, ImageAsset>();
      let sourceBytes = 0;
      for (const image of selected) {
        if (converted.has(image.assetId)) continue;
        const source = await options.assetStore.get(image.assetId);
        if (!valid()) return false;
        if (!source) throw new Error("Picture asset unavailable.");
        sourceBytes += source.blob.size;
        if (sourceBytes > 64 * 1024 * 1024) {
          options.feedback("picture.assetActionTooLarge", true);
          return false;
        }
        const blob = await convertPictureBlob(
          source.blob,
          undefined,
          settings.format,
          settings.maxSide,
          settings.quality,
        );
        if (!valid()) return false;
        const asset = blob.size < source.blob.size ? await prepareImageAsset(blob) : source;
        if (!valid()) return false;
        converted.set(image.assetId, asset);
      }
      if (!valid()) return false;
      for (const asset of converted.values()) {
        if (!valid()) return false;
        await options.assetStore.put(asset);
      }
      if (!valid()) return false;
      const next = mapPictureSourceAssets(
        selection,
        sheet.floatingImages,
        new Map([...converted].map(([id, asset]) => [id, asset.id])),
      );
      const changed = selected.some((image) => converted.get(image.assetId)!.id !== image.assetId);
      if (
        changed &&
        (await options.execute(createSetSheetFloatingImagesCommand(sheet.id, next))) === false
      ) {
        options.feedback("picture.assetFailed", true);
        return false;
      }
      options.feedback(changed ? "picture.compressed" : "picture.noSmaller");
      return true;
    } catch (error) {
      if (valid()) options.feedback(imageAssetFeedback(error) ?? "picture.assetFailed", true);
      return false;
    } finally {
      busy.value = false;
    }
  }
  async function printPictures(): Promise<void> {
    if (busy.value || options.isBusy()) return;
    const selected = legacyPictures();
    if (!selected?.length) return;
    const sheet = options.getSheet();
    const valid = () => !disposed && sourcesCurrent(sheet, selected, false);
    const popup = window.open("", "_blank");
    if (!popup) {
      options.feedback("picture.assetFailed", true);
      return;
    }
    popup.opener = null;
    popup.document.title = selected[0]!.altText || "Pictures";
    const urls: string[] = [];
    busy.value = true;
    try {
      const style = popup.document.createElement("style");
      style.textContent =
        "body{margin:0}img{display:block;max-width:100%;max-height:95vh;object-fit:contain;break-after:page;margin:auto}@page{margin:12mm}";
      popup.document.head.append(style);
      for (const picture of selected) {
        const source = await options.assetStore.get(picture.assetId);
        if (!valid()) {
          for (const url of urls) URL.revokeObjectURL(url);
          popup.close();
          return;
        }
        if (!source || popup.closed) throw new Error("Missing picture.");
        const blob = await convertPictureBlob(source.blob, picture.transform, "png");
        if (!valid()) {
          for (const url of urls) URL.revokeObjectURL(url);
          popup.close();
          return;
        }
        const url = URL.createObjectURL(blob);
        urls.push(url);
        const image = popup.document.createElement("img");
        image.alt = picture.altText;
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Picture load failed."));
          image.src = url;
          popup.document.body.append(image);
        });
      }
      if (!valid()) {
        for (const url of urls) URL.revokeObjectURL(url);
        popup.close();
        return;
      }
      popup.addEventListener(
        "afterprint",
        () => {
          for (const url of urls) URL.revokeObjectURL(url);
          popup.close();
        },
        { once: true },
      );
      popup.addEventListener(
        "pagehide",
        () => {
          for (const url of urls) URL.revokeObjectURL(url);
        },
        { once: true },
      );
      popup.focus();
      popup.print();
    } catch {
      for (const url of urls) URL.revokeObjectURL(url);
      popup.close();
      options.feedback("picture.assetFailed", true);
    } finally {
      busy.value = false;
    }
  }
  return { busy: readonly(busy), exportPictures, compress, printPictures };
}
