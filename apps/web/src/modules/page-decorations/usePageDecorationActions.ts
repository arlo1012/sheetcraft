import { computed, readonly, ref } from "vue";
import type {
  SheetPageDecoration,
  SheetWatermark,
  WatermarkPreset,
} from "@sheetcraft/core/page-decoration";
import type { Sheet, Workbook } from "@sheetcraft/core/workbook";
import type { ImageAssetStore } from "../image-assets/imageAssetStore";
import { ImageAssetError, prepareImageAsset } from "../image-assets/prepareImageAsset";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";

export type PageDecorationFeedback = "invalidImage" | "failed" | "protectedSheets";
export type WatermarkScope = "sheet" | "workbook";

/** Owns file preparation only; Core owns the resulting sheet-state command and undo entry. */
export function usePageDecorationActions(options: {
  assetStore: ImageAssetStore;
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration?: () => number;
  flushPendingEdits: () => boolean;
  setDecoration: (sheetId: string, decoration: SheetPageDecoration) => void;
  setWatermarks: (
    sheetIds: string[],
    watermark: SheetWatermark | undefined,
    presets?: readonly WatermarkPreset[],
  ) => void;
  setPresets: (presets: readonly WatermarkPreset[]) => void;
}) {
  const busy = ref(false);
  const feedback = ref<PageDecorationFeedback>();
  let watermarkRequest = 0;
  const idFactory = createBrowserIdFactory();
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

  async function setBackgroundFile(
    file: File,
    resolution?: "independent" | "remove",
  ): Promise<void> {
    const sheet = options.getSheet();
    if (busy.value || sheet.properties.protected || !options.flushPendingEdits()) return;
    if (current.value.watermark && current.value.watermark.mode !== "independent" && !resolution)
      return;
    const workbook = options.getWorkbook();
    const generation = options.getGeneration?.();
    busy.value = true;
    feedback.value = undefined;
    try {
      const asset = await prepareImageAsset(file);
      if (!isCurrent(workbook, sheet.id, generation)) return;
      await options.assetStore.put(asset);
      if (!isCurrent(workbook, sheet.id, generation)) return;
      const { watermark, ...decoration } = current.value;
      options.setDecoration(sheet.id, {
        ...decoration,
        backgroundAssetId: asset.id,
        ...(watermark && resolution !== "remove"
          ? {
              watermark:
                resolution === "independent" ? { ...watermark, mode: "independent" } : watermark,
            }
          : {}),
      });
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

  async function applyWatermark(
    watermark: SheetWatermark,
    scope: WatermarkScope,
    imageFile?: File,
    savePreset?: { id?: string; name: string },
  ): Promise<boolean> {
    if (busy.value || !options.flushPendingEdits()) return false;
    const workbook = options.getWorkbook();
    const sheetId = options.getSheet().id;
    const generation = options.getGeneration?.();
    const sheetIds = scope === "workbook" ? [...workbook.sheets.keys()] : [sheetId];
    feedback.value = undefined;
    const editable = () =>
      sheetIds.every((id) => {
        const target = workbook.sheets.get(id);
        return target && !target.properties.protected;
      });
    if (!editable()) {
      feedback.value = "protectedSheets";
      return false;
    }
    const request = ++watermarkRequest;
    busy.value = true;
    try {
      const draft = { ...watermark, ...(watermark.image ? { image: { ...watermark.image } } : {}) };
      if (imageFile && draft.image) {
        const asset = await prepareImageAsset(imageFile);
        if (request !== watermarkRequest || !isCurrent(workbook, sheetId, generation)) return false;
        await options.assetStore.put(asset);
        draft.image.assetId = asset.id;
      }
      if (request !== watermarkRequest || !isCurrent(workbook, sheetId, generation)) return false;
      if (!editable()) {
        feedback.value = "protectedSheets";
        return false;
      }
      const presets = savePreset
        ? [
            ...(workbook.watermarkPresets ?? []).filter((preset) => preset.id !== savePreset.id),
            {
              id: savePreset.id ?? idFactory("watermark"),
              name: savePreset.name,
              watermark: draft,
            },
          ]
        : undefined;
      options.setWatermarks(sheetIds, draft, presets);
      return true;
    } catch (error) {
      if (request === watermarkRequest)
        feedback.value = error instanceof ImageAssetError ? "invalidImage" : "failed";
      return false;
    } finally {
      busy.value = false;
    }
  }

  function cancelWatermark(): void {
    watermarkRequest += 1;
  }

  function deletePreset(preset: WatermarkPreset): void {
    if (busy.value || !options.flushPendingEdits()) return;
    options.setPresets(
      (options.getWorkbook().watermarkPresets ?? []).filter((entry) => entry.id !== preset.id),
    );
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
    applyWatermark,
    cancelWatermark,
    deletePreset,
    removeWatermark,
  };
}
