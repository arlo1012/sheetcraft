import { computed, nextTick, ref, watch, type Ref } from "vue";
import {
  useDismissibleFloatingPanel,
  type FloatingDismissReason,
} from "../floating/useDismissibleFloatingPanel";
import type { FloatingPanelOptions } from "../floating/useFloatingPanel";

export type MenuFocus = "first" | "last" | "selected" | "menu";

type MenuSurface = {
  rootElement?: HTMLElement | null;
  focusFirstItem?: () => void;
  focusLastItem?: () => void;
};

export type UseMenuOptions = FloatingPanelOptions & {
  triggerRef: Readonly<Ref<HTMLElement | null>>;
  menuSurfaceRef: Readonly<Ref<MenuSurface | null>>;
  disabled?: Readonly<Ref<boolean>>;
  additionalInside?: () => Iterable<HTMLElement | null | undefined>;
  restoreFocusTarget?: () => HTMLElement | null | undefined;
  defaultFocus?: MenuFocus;
  pointerFocus?: MenuFocus;
  onDismiss?: (payload: { reason: FloatingDismissReason; restoreFocus: boolean }) => void;
  onOpen?: () => void;
};

/**
 * Shared disclosure and focus behaviour for menus backed by MenuSurface.
 *
 * The caller owns menu contents and domain actions. This composable keeps the
 * trigger, floating placement, dismissal, and keyboard focus rules consistent.
 */
export function useMenu(options: UseMenuOptions) {
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
      placement: options.placement,
      padding: options.padding,
      additionalInside: options.additionalInside,
      restoreFocusTarget: options.restoreFocusTarget,
      onDismiss(payload) {
        open.value = false;
        options.onDismiss?.(payload);
      },
    },
  );

  function focusMenu(focus: MenuFocus): void {
    const surface = options.menuSurfaceRef.value;
    if (!surface) return;
    if (focus === "last") {
      surface.focusLastItem?.();
      return;
    }
    if (focus === "selected") {
      const selected = surface.rootElement?.querySelector<HTMLElement>(
        '[role="menuitemradio"][aria-checked="true"]:not([aria-disabled="true"]), [role="menuitemcheckbox"][aria-checked="true"]:not([aria-disabled="true"])',
      );
      if (selected) {
        selected.focus();
        return;
      }
    }
    if (focus === "menu") {
      const root = surface.rootElement;
      if (!root) return;
      root.tabIndex = -1;
      root.focus();
      return;
    }
    surface.focusFirstItem?.();
  }

  function openMenu(focus: MenuFocus = options.defaultFocus ?? "first"): void {
    if (options.disabled?.value) return;
    open.value = true;
    options.onOpen?.();
    void nextTick(() => {
      if (open.value) focusMenu(focus);
    });
  }

  function dismiss(reason: FloatingDismissReason = "programmatic", restoreFocus = true): void {
    dismissFloating(reason, restoreFocus);
  }

  function toggleMenu(event?: MouseEvent): void {
    if (open.value) {
      dismiss("programmatic", true);
      return;
    }
    const focus =
      event && event.detail > 0 ? (options.pointerFocus ?? options.defaultFocus) : undefined;
    openMenu(focus ?? options.defaultFocus ?? "first");
  }

  function onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openMenu(event.key === "ArrowDown" ? "first" : "last");
  }

  if (options.disabled) {
    watch(options.disabled, (disabled) => {
      if (disabled) dismiss("programmatic", false);
    });
  }

  return {
    open,
    floatingStyles,
    dismiss,
    openMenu,
    toggleMenu,
    onTriggerKeydown,
  };
}
