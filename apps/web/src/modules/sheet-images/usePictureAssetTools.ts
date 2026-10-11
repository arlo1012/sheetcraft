import { readonly, ref } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import {
  createSetSheetFloatingImagesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import type { FloatingImage, Sheet, Workbook } from "@sheetcraft/core/workbook";
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
  getSelectedIds: () => readonly string[];
  assetStore: ImageAssetStore;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  feedback: (key: MessageKey, error?: boolean) => void;
}) {
  const busy = ref(false);
  function pictures(all = false): FloatingImage[] {
    return options
      .getSheet()
      .floatingImages.filter((image) => all || options.getSelectedIds().includes(image.id));
  }
  async function exportPictures(format: PictureFileFormat, all = false): Promise<void> {
    if (busy.value || options.isBusy()) return;
    const selected = pictures(all);
    if (!selected.length) return;
    busy.value = true;
    try {
      const files: Record<string, Uint8Array> = {};
      for (const [index, image] of selected.entries()) {
        const source = await options.assetStore.get(image.assetId);
        if (!source) throw new Error("Missing picture asset.");
        const blob = await convertPictureBlob(source.blob, image.transform, format);
        const name = `${index + 1}-${(image.altText || "picture").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_")}.${format}`;
        files[name] = new Uint8Array(await blob.arrayBuffer());
      }
      if (selected.length === 1) {
        const [name, bytes] = Object.entries(files)[0]!;
        downloadBlob(new Blob([new Uint8Array(bytes)], { type: `image/${format}` }), name);
      } else {
        const { zipSync } = await import("fflate");
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
  async function compress(settings: PictureCompression): Promise<boolean> {
    if (
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
    if (!canUseSheetPermission(sheet, "editObjects")) return false;
    const selected = pictures(settings.all);
    if (!selected.length) return false;
    busy.value = true;
    const valid = () =>
      options.getWorkbook() === workbook &&
      workbook.sheets.get(sheet.id) === sheet &&
      canUseSheetPermission(sheet, "editObjects") &&
      selected.every((image) =>
        sheet.floatingImages.some(
          (current) => current.id === image.id && current.assetId === image.assetId,
        ),
      );
    try {
      const converted = new Map<string, ImageAsset>();
      for (const image of selected) {
        if (converted.has(image.assetId)) continue;
        const source = await options.assetStore.get(image.assetId);
        if (!source || !valid()) throw new Error("Picture changed.");
        const blob = await convertPictureBlob(
          source.blob,
          undefined,
          settings.format,
          settings.maxSide,
          settings.quality,
        );
        converted.set(
          image.assetId,
          blob.size < source.blob.size ? await prepareImageAsset(blob) : source,
        );
      }
      if (!valid()) return false;
      for (const asset of converted.values()) await options.assetStore.put(asset);
      if (!valid()) return false;
      const ids = new Set(selected.map((image) => image.id));
      const next = sheet.floatingImages.map((image) =>
        ids.has(image.id) ? { ...image, assetId: converted.get(image.assetId)!.id } : image,
      );
      const changed = next.some(
        (image, index) => image.assetId !== sheet.floatingImages[index]?.assetId,
      );
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
      options.feedback(imageAssetFeedback(error) ?? "picture.assetFailed", true);
      return false;
    } finally {
      busy.value = false;
    }
  }
  async function printPictures(): Promise<void> {
    if (busy.value || options.isBusy()) return;
    const selected = pictures();
    if (!selected.length) return;
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
        if (!source || popup.closed) throw new Error("Missing picture.");
        const blob = await convertPictureBlob(source.blob, picture.transform, "png");
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
