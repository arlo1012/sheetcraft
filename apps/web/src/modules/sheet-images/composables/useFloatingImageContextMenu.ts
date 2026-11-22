import { computed, nextTick, type ComputedRef, type Ref } from "vue";
import {
  areFloatingImageCollectionsEqual,
  cloneFloatingImage,
  type FloatingImage as PictureObject,
} from "@sheetcraft/core/workbook";
import type { StandalonePictureObject as FloatingImage } from "@sheetcraft/core/picture-object";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { createContextMenuPoint } from "../../../shared/menu/useContextMenu";
import type { PictureContextSourceAction } from "../picture-context-source-action";

export type FloatingImageContextMenuState = {
  imageId: string;
  anchor: FloatingReference;
  trigger: HTMLElement;
  owner: object | undefined;
  rootsReference: readonly PictureObject[];
  roots: PictureObject[];
  selectedIds: string[];
};

type FloatingImageContextMenuOptions = {
  contextMenu: Ref<FloatingImageContextMenuState | undefined>;
  layerRef: Ref<HTMLElement | null>;
  currentImages: ComputedRef<readonly FloatingImage[]>;
  selectedImage: ComputedRef<FloatingImage | undefined>;
  selectedIds: ComputedRef<ReadonlySet<string>>;
  interactionReadOnly: ComputedRef<boolean>;
  getOwner: () => object | undefined;
  getSelectedImageId: () => string | null | undefined;
  getAssetUrls: () => ReadonlyMap<string, string>;
  isSourceToolsDisabled: () => boolean;
  isCroppingExternally: () => boolean;
  isPreviewOnDoubleClick: () => boolean;
  hasActiveGesture: () => boolean;
  hasActiveCrop: () => boolean;
  getLastGestureMode: () => string;
  canConvertToCell: (id: string) => boolean;
  isRootAvailable: (id: string) => boolean;
  selectionImages: () => readonly PictureObject[];
  applyCrop: () => void;
  onSelect: (id: string) => void;
  onSourceAction: (
    action: PictureContextSourceAction,
    ids: readonly string[],
    owner: object | undefined,
  ) => void;
  onConvertToCell: (id: string) => void;
  onPreview: (image: FloatingImage, trigger?: HTMLElement) => void;
  onCopy: (id: string) => void;
  onCut: (id: string) => void;
  onPaste: (id: string) => void;
  onDelete: (id: string) => void;
};

