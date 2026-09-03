<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRovingFocus } from "../focus/useRovingFocus";

defineProps<{
  label: string;
}>();

const rootElement = ref<HTMLUListElement | null>(null);
const { move: moveRovingFocus } = useRovingFocus();
let itemObserver: MutationObserver | undefined;

function isMenuItem(element: HTMLElement): boolean {
  const role = element.getAttribute("role");
  return role === "menuitem" || role === "menuitemcheckbox" || role === "menuitemradio";
}

function menuItems(): HTMLElement[] {
  const root = rootElement.value;
  if (!root) {
    return [];
  }
  return [...root.children].flatMap((child) => {
    if (!(child instanceof HTMLElement)) {
      return [];
    }
    if (isMenuItem(child)) {
      return [child];
    }
    return [...child.children].filter(
      (nested): nested is HTMLElement => nested instanceof HTMLElement && isMenuItem(nested),
    );
  });
}

function enabledItems(): HTMLElement[] {
  return menuItems().filter((item) => item.getAttribute("aria-disabled") !== "true");
}

function syncTabStop(preferred?: HTMLElement): HTMLElement | undefined {
  const items = menuItems();
  const enabled = items.filter((item) => item.getAttribute("aria-disabled") !== "true");
  const current = enabled.find((item) => item.tabIndex === 0);
  const next = preferred && enabled.includes(preferred) ? preferred : (current ?? enabled[0]);
  for (const item of items) {
    item.tabIndex = item === next ? 0 : -1;
  }
  return next;
}

function focusFirstItem(): void {
  const first = enabledItems()[0];
  syncTabStop(first)?.focus();
}

function focusLastItem(): void {
  const items = enabledItems();
  syncTabStop(items.at(-1))?.focus();
}

function onFocusin(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const item = target.closest<HTMLElement>(
    '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
  );
  if (item && menuItems().includes(item)) {
    syncTabStop(item);
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement
  ) {
    return;
  }
  moveRovingFocus(event, enabledItems());
}

onMounted(() => {
  syncTabStop();
  if (typeof MutationObserver === "undefined" || !rootElement.value) {
    return;
  }
  itemObserver = new MutationObserver(() => syncTabStop());
  itemObserver.observe(rootElement.value, {
    attributeFilter: ["aria-disabled", "role"],
    childList: true,
    subtree: true,
  });
});

onBeforeUnmount(() => itemObserver?.disconnect());

defineExpose({ focusFirstItem, focusLastItem, rootElement });
</script>

<template>
  <ul
    ref="rootElement"
    class="idea-menu-surface"
    role="menu"
    :aria-label="label"
    @contextmenu.prevent
    @focusin="onFocusin"
    @keydown="onKeydown"
  >
    <slot />
  </ul>
</template>

<style scoped lang="scss">
.idea-menu-surface {
  display: grid;
  max-width: calc(100vw - var(--idea-space-4) - var(--idea-space-4));
  max-height: calc(100vh - var(--idea-space-4) - var(--idea-space-4));
  padding: 8px 0;
  margin: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
  background: var(--idea-surface-panel);
  border: 1px solid var(--idea-border-subtle);
  border-radius: var(--idea-radius-default);
  box-shadow: var(--idea-shadow-menu);
}
</style>
