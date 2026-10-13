import { computed, nextTick, onMounted, watch, type Ref } from "vue";
import {
  useDismissibleFloatingPanel,
  type DismissibleFloatingPanelOptions,
} from "../floating/useDismissibleFloatingPanel";
import type { FloatingReference } from "../floating/useFloatingPanel";

export type ContextMenuPoint = {
  clientX: number;
  clientY: number;
};

/**
 * Creates the Floating UI reference for a pointer-opened context menu.
 *
 * Keyboard-opened menus should use their triggering focusable HTML/SVG element directly so
 * dismissal can restore focus. Point references deliberately do not focus a
 * background element when dismissed.
 */
export function createContextMenuPoint(
  point: ContextMenuPoint,
  contextElement?: Element | null,
): FloatingReference {
  return {
    contextElement: contextElement ?? undefined,
    getBoundingClientRect: () => new DOMRect(point.clientX, point.clientY, 0, 0),
  };
}

export type UseContextMenuOptions = DismissibleFloatingPanelOptions & {
  anchor: Readonly<Ref<FloatingReference | null>>;
  panelRef: Readonly<Ref<HTMLElement | null>>;
  open: Readonly<Ref<boolean>>;
  surfaceRef?: Readonly<Ref<ContextMenuSurface | null>>;
  focusOpen?: Readonly<Ref<boolean>>;
};

type ContextMenuSurface = {
  focusFirstItem?: () => void;
};

/**
 * Shared placement and dismissal behaviour for context menus.
 *
 * Callers keep their domain actions and open state. This only owns the common
 * floating contract: fixed Floating UI placement, viewport avoidance, escape,
 * outside dismissal, and focus restoration for element anchors.
 */
export function useContextMenu(options: UseContextMenuOptions) {
  const { anchor, panelRef, open, surfaceRef, focusOpen, ...floatingOptions } = options;
  const reference = computed(() => anchor.value);
  const contextMenu = useDismissibleFloatingPanel(reference, panelRef, open, {
    ...floatingOptions,
  });

  function focusFirstItem(): void {
    void nextTick(() => {
      if ((focusOpen ?? open).value) surfaceRef?.value?.focusFirstItem?.();
    });
  }

  onMounted(() => {
    if ((focusOpen ?? open).value) focusFirstItem();
  });
  watch(focusOpen ?? open, (isOpen) => {
    if (isOpen) focusFirstItem();
  });

  return contextMenu;
}
