import { computed, readonly, ref } from "vue";
import type { SheetPageDecoration } from "@idea10/core/page-decoration";
import type { Sheet, Workbook } from "@idea10/core/workbook";
import type { ImageAssetStore } from "../image-assets/imageAssetStore";
import { ImageAssetError, prepareImageAsset } from "../image-assets/prepareImageAsset";

export type PageDecorationFeedback = "invalidImage" | "failed";

/** Owns file preparation only; Core owns the resulting sheet-state command and undo entry. */
export function usePageDecorationActions(options: {
  assetStore: ImageAssetStore;
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration?: () => number;
  flushPendingEdits: () => boolean;
  setDecoration: (sheetId: string, decoration: SheetPageDecoration) => void;
}) {
  const busy = ref(false);
  const feedback = ref<PageDecorationFeedback>();
  const current = computed(() => options.getSheet().pageDecoration ?? {});
  const isCurrent = (workbook: Workbook, sheetId: string, generation: number | undefined) =>
    options.getWorkbook() === workbook &&
    options.getSheet().id === sheetId &&
    options.getGeneration?.() === generation &&
    !options.getSheet().properties.protected;

  function update(change: Partial<SheetPageDecoration>): void {
    const sheet = options.getSheet();
    if (busy.value || sheet.properties.protected || !options.flushPendingEdits()) return;
    options.setDecoration(sheet.id, { ...current.value, ...change });
  }

  function replace(decoration: SheetPageDecoration): void {
    const sheet = options.getSheet();
    if (busy.value || sheet.properties.protected || !options.flushPendingEdits()) return;
    options.setDecoration(sheet.id, decoration);
  }

  async function setBackgroundFile(file: File): Promise<void> {
    const sheet = options.getSheet();
    if (busy.value || sheet.properties.protected || !options.flushPendingEdits()) return;
    const workbook = options.getWorkbook();
    const generation = options.getGeneration?.();
    busy.value = true;
    feedback.value = undefined;
    try {
      const asset = await prepareImageAsset(file);
      if (!isCurrent(workbook, sheet.id, generation)) return;
      await options.assetStore.put(asset);
      if (!isCurrent(workbook, sheet.id, generation)) return;
      options.setDecoration(sheet.id, { ...current.value, backgroundAssetId: asset.id });
    } catch (error) {
      feedback.value = error instanceof ImageAssetError ? "invalidImage" : "failed";
    } finally {
      busy.value = false;
    }
  }

  function removeBackground(): void {
    const { backgroundAssetId: _backgroundAssetId, ...rest } = current.value;
    replace(rest);
  }

  function setWatermark(watermark: SheetPageDecoration["watermark"]): void {
    update({ watermark });
  }

  function removeWatermark(): void {
    const { watermark: _watermark, ...rest } = current.value;
    replace(rest);
  }

  return {
    busy: readonly(busy),
    feedback: readonly(feedback),
    current,
    setBackgroundFile,
    removeBackground,
    setWatermark,
    removeWatermark,
  };
}
