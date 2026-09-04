<script setup lang="ts">
import { MoreHorizontal } from "lucide-vue-next";
import { computed, nextTick, ref, toRef, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import type { Sheet } from "@idea10/core/workbook";

const { t } = useAppI18n();

const props = defineProps<{
  sheet: Sheet;
  sheetCount: number;
  sheetIndex: number;
  isOpen: boolean;
  position: { left: number; bottom: number };
}>();

const emit = defineEmits<{
  toggle: [];
  duplicate: [];
  rename: [];
  moveLeft: [];
  moveRight: [];
  delete: [];
  close: [restoreFocus: boolean];
}>();

const trigger = ref<HTMLButtonElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRoot = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const isOpen = toRef(props, "isOpen");
const { dismiss } = useDismissibleFloatingPanel(trigger, menuRoot, isOpen, {
  onDismiss: ({ restoreFocus }) => emit("close", restoreFocus),
});

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
  menuSurfaceRef.value?.focusFirstItem();
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
    <MenuSurface
      v-if="isOpen"
      :id="menuId()"
      ref="menuSurfaceRef"
      class="workbook-sheet-tabs__menu"
      :label="t('sheetTabs.menu', { name: sheet.name })"
      :style="{ left: `${position.left}px`, bottom: `${position.bottom}px` }"
    >
      <MenuItem @select="emit('duplicate')">
        {{ t("sheetTabs.duplicateAction") }}
      </MenuItem>
      <MenuItem @select="emit('rename')">
        {{ t("sheetTabs.renameAction") }}
      </MenuItem>
      <MenuItem :disabled="sheetIndex === 0" @select="emit('moveLeft')">
        {{ t("sheetTabs.moveLeftAction") }}
      </MenuItem>
      <MenuItem :disabled="sheetIndex === sheetCount - 1" @select="emit('moveRight')">
        {{ t("sheetTabs.moveRightAction") }}
      </MenuItem>
      <MenuItem :disabled="sheetCount === 1" danger @select="emit('delete')">
        {{ t("sheetTabs.deleteAction") }}
      </MenuItem>
    </MenuSurface>
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
    min-width: 132px;
  }
}
</style>
