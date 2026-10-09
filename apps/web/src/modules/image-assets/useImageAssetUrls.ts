import { onBeforeUnmount, readonly, ref, watch } from "vue";
import type { Workbook } from "@sheetcraft/core/workbook";
import type { ImageAssetStore } from "./imageAssetStore";

export function collectWorkbookImageAssetIds(workbook: Workbook): Set<string> {
  const ids = new Set<string>();
  for (const preset of workbook.watermarkPresets ?? []) {
    if (preset.watermark.image) ids.add(preset.watermark.image.assetId);
  }
  for (const sheet of workbook.sheets.values()) {
    if (sheet.pageDecoration?.backgroundAssetId) ids.add(sheet.pageDecoration.backgroundAssetId);
    if (sheet.pageDecoration?.watermark?.image)
      ids.add(sheet.pageDecoration.watermark.image.assetId);
    for (const cell of sheet.cells.values()) {
      const content = cell.content;
      if (content?.kind === "image") ids.add(content.image.assetId);
    }
    for (const image of sheet.floatingImages) ids.add(image.assetId);
  }
  return ids;
}

export function useImageAssetUrls(getWorkbook: () => Workbook, store: ImageAssetStore) {
  const urls = ref(new Map<string, string>());
  const loading = ref(new Set<string>());
  const missing = ref(new Set<string>());
  let generation = 0;

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
    await Promise.all(
      [...ids].map(async (id) => {
        if (retained.has(id)) return;
        try {
          const asset = await store.get(id);
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
      }),
    );
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
  return { urls: readonly(urls), loading: readonly(loading), missing: readonly(missing), refresh };
}
