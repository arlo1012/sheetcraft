<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useSlots } from "vue";
import { useRovingFocus } from "../focus/useRovingFocus";

withDefaults(
  defineProps<{
    label: string;
    bodyScrollable?: boolean;
  }>(),
  { bodyScrollable: true },
);

const slots = useSlots();
const hasStructuredContent = computed(() => Boolean(slots.header || slots.body || slots.footer));
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
  if (!hasStructuredContent.value) {
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
  return [
    ...root.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
    ),
  ].filter((item) => isMenuItem(item) && item.closest('[role="menu"]') === root);
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
  if (event.defaultPrevented) {
    return;
  }
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
    :class="{
      'idea-menu-surface--structured': hasStructuredContent,
      'idea-menu-surface--contained-body': !bodyScrollable,
    }"
    role="menu"
    :aria-label="label"
    @contextmenu.prevent
    @focusin="onFocusin"
    @keydown="onKeydown"
  >
    <template v-if="hasStructuredContent">
      <li v-if="$slots.header" class="idea-menu-surface__header" role="none">
        <slot name="header" />
      </li>
      <li v-if="$slots.body" class="idea-menu-surface__body" role="none">
        <slot name="body" />
      </li>
      <li v-if="$slots.footer" class="idea-menu-surface__footer" role="none">
        <ul class="idea-menu-surface__footer-list" role="presentation">
          <slot name="footer" />
        </ul>
      </li>
    </template>
    <slot v-else />
  </ul>
</template>

<style scoped lang="scss">
@use "../option-list/option-list";

.idea-menu-surface {
  @include option-list.scrollbar;

  display: grid;
  width: max-content;
  max-width: calc(100vw - var(--idea-space-4) - var(--idea-space-4));
  max-height: calc(100vh - var(--idea-space-4) - var(--idea-space-4));
  padding: var(--idea-menu-padding);
  margin: 0;
  z-index: var(--idea-layer-menu);
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
  background: var(--idea-surface-panel);
  border: 1px solid var(--idea-border-subtle);
  outline: none;
  border-radius: var(--idea-radius-default);
  box-shadow: var(--idea-shadow-menu);

  &--structured {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__header,
  &__footer {
    flex: 0 0 auto;
  }

  &__footer-list {
    padding: 0;
    margin: 0;
    list-style: none;
  }

  &__body {
    @include option-list.scrollbar;

    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  &--contained-body > &__body {
    display: grid;
    flex: 1 1 auto;
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden;
  }
}
</style>
