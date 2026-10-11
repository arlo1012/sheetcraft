import {
  arePictureObjectsEqual,
  isFramedPictureObject,
  normalizePictureObjectCollection,
} from "@sheetcraft/core/picture-object";
import { pictureFrameFromLegacy, resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { traversePictureGroup, type PictureGroupPath } from "@sheetcraft/core/picture-group";
import { groupPictureRoots, ungroupPictureRoot } from "@sheetcraft/core/picture-group-planning";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { resizePictureTo, type PictureSizeEdit } from "./picture-tool-geometry";
import { requireLegacyPictures, requireStandalonePictures } from "./picture-document-support";
import { ref, type Ref } from "vue";
import {
  createSetSheetFloatingImagesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  canUseSheetPermission,
  isPictureGroup,
  planDeletePictureGroupNodes,
} from "@sheetcraft/core";
import {
  normalizeImageTransform,
  areFloatingImageCollectionsEqual,
  type ImageAppearance,
  type FloatingImage,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { MessageKey } from "../../shared/i18n";
export type PictureLayerAction = "front" | "forward" | "backward" | "back";
export type PictureAlignment =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "both"
  | "bottom"
  | "horizontal"
  | "vertical"
  | "grid";
export type PictureAlignmentReference = "selection" | "last-selected";

export function usePictureTools(options: {
  getSheet: () => Sheet;
  selectedIds: Ref<string[]>;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  getFrameContext?: () => PictureFrameLayoutContext | undefined;
}) {
  const paneVisible = ref(false);
  const sizeFeedback = ref<MessageKey>();
  const operationFeedback = ref<MessageKey>();
  const idFactory = createBrowserIdFactory();
  type EditLease = {
    sheet: Sheet;
    sheetId: string;
    forest: FloatingImage[];
    selectedIds: string[];
    context: PictureFrameLayoutContext | undefined;
    metrics: PictureFrameLayoutContext["metrics"] | undefined;
    layout: PictureFrameLayoutContext["layout"] | undefined;
  };
  function capture(): EditLease {
    const sheet = options.getSheet();
    const sheetId = sheet.id;
    const selectedIds = [...options.selectedIds.value];
    const forest = normalizePictureObjectCollection(sheet.floatingImages);
    const context = options.getFrameContext?.();
    return {
      sheet,
      sheetId,
      forest,
      selectedIds,
      context,
      metrics: context?.metrics,
      layout: context?.layout,
    };
  }
  function isCurrent(lease: EditLease): boolean {
    const context = options.getFrameContext?.();
    const sheet = options.getSheet();
    const selectedIds = options.selectedIds.value;
    return (
      sheet === lease.sheet &&
      sheet.id === lease.sheetId &&
      context === lease.context &&
      context?.metrics === lease.metrics &&
      context?.layout === lease.layout &&
      selectedIds.length === lease.selectedIds.length &&
      selectedIds.every((id, index) => id === lease.selectedIds[index]) &&
      areFloatingImageCollectionsEqual(sheet.floatingImages, lease.forest) &&
      !options.isBusy() &&
      canUseSheetPermission(sheet, "editObjects")
    );
  }
  function validateForest(images: readonly FloatingImage[], lease: EditLease): void {
    for (const image of images) {
      if (!lease.metrics) {
        if (isPictureGroup(image) || isFramedPictureObject(image))
          throw new Error("Current worksheet frame geometry is required.");
        continue;
      }
      if (isPictureGroup(image)) resolvePictureGroup(image, lease.metrics);
      else
        resolvePictureFrame(
          isFramedPictureObject(image) ? image.frame : pictureFrameFromLegacy(image, lease.metrics),
          lease.metrics,
        );
    }
  }
  /** One detached complete-forest plan; no selection or draft changes before acceptance. */
  function replace(images: readonly FloatingImage[], lease: EditLease): boolean {
    if (!isCurrent(lease)) return false;
    validateForest(lease.forest, lease);
    const command = createSetSheetFloatingImagesCommand(lease.sheetId, images);
    validateForest(command.images, lease);
    if (!isCurrent(lease)) return false;
    if (areFloatingImageCollectionsEqual(lease.forest, command.images)) return true;
    return options.execute(command) !== false;
  }
  function updateChanges(images: readonly FloatingImage[], lease: EditLease): boolean {
    const changes = new Map(images.map((image) => [image.id, image]));
    return replace(
      lease.forest.map((image) => changes.get(image.id) ?? image),
      lease,
    );
  }
  function updateMany(images: readonly FloatingImage[]): boolean {
    try {
      return updateChanges(images, capture());
    } catch {
      return false;
    }
  }
  function replaceAll(images: readonly FloatingImage[]): boolean {
    try {
      return replace(images, capture());
    } catch {
      return false;
    }
  }
  function currentSingle(source: FloatingImage): FloatingImage | undefined {
    const ids = options.selectedIds.value;
    if (ids.length !== 1 || ids[0] !== source.id) return undefined;
    const target = options.getSheet().floatingImages.find((image) => image.id === source.id);
    return target && arePictureObjectsEqual(source, target) ? target : undefined;
  }
  function resizeOne(source: FloatingImage, edit: PictureSizeEdit): boolean {
    sizeFeedback.value = undefined;
    operationFeedback.value = undefined;
    const target = currentSingle(source);
    if (!target || options.isBusy() || !canUseSheetPermission(options.getSheet(), "editObjects")) {
      sizeFeedback.value = "picture.operationFailed";
      return false;
    }
    let next: FloatingImage | null;
    let lease: EditLease;
    try {
      lease = capture();
      next = resizePictureTo(target, edit, lease.context);
    } catch (error) {
      sizeFeedback.value =
        error instanceof RangeError ? "picture.invalidSize" : "picture.operationFailed";
      return false;
    }
    try {
      if (next && updateChanges([next], lease)) return true;
    } catch {
      // A rejected or throwing command leaves the caller's source draft intact.
    }
    sizeFeedback.value = "picture.operationFailed";
    return false;
  }
  function setAspectRatio(source: FloatingImage, locked: boolean): boolean {
    operationFeedback.value = undefined;
    sizeFeedback.value = undefined;
    const target = currentSingle(source);
    if (
      !target ||
      typeof locked !== "boolean" ||
      !updateMany([{ ...target, lockAspectRatio: locked }])
    ) {
      operationFeedback.value = "picture.operationFailed";
      return false;
    }
    return true;
  }
  function deletedSelection(lease: EditLease, next: readonly FloatingImage[]): string[] {
    const rootIds = new Set(next.map((image) => image.id));
    const selected = new Set(lease.selectedIds);
    // Dissolving a selected owner selects its actual promoted survivor.
    for (const root of lease.forest) {
      if (!selected.has(root.id) || rootIds.has(root.id) || !isPictureGroup(root)) continue;
      for (const { node } of traversePictureGroup(root))
        if (rootIds.has(node.id)) selected.add(node.id);
    }
    return next.filter((root) => selected.has(root.id)).map((root) => root.id);
  }
  function remove(ids = options.selectedIds.value): boolean {
    operationFeedback.value = undefined;
    try {
      const lease = capture();
      if (!Array.isArray(ids) || (lease.metrics && ids.length > lease.forest.length))
        throw new Error("Deletion target budget exceeded.");
      const targets = [...ids];
      if (lease.metrics && new Set(targets).size !== targets.length)
        throw new Error("Duplicate deletion targets.");
      const next = lease.metrics
        ? planDeletePictureGroupNodes(
            lease.forest,
            targets.map((id) => [id]),
            lease.metrics,
          )
        : lease.forest.filter((image) => !targets.includes(image.id));
      if (replace(next, lease)) {
        options.selectedIds.value = deletedSelection(lease, next);
        return true;
      }
    } catch {
      // Missing/reparented targets and invalid hidden geometry reject the full plan.
    }
    operationFeedback.value = "picture.operationFailed";
    return false;
  }
  function deletePaths(paths: readonly PictureGroupPath[]): boolean {
    operationFeedback.value = undefined;
    try {
      const lease = capture();
      if (!lease.metrics) throw new Error("Owned deletion requires current frame geometry.");
      const next = planDeletePictureGroupNodes(lease.forest, paths, lease.metrics);
      if (replace(next, lease)) {
        options.selectedIds.value = deletedSelection(lease, next);
        return true;
      }
    } catch {
      // The planner validates the exact root/owner path before singleton dissolution.
    }
    operationFeedback.value = "picture.operationFailed";
    return false;
  }
  function deletePath(path: PictureGroupPath): boolean {
    return deletePaths([path]);
  }
  function clearFlatGroups(lease: EditLease, ids: ReadonlySet<string>): FloatingImage[] {
    const selected = requireStandalonePictures(lease.forest.filter((root) => ids.has(root.id)));
    const groups = new Set(selected.map((image) => image.groupId).filter(Boolean));
    return lease.forest.map((image) =>
      !isPictureGroup(image) && (ids.has(image.id) || (image.groupId && groups.has(image.groupId)))
        ? { ...image, groupId: undefined }
        : image,
    );
  }
  function group(ungroup = false, targetIds = options.selectedIds.value): boolean {
    operationFeedback.value = undefined;
    try {
      const lease = capture();
      if (!Array.isArray(targetIds) || targetIds.length > lease.forest.length)
        throw new Error("Grouping target budget exceeded.");
      const targets = [...targetIds];
      const ids = new Set(targets);
      if (
        ids.size !== targets.length ||
        targets.some((id) => !lease.forest.some((image) => image.id === id)) ||
        (!ungroup && ids.size < 2)
      )
        throw new Error("Grouping requires exact current root IDs.");
      if (lease.metrics) {
        let next: FloatingImage[];
        let selectedIds: string[];
        if (ungroup) {
          const selected = lease.forest.filter((root) => ids.has(root.id));
          if (!selected.length) throw new Error("Ungrouping requires current roots.");
          if (selected.every((root) => !isPictureGroup(root))) {
            // Existing flat membership remains a distinct standalone metadata operation.
            if (replace(clearFlatGroups(lease, ids), lease)) return true;
            throw new Error("Flat ungroup command was refused.");
          }
          if (selected.some((root) => !isPictureGroup(root)))
            throw new Error("Cannot mix owned and flat ungroup targets.");
          next = lease.forest;
          selectedIds = [];
          for (const root of selected) {
            if (!isPictureGroup(root)) continue;
            selectedIds.push(...root.members.map((member) => member.id));
            next = ungroupPictureRoot(next, root.id, lease.metrics);
          }
        } else {
          const id = idFactory("picture-group");
          next = groupPictureRoots(lease.forest, targets, { id, altText: "" }, lease.metrics);
          selectedIds = [id];
        }
        if (replace(next, lease)) {
          options.selectedIds.value = selectedIds;
          return true;
        }
      } else {
        if (options.getFrameContext)
          throw new Error("Current worksheet group geometry is required.");
        // Compatibility for callers that explicitly omit the prepared frame context.
        // This path never turns flat groupId membership into an owned container.
        const selected = requireLegacyPictures(lease.forest.filter((image) => ids.has(image.id)));
        const groups = new Set(selected.map((image) => image.groupId).filter(Boolean));
        const groupId = ungroup ? undefined : idFactory("picture-group");
        const next = requireLegacyPictures(lease.forest).map((image) =>
          ids.has(image.id) || (image.groupId && groups.has(image.groupId))
            ? { ...image, groupId }
            : image,
        );
        if (replace(next, lease)) return true;
      }
    } catch {
      // Geometry, stale context and command rejection all retain the exact selection.
    }
    operationFeedback.value = "picture.operationFailed";
    return false;
  }
  function layer(action: PictureLayerAction): void {
    try {
      const lease = capture();
      const images = [...lease.forest];
      if (images.length < 2) return;
      const selected = new Set(lease.selectedIds);
      if (action === "front")
        replace(
          [
            ...images.filter((image) => !selected.has(image.id)),
            ...images.filter((image) => selected.has(image.id)),
          ],
          lease,
        );
      else if (action === "back")
        replace(
          [
            ...images.filter((image) => selected.has(image.id)),
            ...images.filter((image) => !selected.has(image.id)),
          ],
          lease,
        );
      else {
        const start = action === "forward" ? images.length - 2 : 1;
        const end = action === "forward" ? -1 : images.length;
        const step = action === "forward" ? -1 : 1;
        for (let index = start; index !== end; index += step) {
          const neighbor = index - step;
          if (selected.has(images[index]!.id) && !selected.has(images[neighbor]!.id))
            [images[index], images[neighbor]] = [images[neighbor]!, images[index]!];
        }
        replace(images, lease);
      }
    } catch {
      operationFeedback.value = "picture.operationFailed";
    }
  }
  function resizeMany(value: {
    width: number;
    height: number;
    locked: boolean;
    all: boolean;
  }): boolean {
    sizeFeedback.value = undefined;
    if (options.isBusy() || !canUseSheetPermission(options.getSheet(), "editObjects")) {
      sizeFeedback.value = "picture.operationFailed";
      return false;
    }
    const targets = options
      .getSheet()
      .floatingImages.filter((image) => value.all || options.selectedIds.value.includes(image.id));
    const ids = options.selectedIds.value;
    if (
      (!value.all && (new Set(ids).size !== ids.length || targets.length !== ids.length)) ||
      targets.some((image) => isFramedPictureObject(image) || isPictureGroup(image))
    ) {
      sizeFeedback.value = "picture.operationFailed";
      return false;
    }
    const images = requireLegacyPictures(targets).map((image) => ({
      ...image,
      width: value.width,
      height: value.locked ? (image.height * value.width) / image.width : value.height,
    }));
    if (
      !images.length ||
      images.some(
        (image) =>
          !Number.isFinite(image.width) ||
          !Number.isFinite(image.height) ||
          image.width < 1 ||
          image.width > 10000 ||
          image.height < 1 ||
          image.height > 10000,
      )
    ) {
      sizeFeedback.value = "picture.invalidSize";
      return false;
    }
    if (!updateMany(images)) {
      sizeFeedback.value = "picture.operationFailed";
      return false;
    }
    return true;
  }
  function applyAppearance(patch: Partial<ImageAppearance> | undefined): boolean {
    operationFeedback.value = undefined;
    sizeFeedback.value = undefined;
    const ids = options.selectedIds.value;
    const targets = options.getSheet().floatingImages.filter((image) => ids.includes(image.id));
    if (
      !ids.length ||
      new Set(ids).size !== ids.length ||
      targets.length !== ids.length ||
      targets.some(isPictureGroup) ||
      (patch?.reflection === true && targets.some(isFramedPictureObject))
    ) {
      operationFeedback.value = "picture.operationFailed";
      return false;
    }
    try {
      const accepted = updateMany(
        requireStandalonePictures(targets).map((image): FloatingImage => {
          const appearance = normalizeImageTransform({
            appearance: patch ? { ...image.transform?.appearance, ...patch } : undefined,
          })?.appearance;
          if (isFramedPictureObject(image))
            return {
              ...image,
              transform: { annotations: image.transform?.annotations, appearance },
            };
          return {
            ...image,
            transform: normalizeImageTransform({ ...image.transform, appearance }),
          };
        }),
      );
      if (!accepted) operationFeedback.value = "picture.operationFailed";
      return accepted;
    } catch {
      operationFeedback.value = "picture.operationFailed";
      return false;
    }
  }
  function updateMetadata(
    source: FloatingImage,
    patch: (current: FloatingImage) => FloatingImage,
  ): boolean {
    try {
      const lease = capture();
      const target = lease.forest.find((image) => image.id === source.id);
      if (!target || !arePictureObjectsEqual(source, target)) return false;
      return updateChanges([patch(target)], lease);
    } catch {
      return false;
    }
  }
  function toggleVisibility(image: FloatingImage): boolean {
    return updateMetadata(image, (current) => ({ ...current, hidden: !current.hidden }));
  }
  function rename(image: FloatingImage, name: string): boolean {
    return updateMetadata(image, (current) => ({ ...current, altText: name }));
  }
  function clearFeedback(): void {
    sizeFeedback.value = undefined;
    operationFeedback.value = undefined;
  }
  return {
    clearFeedback,
    applyAppearance,
    paneVisible,
    updateMany,
    replaceAll,
    remove,
    deletePath,
    deletePaths,
    group,
    layer,
    toggleVisibility,
    rename,
    resizeMany,
    resizeOne,
    setAspectRatio,
    sizeFeedback,
    operationFeedback,
  };
}
