import { computed, nextTick, ref, watch, type Ref } from "vue";
import {
  useDismissibleFloatingPanel,
  type FloatingDismissReason,
} from "../floating/useDismissibleFloatingPanel";

type RibbonMenuFocus = "first" | "last";

type RibbonMenuSurface = {
  rootElement?: HTMLElement | null;
  focusFirstItem?: () => void;
  focusLastItem?: () => void;
};

export type RibbonMenuOptions = {
  triggerRef: Readonly<Ref<HTMLElement | null>>;
  menuSurfaceRef: Readonly<Ref<RibbonMenuSurface | null>>;
  disabled: Readonly<Ref<boolean>>;
  offset?: number;
  additionalInside?: () => Iterable<HTMLElement | null | undefined>;
  onDismiss?: (payload: { reason: FloatingDismissReason; restoreFocus: boolean }) => void;
  onOpen?: () => void;
};

/**
 * Shared menu trigger state for ribbon tools backed by MenuSurface.
 *
 * It owns disclosure keyboard behaviour and disabled-state dismissal while the
 * caller keeps the menu content and domain-specific selection logic.
 */
export function useRibbonMenu(options: RibbonMenuOptions) {
  const open = ref(false);
  const menuRef = computed<HTMLElement | null>(
    () => options.menuSurfaceRef.value?.rootElement ?? null,
  );
  const { floatingStyles, dismiss: dismissFloating } = useDismissibleFloatingPanel(
    options.triggerRef,
    menuRef,
    open,
    {
      offset: options.offset ?? 4,
      additionalInside: options.additionalInside,
      onDismiss(payload) {
        open.value = false;
        options.onDismiss?.(payload);
      },
    },
  );

  function focusMenu(position: RibbonMenuFocus): void {
    const surface = options.menuSurfaceRef.value;
    if (position === "last") surface?.focusLastItem?.();
    else surface?.focusFirstItem?.();
  }

  function openMenu(position: RibbonMenuFocus = "first"): void {
    if (options.disabled.value) return;
    open.value = true;
    options.onOpen?.();
    void nextTick(() => focusMenu(position));
  }

  function dismiss(reason: FloatingDismissReason = "programmatic", restoreFocus = true): void {
    dismissFloating(reason, restoreFocus);
  }

  function toggleMenu(): void {
    if (open.value) dismiss("programmatic", true);
    else openMenu();
  }

  function onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openMenu(event.key === "ArrowDown" ? "first" : "last");
  }

  watch(options.disabled, (disabled) => {
    if (disabled) dismiss("programmatic", false);
  });

  return {
    open,
    floatingStyles,
    dismiss,
    openMenu,
    toggleMenu,
    onTriggerKeydown,
  };
}
