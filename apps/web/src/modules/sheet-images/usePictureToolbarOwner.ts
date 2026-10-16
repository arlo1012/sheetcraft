import type { PictureEffectEdit } from "./picture-effect-edit";
import { computed, getCurrentScope, onScopeDispose, watch } from "vue";
import { arePictureObjectsEqual } from "@sheetcraft/core/picture-object";
import { isPictureGroup } from "@sheetcraft/core";
import {
  cloneFloatingImage,
  normalizeImageTransform,
  type FloatingImage,
  type ImageAppearance,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  getPictureToolGeometry,
  resizePictureTo,
  type PictureSizeEdit,
} from "./picture-tool-geometry";

/** A ribbon intent belongs to the displayed source and geometry, not the latest target. */
export function usePictureToolbarOwner(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getImage: () => FloatingImage | undefined;
  getSelectedIds: () => readonly string[];
  getFrameContext: () => PictureFrameLayoutContext | undefined;
  isBusy: () => boolean;
  resize: (source: FloatingImage, edit: PictureSizeEdit) => boolean;
  aspectRatio: (source: FloatingImage, locked: boolean) => boolean;
  appearance?: (patch: Partial<ImageAppearance> | undefined) => boolean;
  effect?: (edit: PictureEffectEdit) => boolean;
}) {
  let leaseEpoch = 0;
  let disposed = false;
  watch(
    [
      options.getWorkbook,
      options.getSheet,
      options.getGeneration,
      options.getImage,
      () => JSON.stringify(options.getSelectedIds()),
      options.getFrameContext,
    ],
    () => {
      leaseEpoch += 1;
    },
    { flush: "sync" },
  );
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
      leaseEpoch += 1;
    });
  let draftSequence = 0;
  let numericMutation: { pending: boolean } | undefined;
  function numericSourceSignature(): string {
    const sheet = options.getSheet();
    return JSON.stringify(
      options.getSelectedIds().map((id) => {
        const source = sheet.floatingImages.find((entry) => entry.id === id);
        return source ? cloneFloatingImage(source) : null;
      }),
    );
  }
  watch(
    [
      options.getWorkbook,
      options.getSheet,
      options.getGeneration,
      () => options.getImage()?.id,
      () => JSON.stringify(options.getSelectedIds()),
      numericSourceSignature,
      options.getFrameContext,
    ],
    (next, previous) => {
      const sourceOnly = next.every((value, index) => index === 5 || value === previous[index]);
      if (sourceOnly && numericMutation) numericMutation.pending = true;
      else draftSequence += 1;
    },
    { flush: "sync" },
  );
  let appearanceSequence = 0;
  function appearanceSourceSignature(): string {
    const sheet = options.getSheet();
    return JSON.stringify(
      options.getSelectedIds().map((id) => {
        const original = sheet.floatingImages.find((entry) => entry.id === id);
        if (!original) return null;
        const source = cloneFloatingImage(original);
        if (isPictureGroup(source)) return source;
        return {
          ...source,
          transform: normalizeImageTransform({ ...source.transform, appearance: undefined }),
        };
      }),
    );
  }
  watch(
    [
      options.getWorkbook,
      options.getSheet,
      options.getGeneration,
      () => options.getImage()?.id,
      () => JSON.stringify(options.getSelectedIds()),
      appearanceSourceSignature,
      options.getFrameContext,
    ],
    () => {
      appearanceSequence += 1;
    },
    { flush: "sync" },
  );
  return computed(() => {
    const displayed = options.getImage();
    if (!displayed) return undefined;
    const lease = leaseEpoch;
    const image = cloneFloatingImage(displayed);
    const workbook = options.getWorkbook(),
      sheet = options.getSheet();
    const generation = options.getGeneration(),
      ids = [...options.getSelectedIds()];
    const sources = ids
      .map((id) => sheet.floatingImages.find((entry) => entry.id === id))
      .map((source) => (source ? cloneFloatingImage(source) : undefined));
    const context = options.getFrameContext();
    let geometry: ReturnType<typeof getPictureToolGeometry>;
    try {
      geometry = getPictureToolGeometry(image, context);
    } catch {
      geometry = undefined;
    }
    function current(): boolean {
      const target = options.getImage();
      return (
        !disposed &&
        lease === leaseEpoch &&
        !options.isBusy() &&
        options.getWorkbook() === workbook &&
        options.getSheet() === sheet &&
        workbook.sheets.get(sheet.id) === sheet &&
        options.getGeneration() === generation &&
        JSON.stringify(options.getSelectedIds()) === JSON.stringify(ids) &&
        target !== undefined &&
        arePictureObjectsEqual(target, image) &&
        sources.every(
          (source) =>
            source !== undefined &&
            sheet.floatingImages.some(
              (entry) => entry.id === source.id && arePictureObjectsEqual(entry, source),
            ),
        ) &&
        options.getFrameContext() === context
      );
    }
    function retainNumericDraft(
      commit: () => boolean,
      expected: FloatingImage | null | undefined,
    ): boolean {
      if (!current() || numericMutation) return false;
      const mutation = { pending: false };
      numericMutation = mutation;
      let accepted = false;
      try {
        accepted = commit();
        return accepted;
      } finally {
        const target = options.getImage();
        const sameOwner =
          options.getWorkbook() === workbook &&
          options.getSheet() === sheet &&
          options.getGeneration() === generation &&
          JSON.stringify(options.getSelectedIds()) === JSON.stringify(ids) &&
          options.getFrameContext() === context;
        const exactOwnedChange =
          expected &&
          target &&
          arePictureObjectsEqual(target, expected) &&
          sources.every(
            (source) =>
              source &&
              (source.id === image.id ||
                sheet.floatingImages.some(
                  (entry) => entry.id === source.id && arePictureObjectsEqual(entry, source),
                )),
          );
        if (mutation.pending && (!accepted || !sameOwner || !exactOwnedChange)) draftSequence += 1;
        numericMutation = undefined;
      }
    }
    return {
      key: `${generation}:${sheet.id}:${image.id}`,
      draftKey: draftSequence,
      appearanceDraftKey: appearanceSequence,
      geometry,
      resize: (edit: PictureSizeEdit): boolean => {
        if (!current()) return false;
        let expected: FloatingImage | null | undefined;
        try {
          expected = resizePictureTo(image, edit, context);
        } catch {
          expected = undefined;
        }
        return retainNumericDraft(() => options.resize(image, edit), expected);
      },
      aspectRatio: (locked: boolean): boolean =>
        retainNumericDraft(() => options.aspectRatio(image, locked), {
          ...image,
          lockAspectRatio: locked,
        }),
      appearance: (patch: Partial<ImageAppearance> | undefined): boolean =>
        current() && (options.appearance?.(patch) ?? false),
      effect: (edit: PictureEffectEdit): boolean => current() && (options.effect?.(edit) ?? false),
    };
  });
}
