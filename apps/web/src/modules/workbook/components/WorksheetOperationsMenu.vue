<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  EyeOff,
  Grid2X2Plus,
  LockKeyhole,
  Palette,
  Pencil,
  Pin,
  Sheet,
  Trash2,
} from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch, type ComponentPublicInstance } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import type { Sheet as WorkbookSheet, SheetProperties } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import SheetTabColorPanel from "./SheetTabColorPanel.vue";

const props = withDefaults(
  defineProps<{
    sheets: readonly WorkbookSheet[];
    activeSheetId: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);
const emit = defineEmits<{
  add: [];
  duplicate: [sheetId: string];
  rename: [payload: { sheetId: string; name: string }];
  move: [payload: { sheetId: string; toIndex: number }];
  delete: [sheetId: string];
  updateProperties: [payload: { sheetId: string; patch: Partial<SheetProperties> }];
  restore: [sheetId: string];
}>();

const { t } = useAppI18n();
const triggerRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const triggerElement = computed(() => triggerRef.value?.rootElement ?? null);
const isDisabled = computed(() => props.disabled);
const activeSheet = computed(() => props.sheets.find((sheet) => sheet.id === props.activeSheetId));
const visibleSheets = computed(() => props.sheets.filter((sheet) => !sheet.properties.hidden));
const hiddenSheets = computed(() => props.sheets.filter((sheet) => sheet.properties.hidden));
const colorPanelOpen = ref(false);
const renameDialogOpen = ref(false);
const renameValue = ref("");
const renameInputRef = ref<ComponentPublicInstance | null>(null);
const unhideDialogOpen = ref(false);
const menuId = `worksheet-operations-menu-${useId().replaceAll(":", "")}`;

const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: triggerElement,
  menuSurfaceRef,
  disabled: isDisabled,
});

function closeMenu(restoreFocus = true): void {
  dismiss("programmatic", restoreFocus);
}

function activeIndexInGroup(direction: -1 | 1): number | undefined {
  const sheet = activeSheet.value;
  if (!sheet) return undefined;
  const group = visibleSheets.value.filter(
    (entry) => entry.properties.pinned === sheet.properties.pinned,
  );
  const target = group[group.findIndex((entry) => entry.id === sheet.id) + direction];
  return target ? props.sheets.indexOf(target) : undefined;
}

const canMoveLeft = computed(() => activeIndexInGroup(-1) !== undefined);
const canMoveRight = computed(() => activeIndexInGroup(1) !== undefined);
const canHideOrDelete = computed(() =>
  Boolean(
    activeSheet.value && !activeSheet.value.properties.hidden && visibleSheets.value.length > 1,
  ),
);

function addSheet(): void {
  if (props.disabled) return;
  closeMenu();
  emit("add");
}

function duplicateSheet(): void {
  if (props.disabled || !activeSheet.value) return;
  closeMenu();
  emit("duplicate", activeSheet.value.id);
}

function openRename(): void {
  if (props.disabled || !activeSheet.value) return;
  closeMenu(false);
  renameValue.value = activeSheet.value.name;
  renameDialogOpen.value = true;
  void nextTick(() => renameInputRef.value?.$el.querySelector("input")?.focus());
}

function confirmRename(): void {
  const sheet = activeSheet.value;
  const name = renameValue.value.trim();
  if (!props.disabled && sheet && name && name !== sheet.name) {
    emit("rename", { sheetId: sheet.id, name });
  }
  renameDialogOpen.value = false;
  void nextTick(() => triggerElement.value?.focus());
}

function closeRename(): void {
  renameDialogOpen.value = false;
  void nextTick(() => triggerElement.value?.focus());
}

function moveSheet(direction: -1 | 1): void {
  const sheet = activeSheet.value;
  const toIndex = activeIndexInGroup(direction);
  if (props.disabled || !sheet || toIndex === undefined) return;
  closeMenu();
  emit("move", { sheetId: sheet.id, toIndex });
}

