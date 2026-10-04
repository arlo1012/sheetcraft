import { computed, nextTick, shallowRef, watch, type Ref } from "vue";
import { useFloatingPanel } from "../floating/useFloatingPanel";

type MenuSurface = {
  rootElement?: HTMLElement | null;
  focusFirstItem?: () => void;
};

export type UseSubmenuOptions<Name> = {
  parentOpen: Readonly<Ref<boolean>>;
  submenuSurfaceRef: Readonly<Ref<MenuSurface | null>>;
  getAnchor: (name: Name) => HTMLElement | null;
  placement?: Readonly<Ref<"right-start" | "bottom-end">> | "right-start" | "bottom-end";
  offset?: number;
  padding?: number;
  onOpen?: (name: Name) => void;
  focus?: (surface: MenuSurface) => void;
};

/**
 * Shared state, placement, and keyboard transitions for one level of a menu.
 * The owning menu still supplies the concrete entries and domain actions.
 */
export function useSubmenu<Name>(options: UseSubmenuOptions<Name>) {
  const activeSubmenu = shallowRef<Name | null>(null);
  const submenuElement = computed<HTMLElement | null>(
    () => options.submenuSurfaceRef.value?.rootElement ?? null,
  );
  const submenuAnchor = computed(() =>
    activeSubmenu.value ? options.getAnchor(activeSubmenu.value) : null,
  );
  const submenuOpen = computed(() => activeSubmenu.value !== null);
  const { floatingStyles: submenuStyles } = useFloatingPanel(
    submenuAnchor,
    submenuElement,
    submenuOpen,
    {
      placement: options.placement ?? "right-start",
      offset: options.offset ?? 4,
      padding: options.padding,
    },
  );

  function openSubmenu(name: Name, focus = true): void {
    if (!options.parentOpen.value) return;
    activeSubmenu.value = name;
    options.onOpen?.(name);
    if (focus)
      void nextTick(() => {
        if (activeSubmenu.value !== name || !options.parentOpen.value) return;
        const surface = options.submenuSurfaceRef.value;
        if (surface) (options.focus ?? ((menu) => menu.focusFirstItem?.()))(surface);
      });
  }

  function openSubmenuOnHover(name: Name): void {
    openSubmenu(name, false);
  }

  function closeSubmenu(restoreFocus = true): void {
    const name = activeSubmenu.value;
    activeSubmenu.value = null;
    if (restoreFocus && name) void nextTick(() => options.getAnchor(name)?.focus());
  }

  function onParentKeydown(event: KeyboardEvent, name: Name | undefined): boolean {
    if (event.key !== "ArrowRight" || !name) return false;
    event.preventDefault();
    openSubmenu(name);
    return true;
  }

  function onParentFocusin(name: Name | undefined): void {
    if (activeSubmenu.value && name !== activeSubmenu.value) activeSubmenu.value = null;
  }

  function onParentMouseover(name: Name | undefined): void {
    if (name) openSubmenuOnHover(name);
    else if (activeSubmenu.value) activeSubmenu.value = null;
  }

  function onSubmenuKeydown(event: KeyboardEvent, allowArrowLeft = true): boolean {
    if (event.key !== "Escape" && (event.key !== "ArrowLeft" || !allowArrowLeft)) return false;
    event.preventDefault();
    event.stopPropagation();
    closeSubmenu(true);
    return true;
  }

  watch(options.parentOpen, (open) => {
    if (!open) activeSubmenu.value = null;
  });

  return {
    activeSubmenu,
    submenuElement,
    submenuAnchor,
    submenuOpen,
    submenuStyles,
    openSubmenu,
    openSubmenuOnHover,
    closeSubmenu,
    onParentKeydown,
    onParentFocusin,
    onParentMouseover,
    onSubmenuKeydown,
  };
}