/** Owns floating-image context menu state, validation, actions, and double-click preview triggers. */
export function useFloatingImageContextMenu(options: FloatingImageContextMenuOptions) {
  const { contextMenu, layerRef, currentImages, selectedImage, selectedIds, interactionReadOnly } =
    options;

  function closeContextMenu(restoreFocus: boolean): void {
    const trigger = contextMenu.value?.trigger;
    contextMenu.value = undefined;
    if (restoreFocus) {
      void nextTick(() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      });
    }
  }

  function openContextMenu(
    image: FloatingImage,
    trigger: HTMLElement,
    anchor: FloatingReference = trigger,
  ): void {
    if (options.hasActiveGesture() || options.hasActiveCrop() || !options.isRootAvailable(image.id))
      return;
    options.onSelect(image.id);
    trigger.focus({ preventScroll: true });
    contextMenu.value = {
      imageId: image.id,
      trigger,
      anchor,
      owner: options.getOwner(),
      rootsReference: options.selectionImages(),
      roots: options.selectionImages().map(cloneFloatingImage),
      selectedIds: [...selectedIds.value],
    };
    const menu = contextMenu.value;
    // Selection is an emitted controlled contract. Allow its one render-cycle
    // acknowledgement, while uncontrolled consumers keep their original state.
    void nextTick(() => {
      if (contextMenu.value === menu && options.getSelectedImageId() === menu.imageId)
        menu.selectedIds = [...selectedIds.value];
    });
  }

  function onImageContextMenu(image: FloatingImage, event: MouseEvent): void {
    if (!options.isRootAvailable(image.id)) return;
    event.preventDefault();
    event.stopPropagation();
    const trigger = event.currentTarget as HTMLElement;
    openContextMenu(image, trigger, createContextMenuPoint(event, layerRef.value ?? trigger));
  }

  function openImageKeyboardContextMenu(image: FloatingImage, event: KeyboardEvent): boolean {
    if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return false;
    event.preventDefault();
    event.stopPropagation();
    const trigger = event.currentTarget as HTMLElement;
    openContextMenu(image, trigger);
    return true;
  }

  function isContextMenuOwnerCurrent(menu: FloatingImageContextMenuState): boolean {
    try {
      const roots = options.selectionImages();
      return (
        contextMenu.value === menu &&
        menu.owner === options.getOwner() &&
        menu.rootsReference === roots &&
        menu.selectedIds.length === selectedIds.value.size &&
        menu.selectedIds.every((id) => selectedIds.value.has(id)) &&
        areFloatingImageCollectionsEqual(menu.roots, roots)
      );
    } catch {
      return false;
    }
  }

  function requestConvertToCell(): void {
    if (options.isCroppingExternally()) return;
    const imageId = contextMenu.value?.imageId;
    if (imageId && !options.canConvertToCell(imageId)) return;
    closeContextMenu(false);
    if (imageId && !interactionReadOnly.value) options.onConvertToCell(imageId);
  }

  function requestPreview(): void {
    if (options.isCroppingExternally() || options.isSourceToolsDisabled()) return;
    const image = currentImages.value.find((entry) => entry.id === contextMenu.value?.imageId);
    const trigger = contextMenu.value?.trigger;
    closeContextMenu(false);
    if (image) options.onPreview(image, trigger);
  }

  function requestClipboard(mode: "copy" | "cut" | "paste"): void {
    const imageId = contextMenu.value?.imageId;
    closeContextMenu(true);
    if (!imageId) return;
    if (mode === "copy") options.onCopy(imageId);
    else if (mode === "cut" && !interactionReadOnly.value) options.onCut(imageId);
    else if (mode === "paste" && !interactionReadOnly.value) options.onPaste(imageId);
  }

  function requestDelete(): void {
    const imageId = contextMenu.value?.imageId;
    closeContextMenu(false);
    if (imageId && !interactionReadOnly.value) options.onDelete(imageId);
  }

  const contextActions = computed(() => {
    const menu = contextMenu.value;
    const current = () => !!menu && isContextMenuOwnerCurrent(menu);
    function sourceAction(action: PictureContextSourceAction): void {
      if (
        !current() ||
        !menu ||
        options.isSourceToolsDisabled() ||
        (action !== "format" && selectedIds.value.size !== 1) ||
        options.isCroppingExternally() ||
        (interactionReadOnly.value && !["save", "preview", "format"].includes(action))
      )
        return;
      const image = currentImages.value.find((root) => root.id === menu.imageId);
      if (
        !image ||
        (action !== "replace" && action !== "format" && !options.getAssetUrls().has(image.assetId))
      )
        return;
      closeContextMenu(false);
      options.onSourceAction(action, [menu.imageId], menu.owner);
    }
    return {
      replace: () => sourceAction("replace"),
      save: () => sourceAction("save"),
      crop: () => sourceAction("crop"),
      annotate: () => sourceAction("annotate"),
      format: () => sourceAction("format"),
      copy: () => {
        if (current()) requestClipboard("copy");
      },
      cut: () => {
        if (current()) requestClipboard("cut");
      },
      paste: () => {
        if (current()) requestClipboard("paste");
      },
      preview: () => {
        if (current()) requestPreview();
      },
      convert: () => {
        if (current()) requestConvertToCell();
      },
      delete: () => {
        if (current()) requestDelete();
      },
      close: (restoreFocus: boolean) => {
        if (contextMenu.value === menu) closeContextMenu(restoreFocus);
      },
    };
  });

  function onImageDoubleClick(image: FloatingImage, event: MouseEvent): void {
    if (!options.isRootAvailable(image.id)) return;
    if (options.hasActiveCrop()) {
      options.applyCrop();
      return;
    }
    if (options.isPreviewOnDoubleClick() && !options.isCroppingExternally())
      options.onPreview(image, event.currentTarget as HTMLElement);
  }

  function onLayerDoubleClick(event: MouseEvent): void {
    // Pointer capture keeps drags alive across frozen panes and retargets clicks to this layer.
    if (
      options.hasActiveCrop() ||
      options.isCroppingExternally() ||
      event.target !== event.currentTarget ||
      options.hasActiveGesture() ||
      options.getLastGestureMode() !== "move" ||
      !options.isPreviewOnDoubleClick()
    )
      return;
    const image = currentImages.value.find((entry) => entry.id === options.getSelectedImageId());
    if (image)
      options.onPreview(
        image,
        layerRef.value?.querySelector<HTMLElement>(".is-selected") ?? undefined,
      );
  }

  function openSelectedContextMenu(event: MouseEvent): void {
    const image = selectedImage.value;
    const layer = layerRef.value;
    if (!image || !layer || selectedIds.value.size !== 1) return;
    openContextMenu(image, layer, createContextMenuPoint(event, layer));
  }

  return {
    closeContextMenu,
    openContextMenu,
    onImageContextMenu,
    openImageKeyboardContextMenu,
    contextActions,
    onImageDoubleClick,
    onLayerDoubleClick,
    openSelectedContextMenu,
  };
}
