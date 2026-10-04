<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  EyeOff,
  LockKeyhole,
  Palette,
  Pencil,
  Pin,
  Trash2,
} from "lucide-vue-next";
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from "vue";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import { useContextMenu } from "../../../shared/menu/useContextMenu";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import type { Sheet } from "@idea10/core/workbook";
import SheetTabColorPanel from "./SheetTabColorPanel.vue";

const { t } = useAppI18n();
const props = defineProps<{
  sheet: Sheet;
  anchor: FloatingReference | null;
  sheetCount: number;
  sheetIndex: number;
  isOpen: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  canHide?: boolean;
  canDelete?: boolean;
}>();
const emit = defineEmits<{
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
const anchor = computed(() => props.anchor);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const colorActionRef = ref<HTMLElement | null>(null);
const colorPanelOpen = ref(false);
const menuRoot = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const menuOpen = computed(() => props.isOpen);
const dismissibleOpen = computed(() => props.isOpen && !colorPanelOpen.value);
const canMoveLeft = computed(() => props.canMoveLeft ?? props.sheetIndex > 0);
const canMoveRight = computed(() => props.canMoveRight ?? props.sheetIndex < props.sheetCount - 1);
const canHide = computed(() => props.canHide ?? props.sheetCount > 1);
const canDelete = computed(() => props.canDelete ?? props.sheetCount > 1);
const { floatingStyles: menuStyle } = useContextMenu({
  anchor,
  panelRef: menuRoot,
  open: dismissibleOpen,
  focusOpen: menuOpen,
  surfaceRef: menuSurfaceRef,
  offset: 4,
  onDismiss: ({ restoreFocus }) => emit("close", restoreFocus),
});

function menuId(): string {
  return `workbook-sheet-menu-${props.sheet.id}`;
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
  action();
  emit("close", true);
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
  () => {
    colorPanelOpen.value = false;
  },
  { flush: "post", immediate: true },
);
</script>

<template>
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
