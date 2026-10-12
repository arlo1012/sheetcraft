import { onBeforeUnmount, readonly, ref, watch } from "vue";
import type { Workbook } from "@sheetcraft/core/workbook";
import { collectPictureGroupAssetIds, isPictureGroup } from "@sheetcraft/core/picture-group";
import { getDetailedPictureStyleAssetIds } from "@sheetcraft/core/picture-detailed-style";
import { getShapeStyleAssetIds } from "@sheetcraft/core/shape-style";
import { readEncodedImageSource } from "./readEncodedImageSource";
import { assertImagePixelBudget } from "./imageAssetValidation";
import type { ImageAsset, ImageAssetStore } from "./imageAssetStore";

export function collectWorkbookImageAssetIds(workbook: Workbook): Set<string> {
  const ids = new Set<string>();
  for (const preset of workbook.watermarkPresets ?? []) {
    if (preset.watermark.image) ids.add(preset.watermark.image.assetId);
  }
  for (const sheet of workbook.sheets.values()) {
    if (sheet.pageDecoration?.backgroundAssetId) ids.add(sheet.pageDecoration.backgroundAssetId);
    if (sheet.pageDecoration?.watermark?.image)
      ids.add(sheet.pageDecoration.watermark.image.assetId);
    for (const drawing of sheet.drawings ?? []) {
      if (drawing.kind === "shape")
        for (const id of getShapeStyleAssetIds(drawing.shapeStyle)) ids.add(id);
    }
    for (const cell of sheet.cells.values()) {
      const content = cell.content;
      if (content?.kind === "image") {
        ids.add(content.image.assetId);
        for (const id of getDetailedPictureStyleAssetIds(
          content.image.transform?.appearance?.detailedStyle,
        ))
          ids.add(id);
      }
    }
    for (const image of sheet.floatingImages) {
      if (isPictureGroup(image)) {
        for (const id of collectPictureGroupAssetIds(image)) ids.add(id);
      } else {
        ids.add(image.assetId);
        for (const id of getDetailedPictureStyleAssetIds(
          image.transform?.appearance?.detailedStyle,
        ))
          ids.add(id);
      }
    }
  }
  return ids;
}

export function useImageAssetUrls(getWorkbook: () => Workbook, store: ImageAssetStore) {
  const urls = ref(new Map<string, string>());
  const loading = ref(new Set<string>());
  const missing = ref(new Set<string>());
  let generation = 0;
  const reading = new Map<string, Promise<ImageAsset | undefined>>();
  function read(id: string): Promise<ImageAsset | undefined> {
    const existing = reading.get(id);
    if (existing) return existing;
    const pending = (async () => {
      const asset = await store.get(id);
      if (!asset) return;
      assertImagePixelBudget(asset.width, asset.height);
      const source = await readEncodedImageSource(asset.blob);
      return { ...asset, blob: source.blob };
    })().finally(() => {
      if (reading.get(id) === pending) reading.delete(id);
    });
    reading.set(id, pending);
    return pending;
  }

  async function refresh(): Promise<void> {
    const current = ++generation;
    const ids = collectWorkbookImageAssetIds(getWorkbook());
    const retained = new Map<string, string>();
    for (const [id, url] of urls.value) {
      if (ids.has(id)) retained.set(id, url);
      else URL.revokeObjectURL(url);
    }
    loading.value = new Set([...ids].filter((id) => !retained.has(id)));
    missing.value = new Set();
    const createdUrls = new Set<string>();
    const pendingIds = [...ids].filter((id) => !retained.has(id));
    let index = 0;
    const load = async () => {
      while (index < pendingIds.length && current === generation) {
        const id = pendingIds[index++]!;
        try {
          const asset = await read(id);
          if (current !== generation) return;
          if (asset) {
            const url = URL.createObjectURL(asset.blob);
            createdUrls.add(url);
            if (current !== generation) {
              URL.revokeObjectURL(url);
              createdUrls.delete(url);
              return;
            }
            retained.set(id, url);
          } else {
            missing.value = new Set([...missing.value, id]);
          }
        } catch {
          if (current === generation) missing.value = new Set([...missing.value, id]);
        }
      }
    };
    // Header byte reads are bounded, and repeated refreshes reuse the same read.
    await Promise.all([load(), load()]);
    if (current === generation) {
      urls.value = new Map(retained);
      loading.value = new Set();
    } else {
      for (const url of createdUrls) URL.revokeObjectURL(url);
    }
  }

  watch(
    () => {
      const workbook = getWorkbook();
      return [workbook, ...[...collectWorkbookImageAssetIds(workbook)].sort()];
    },
    () => {
      void refresh();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation += 1;
    for (const url of urls.value.values()) URL.revokeObjectURL(url);
  });
  return {
    urls: readonly(urls),
    loading: readonly(loading),
    missing: readonly(missing),
    refresh,
  };
}
