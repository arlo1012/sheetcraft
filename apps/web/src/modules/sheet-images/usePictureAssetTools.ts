import { isLegacyPictureObject } from "@sheetcraft/core/picture-object";
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
    if (busy.value || options.isBusy()) return;
    const selected = legacyPictures(all);
    if (!selected?.length) return;
    const sheet = options.getSheet();
    const valid = () => !disposed && sourcesCurrent(sheet, selected, all);
    busy.value = true;
    try {
      const files: Record<string, Uint8Array> = {};
      for (const [index, image] of selected.entries()) {
        const source = await options.assetStore.get(image.assetId);
        if (!valid()) return;
        if (!source) throw new Error("Missing picture asset.");
        const blob = await convertPictureBlob(source.blob, image.transform, format);
        if (!valid()) return;
        const name = `${index + 1}-${(image.altText || "picture").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_")}.${format}`;
        files[name] = new Uint8Array(await blob.arrayBuffer());
      }
      if (!valid()) return;
      if (selected.length === 1) {
        const [name, bytes] = Object.entries(files)[0]!;
        downloadBlob(new Blob([new Uint8Array(bytes)], { type: `image/${format}` }), name);
      } else {
        const { zipSync } = await import("fflate");
        if (!valid()) return;
        downloadBlob(
          new Blob([new Uint8Array(zipSync(files, { level: 0 }))], { type: "application/zip" }),
          "pictures.zip",
        );
      }
      options.feedback("picture.exported");
    } catch (error) {
      options.feedback(imageAssetFeedback(error) ?? "picture.assetFailed", true);
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
    const selected = legacyPictures(settings.all);
    if (
      !selected?.length ||
      !canEditPictureSelection(
        sheet,
        selected.map((image) => image.id),
      )
    )
      return false;
    busy.value = true;
    const valid = () =>
      options.getWorkbook() === workbook &&
      !disposed &&
      shouldContinue() &&
      options.getSheet() === sheet &&
      (options.getGeneration?.() ?? 0) === generation &&
      workbook.sheets.get(sheet.id) === sheet &&
      canEditPictureSelection(
        sheet,
        selected.map((image) => image.id),
      ) &&
      sourcesCurrent(sheet, selected, settings.all);
    try {
      const converted = new Map<string, ImageAsset>();
      for (const image of selected) {
        if (converted.has(image.assetId)) continue;
        const source = await options.assetStore.get(image.assetId);
        if (!valid()) return false;
        if (!source) throw new Error("Picture asset unavailable.");
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
      const ids = new Set(selected.map((image) => image.id));
      const next = sheet.floatingImages.map((image) =>
        ids.has(image.id) && isLegacyPictureObject(image)
          ? { ...image, assetId: converted.get(image.assetId)!.id }
          : image,
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