function updateActiveProperties(patch: Partial<SheetProperties>): void {
  if (props.disabled || !activeSheet.value || (patch.hidden === true && !canHideOrDelete.value))
    return;
  closeMenu();
  emit("updateProperties", { sheetId: activeSheet.value.id, patch });
}

function openColorPanel(): void {
  if (props.disabled || !activeSheet.value) return;
  closeMenu(false);
  colorPanelOpen.value = true;
}

function closeColorPanel(
  reason: "escape" | "outside-pointer" | "outside-focus" | "programmatic",
  restoreFocus: boolean,
): void {
  colorPanelOpen.value = false;
  if (reason === "outside-pointer" || reason === "outside-focus") return;
  else if (restoreFocus) void nextTick(() => triggerElement.value?.focus());
}

function applyTabColor(value: string | null): void {
  colorPanelOpen.value = false;
  updateActiveProperties({ tabColor: value?.toUpperCase() ?? undefined });
}

function openUnhideDialog(): void {
  if (props.disabled || hiddenSheets.value.length === 0) return;
  closeMenu(false);
  unhideDialogOpen.value = true;
}

function restoreSheet(sheetId: string): void {
  if (props.disabled || !hiddenSheets.value.some((sheet) => sheet.id === sheetId)) return;
  unhideDialogOpen.value = false;
  emit("restore", sheetId);
  void nextTick(() => triggerElement.value?.focus());
}

function deleteActiveSheet(): void {
  if (props.disabled || !activeSheet.value || !canHideOrDelete.value) return;
  closeMenu();
  emit("delete", activeSheet.value.id);
}

function closeUnhideDialog(): void {
  unhideDialogOpen.value = false;
  void nextTick(() => triggerElement.value?.focus());
}

watch(
  () => [props.activeSheetId, props.disabled],
  () => {
    colorPanelOpen.value = false;
    renameDialogOpen.value = false;
    unhideDialogOpen.value = false;
    closeMenu(false);
  },
);
</script>

