import { ref, type Ref } from "vue";

const ENABLED_ITEM_SELECTOR =
  'button:not(:disabled):not([aria-disabled="true"]), [role="button"]:not([aria-disabled="true"])';

export function useRovingButtonGroup(containerRef: Ref<HTMLElement | null>) {
  const focusedIndex = ref<number | null>(null);

  function getEnabledItems(): HTMLElement[] {
    const container = containerRef.value;
    if (!container) return [];
    return [...container.querySelectorAll<HTMLElement>(ENABLED_ITEM_SELECTOR)];
  }

  function resolveTabIndex(index: number, preferredIndex: number, disabled?: boolean): number {
    if (disabled) return -1;
    const active = focusedIndex.value ?? preferredIndex;
    return index === active ? 0 : -1;
  }

  function onFocusItem(index: number): void {
    focusedIndex.value = index;
  }

  function onGroupFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && containerRef.value?.contains(next)) return;
    focusedIndex.value = null;
  }

  function onGroupKeydown(event: KeyboardEvent): void {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const items = getEnabledItems();
    if (items.length < 2) return;
    const current =
      event.target instanceof HTMLElement
        ? items.findIndex((item) => item === event.target || item.contains(event.target as Node))
        : -1;
    if (current < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  return {
    resolveTabIndex,
    onFocusItem,
    onGroupFocusOut,
    onGroupKeydown,
  };
}
