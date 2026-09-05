<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Copy,
  EyeOff,
  LockKeyhole,
  Palette,
  Pencil,
  Pin,
  Trash2,
} from "lucide-vue-next";
import { computed, nextTick, ref, toRef, watch, type ComponentPublicInstance } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import type { Sheet } from "@idea10/core/workbook";
import SheetTabColorPanel from "./SheetTabColorPanel.vue";

const { t } = useAppI18n();
const props = defineProps<{
  sheet: Sheet;
  sheetCount: number;
  sheetIndex: number;
  isOpen: boolean;
  position: { left: number; bottom: number };
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  canHide?: boolean;
  canDelete?: boolean;
}>();
const emit = defineEmits<{
  toggle: [];
  duplicate: [];
  rename: [];
  moveLeft: [];
  moveRight: [];
  delete: [];
  protect: [value: boolean];
  pin: [value: boolean];
  hide: [];
  tabColor: [value: string | null];
  close: [restoreFocus: boolean];
}>();
const trigger = ref<HTMLButtonElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const colorActionRef = ref<HTMLElement | null>(null);
const colorPanelOpen = ref(false);
const menuRoot = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const isOpen = toRef(props, "isOpen");
const dismissibleOpen = computed(() => props.isOpen && !colorPanelOpen.value);
const canMoveLeft = computed(() => props.canMoveLeft ?? props.sheetIndex > 0);
const canMoveRight = computed(() => props.canMoveRight ?? props.sheetIndex < props.sheetCount - 1);
const canHide = computed(() => props.canHide ?? props.sheetCount > 1);
const canDelete = computed(() => props.canDelete ?? props.sheetCount > 1);
const menuStyle = computed(() => ({
  left: `${props.position.left}px`,
  bottom: `${props.position.bottom}px`,
  maxHeight: `min(360px, calc(100vh - ${props.position.bottom + 8}px))`,
}));
const { dismiss } = useDismissibleFloatingPanel(trigger, menuRoot, dismissibleOpen, {
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
function setColorAction(instance: Element | ComponentPublicInstance | null): void {
  if (instance instanceof HTMLElement) {
    colorActionRef.value = instance;
    return;
  }
  colorActionRef.value =
    instance && "$el" in instance && instance.$el instanceof HTMLElement ? instance.$el : null;
}
function closeAfter(action: () => void): void {
  emit("close", true);
  action();
}
function openColorPanel(): void {
  colorPanelOpen.value = true;
}
function closeColorPanel(
  reason: "escape" | "outside-pointer" | "outside-focus" | "programmatic",
  restoreFocus: boolean,
): void {
  colorPanelOpen.value = false;
  if (reason === "outside-pointer" || reason === "outside-focus") {
    emit("close", false);
    return;
  }
  if (restoreFocus) void nextTick(() => colorActionRef.value?.focus());
}
function applyTabColor(value: string | null): void {
  colorPanelOpen.value = false;
  closeAfter(() => emit("tabColor", value));
}

watch(
  () => props.isOpen,
  (open) => {
    colorPanelOpen.value = false;
    if (open) {
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
    <ChevronDown :size="12" aria-hidden="true" />
  </button>
  <Teleport to="body"
    ><MenuSurface
      v-if="isOpen"
      :id="menuId()"
      ref="menuSurfaceRef"
      class="workbook-sheet-tabs__menu"
      :label="t('sheetTabs.menu', { name: sheet.name })"
      :style="menuStyle"
    >
      <MenuItem data-sheet-tab-action="duplicate" @select="closeAfter(() => emit('duplicate'))"
        ><template #icon><Copy :size="15" /></template
        >{{ t("sheetTabs.duplicateAction") }}</MenuItem
      >
      <MenuItem data-sheet-tab-action="rename" @select="closeAfter(() => emit('rename'))"
        ><template #icon><Pencil :size="15" /></template>{{ t("sheetTabs.renameAction") }}</MenuItem
      >
      <MenuItem
        data-sheet-tab-action="protect"
        @select="closeAfter(() => emit('protect', !sheet.properties.protected))"
        ><template #icon><LockKeyhole :size="15" /></template
        >{{
          t(sheet.properties.protected ? "sheetTabs.unprotectAction" : "sheetTabs.protectAction")
        }}</MenuItem
      >
      <MenuItem :ref="setColorAction" data-sheet-tab-action="tab-color" @select="openColorPanel"
        ><template #icon><Palette :size="15" /></template
        >{{ t("sheetTabs.tabColorAction") }}</MenuItem
      >
      <MenuSeparator />
      <MenuItem
        data-sheet-tab-action="pin"
        @select="closeAfter(() => emit('pin', !sheet.properties.pinned))"
        ><template #icon><Pin :size="15" /></template
        >{{
          t(sheet.properties.pinned ? "sheetTabs.unpinAction" : "sheetTabs.pinAction")
        }}</MenuItem
      >
      <MenuItem
        data-sheet-tab-action="move-left"
        :disabled="!canMoveLeft"
        @select="closeAfter(() => emit('moveLeft'))"
        ><template #icon><ArrowLeft :size="15" /></template
        >{{ t("sheetTabs.moveLeftAction") }}</MenuItem
      >
      <MenuItem
        data-sheet-tab-action="move-right"
        :disabled="!canMoveRight"
        @select="closeAfter(() => emit('moveRight'))"
        ><template #icon><ArrowRight :size="15" /></template
        >{{ t("sheetTabs.moveRightAction") }}</MenuItem
      >
      <MenuItem
        data-sheet-tab-action="hide"
        :disabled="!canHide"
        @select="closeAfter(() => emit('hide'))"
        ><template #icon><EyeOff :size="15" /></template
        >{{
          t(sheet.properties.hidden ? "sheetTabs.restoreAction" : "sheetTabs.hideAction")
        }}</MenuItem
      >
      <MenuSeparator />
      <MenuItem
        danger
        data-sheet-tab-action="delete"
        :disabled="!canDelete"
        @select="closeAfter(() => emit('delete'))"
        ><template #icon><Trash2 :size="15" /></template>{{ t("sheetTabs.deleteAction") }}</MenuItem
      >
    </MenuSurface></Teleport
  >
  <SheetTabColorPanel
    :anchor="colorActionRef"
    :open="colorPanelOpen"
    :value="sheet.properties.tabColor"
    @close="closeColorPanel"
    @apply="applyTabColor"
  />
</template>

<style scoped lang="scss">
.workbook-sheet-tabs {
  &__menu-trigger {
    display: grid;
    flex: 0 0 22px;
    width: 22px;
    min-width: 22px;
    place-items: center;
    padding: 0;
    background: transparent;
    border: 0;
    color: var(--idea-text-secondary);
    cursor: pointer;
    &[aria-expanded="true"],
    &:hover,
    &:focus-visible {
      background: var(--idea-surface-hover);
      outline: none;
    }
    &:focus-visible {
      outline: 1px solid var(--idea-action-primary);
      outline-offset: -2px;
    }
  }
  &__menu {
    position: fixed;
    z-index: 80;
    min-width: 176px;
  }
}
</style>