<template>
  <div class="worksheet-operations-tool">
    <RibbonMenuButton
      ref="triggerRef"
      :label="t('ribbon.worksheetTools')"
      :text="t('ribbon.worksheetTools')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-ribbon-action="worksheet-operations"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Sheet
    /></RibbonMenuButton>

    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="worksheet-operations-menu"
        :style="floatingStyles"
        :label="t('ribbon.worksheetTools')"
      >
        <MenuItem data-worksheet-action="add" @select="addSheet"
          ><template #icon><Grid2X2Plus :size="15" /></template>{{ t("sheetTabs.add") }}</MenuItem
        >
        <MenuItem
          data-worksheet-action="duplicate"
          :disabled="!activeSheet"
          @select="duplicateSheet"
          ><template #icon><Copy :size="15" /></template
          >{{ t("sheetTabs.duplicateAction") }}</MenuItem
        >
        <MenuItem data-worksheet-action="rename" :disabled="!activeSheet" @select="openRename"
          ><template #icon><Pencil :size="15" /></template
          >{{ t("sheetTabs.renameAction") }}</MenuItem
        >
        <MenuSeparator />
        <MenuItem data-worksheet-action="move-left" :disabled="!canMoveLeft" @select="moveSheet(-1)"
          ><template #icon><ArrowLeft :size="15" /></template
          >{{ t("sheetTabs.moveLeftAction") }}</MenuItem
        >
        <MenuItem
          data-worksheet-action="move-right"
          :disabled="!canMoveRight"
          @select="moveSheet(1)"
          ><template #icon><ArrowRight :size="15" /></template
          >{{ t("sheetTabs.moveRightAction") }}</MenuItem
        >
        <MenuItem
          data-worksheet-action="protect"
          :disabled="!activeSheet"
          @select="
            updateActiveProperties({
              protected: !activeSheet?.properties.protected,
            })
          "
          ><template #icon><LockKeyhole :size="15" /></template
          >{{
            t(
              activeSheet?.properties.protected
                ? "sheetTabs.unprotectAction"
                : "sheetTabs.protectAction",
            )
          }}</MenuItem
        >
        <MenuItem
          data-worksheet-action="tab-color"
          :disabled="!activeSheet"
          @select="openColorPanel"
          ><template #icon><Palette :size="15" /></template
          >{{ t("sheetTabs.tabColorAction") }}</MenuItem
        >
        <MenuItem
          data-worksheet-action="pin"
          :disabled="!activeSheet"
          @select="updateActiveProperties({ pinned: !activeSheet?.properties.pinned })"
          ><template #icon><Pin :size="15" /></template
          >{{
            t(activeSheet?.properties.pinned ? "sheetTabs.unpinAction" : "sheetTabs.pinAction")
          }}</MenuItem
        >
        <MenuSeparator />
        <MenuItem
          data-worksheet-action="hide"
          :disabled="!canHideOrDelete"
          @select="updateActiveProperties({ hidden: true })"
          ><template #icon><EyeOff :size="15" /></template>{{ t("sheetTabs.hideAction") }}</MenuItem
        >
        <MenuItem
          data-worksheet-action="restore"
          :disabled="hiddenSheets.length === 0"
          @select="openUnhideDialog"
          ><template #icon><EyeOff :size="15" /></template
          >{{ t("sheetTabs.restoreAction") }}</MenuItem
        >
        <MenuSeparator />
        <MenuItem
          danger
          data-worksheet-action="delete"
          :disabled="!canHideOrDelete"
          @select="deleteActiveSheet"
          ><template #icon><Trash2 :size="15" /></template
          >{{ t("sheetTabs.deleteAction") }}</MenuItem
        >
      </MenuSurface>
    </Teleport>

    <SheetTabColorPanel
      :anchor="triggerElement"
      :open="colorPanelOpen"
      :value="activeSheet?.properties.tabColor"
      @close="closeColorPanel"
      @apply="applyTabColor"
    />

    <Dialog
      :visible="renameDialogOpen"
      :header="t('sheetTabs.renameAction')"
      :confirm-btn="{
        content: t('cellFormat.confirm'),
        disabled: !renameValue.trim(),
      }"
      :cancel-btn="t('persistence.cancel')"
      :close-on-overlay-click="false"
      :confirm-on-enter="true"
      width="min(360px, calc(100vw - 32px))"
      @confirm="confirmRename"
      @close="closeRename"
    >
      <TInput
        ref="renameInputRef"
        v-model="renameValue"
        :aria-label="t('sheetTabs.renameAction')"
        data-worksheet-rename-input
      />
    </Dialog>

    <Dialog
      :visible="unhideDialogOpen"
      :header="t('sheetTabs.hiddenSheets')"
      :footer="false"
      width="min(360px, calc(100vw - 32px))"
      @close="closeUnhideDialog"
    >
      <div class="worksheet-operations-menu__hidden-sheets">
        <button
          v-for="sheet in hiddenSheets"
          :key="sheet.id"
          type="button"
          :aria-label="t('sheetTabs.restoreSheet', { name: sheet.name })"
          @click="restoreSheet(sheet.id)"
        >
          {{ sheet.name }}
        </button>
      </div>
    </Dialog>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.worksheet-operations-tool {
  @include ribbon.tool;
}

.worksheet-operations-menu {
  z-index: var(--idea-layer-menu);
}
.worksheet-operations-menu__hidden-sheets {
  display: grid;
  gap: 4px;
}
.worksheet-operations-menu__hidden-sheets button {
  min-height: 32px;
  padding: 0 10px;
  color: var(--idea-text-primary);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--idea-radius-small);
}
.worksheet-operations-menu__hidden-sheets button:hover {
  background: var(--idea-surface-hover);
  outline: none;
}
</style>
