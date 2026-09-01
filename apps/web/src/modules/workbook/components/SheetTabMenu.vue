<script setup lang="ts">
import { MoreHorizontal } from "lucide-vue-next";
import { nextTick, ref, toRef, watch, type ComponentPublicInstance } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useRovingFocus } from "../../../shared/focus/useRovingFocus";
import { useAppI18n } from "../../../shared/i18n";
import type { Sheet } from "@idea10/core/workbook";

const { t } = useAppI18n();

const props = defineProps<{
  sheet: Sheet;
  sheetCount: number;
  isOpen: boolean;
  position: { left: number; bottom: number };
}>();

const emit = defineEmits<{
  toggle: [];
  rename: [];
  delete: [];
  close: [restoreFocus: boolean];
}>();

const trigger = ref<HTMLButtonElement | null>(null);
const menuRoot = ref<HTMLElement | null>(null);
const isOpen = toRef(props, "isOpen");
const { dismiss } = useDismissibleFloatingPanel(trigger, menuRoot, isOpen, {
  onDismiss: ({ restoreFocus }) => emit("close", restoreFocus),
});
const { move: moveRovingFocus } = useRovingFocus();

function setMenuRoot(element: Element | ComponentPublicInstance | null): void {
  menuRoot.value = element instanceof HTMLElement ? element : null;
}

function menuId(): string {
  return `workbook-sheet-menu-${props.sheet.id}`;
}

function focusTrigger(): void {
  trigger.value?.focus();
}

function getTriggerRect(): DOMRect | undefined {
  return trigger.value?.getBoundingClientRect();
}

function focusFirstMenuItem(): void {
  menuRoot.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
}

function onMenuKeydown(event: KeyboardEvent): void {
  const items = Array.from(
    menuRoot.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
  );
  moveRovingFocus(event, items);
}

watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) {
      void nextTick(focusFirstMenuItem);
    }
  },
  { flush: "post" },
);

defineExpose({ dismiss, focusTrigger, getTriggerRect });
</script>

<template>
  <button
    ref="trigger"
    class="workbook-sheet-tabs__menu-trigger"
    type="button"
    :aria-label="t('sheetTabs.menu', { name: sheet.name })"
    aria-haspopup="menu"
    :aria-controls="isOpen ? menuId() : undefined"
    :aria-expanded="isOpen"
    @click="emit('toggle')"
  >
    <MoreHorizontal :size="15" aria-hidden="true" />
  </button>
  <Teleport to="body">
    <div
      v-if="isOpen"
      :id="menuId()"
      :ref="setMenuRoot"
      class="workbook-sheet-tabs__menu"
      role="menu"
      :aria-label="t('sheetTabs.menu', { name: sheet.name })"
      :style="{ left: `${position.left}px`, bottom: `${position.bottom}px` }"
      @keydown="onMenuKeydown"
    >
      <button type="button" role="menuitem" @click="emit('rename')">
        {{ t("sheetTabs.renameAction") }}
      </button>
      <button type="button" role="menuitem" :disabled="sheetCount === 1" @click="emit('delete')">
        {{ t("sheetTabs.deleteAction") }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.workbook-sheet-tabs {
  &__menu-trigger {
    display: grid;
    width: 24px;
    min-width: 24px;
    place-items: center;
    padding: 0;
    overflow: hidden;
    background: transparent;
    border: 0;
    color: var(--idea-text-secondary);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;

    &[aria-expanded="true"],
    &:hover,
    &:focus-visible {
      background: var(--idea-surface-hover);
      outline: none;
    }
  }

  &__menu {
    position: fixed;
    z-index: 80;
    display: grid;
    min-width: 132px;
    padding: 4px;
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-control);
    border-radius: 4px;
    box-shadow: var(--idea-shadow-floating);

    button {
      min-height: 28px;
      padding: 0 8px;
      background: transparent;
      border: 0;
      border-radius: 3px;
      color: var(--idea-text-primary);
      font: inherit;
      text-align: left;
      white-space: nowrap;

      &:not(:disabled) {
        cursor: pointer;
      }

      &:hover:not(:disabled),
      &:focus-visible:not(:disabled) {
        background: var(--idea-surface-hover);
        outline: none;
      }

      &:disabled {
        color: var(--idea-text-disabled);
        cursor: not-allowed;
      }
    }
  }
}
</style>
