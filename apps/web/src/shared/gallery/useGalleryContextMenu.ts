import { computed, nextTick, shallowRef } from "vue";
import type { FloatingReference } from "../floating/useFloatingPanel";
import { createContextMenuPoint } from "../menu/useContextMenu";

type GalleryContextMenuState<T> = {
  item: T;
  trigger: HTMLElement;
  anchor: FloatingReference;
};

/**
 * Shared state for a custom gallery card's overflow/context menu.
 *
 * The gallery owns its actions; this composable keeps pointer and keyboard
 * entry points, virtual anchoring, and return-focus behaviour consistent.
 */
export function useGalleryContextMenu<T>() {
  const contextMenu = shallowRef<GalleryContextMenuState<T>>();
  const contextItem = computed(() => contextMenu.value?.item);

  function openAtPoint(item: T, trigger: HTMLElement, event: MouseEvent): void {
    contextMenu.value = {
      item,
      trigger,
      anchor: createContextMenuPoint(event, trigger),
    };
  }

  function openAtElement(item: T, trigger: HTMLElement): void {
    contextMenu.value = { item, trigger, anchor: trigger };
  }

  function close(restoreFocus: boolean): void {
    const trigger = contextMenu.value?.trigger;
    contextMenu.value = undefined;
    if (restoreFocus && trigger?.isConnected) {
      void nextTick(() => trigger.focus({ preventScroll: true }));
    }
  }

  return { contextMenu, contextItem, openAtPoint, openAtElement, close };
}
