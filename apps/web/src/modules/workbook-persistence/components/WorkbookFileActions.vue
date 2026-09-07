<script setup lang="ts">
import { ChevronDown, Download, RotateCcw, Save, Upload } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import type { WorkbookPersistenceStatus } from "../useWorkbookPersistence";

const props = defineProps<{ status: WorkbookPersistenceStatus; disabled: boolean }>();
const emit = defineEmits<{
  save: [];
  importJson: [file: File];
  exportJson: [];
  reload: [];
}>();
defineSlots<{
  "extra-menu-actions"?: (props: { close: () => void }) => unknown;
}>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed(() => menuSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const opened = ref(false);
const menuId = `workbook-file-menu-${useId().replaceAll(":", "")}`;
const statusKeys: Record<WorkbookPersistenceStatus, MessageKey> = {
  loading: "persistence.loading",
  idle: "persistence.idle",
  pending: "persistence.pending",
  saving: "persistence.saving",
  saved: "persistence.saved",
  error: "persistence.saveError",
};
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuRef, open, {
  offset: 4,
  onDismiss: () => {
    open.value = false;
  },
});

function openMenu(focus: "first" | "last" = "first"): void {
  if (props.disabled) return;
  opened.value = true;
  open.value = true;
  void nextTick(() =>
    focus === "last"
      ? menuSurfaceRef.value?.focusLastItem()
      : menuSurfaceRef.value?.focusFirstItem(),
  );
}

function toggleMenu(): void {
  if (open.value) dismiss("programmatic", true);
  else openMenu();
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  openMenu(event.key === "ArrowDown" ? "first" : "last");
}

function select(action: "save" | "exportJson" | "reload"): void {
  closeMenu();
  if (action === "save") emit("save");
  else if (action === "exportJson") emit("exportJson");
  else emit("reload");
}

function chooseFile(): void {
  closeMenu();
  fileInputRef.value?.click();
}

function closeMenu(): void {
  dismiss("programmatic", true);
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) emit("importJson", file);
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) dismiss("programmatic", false);
  },
);
</script>

<template>
  <div class="workbook-file-actions">
    <button
      ref="triggerRef"
      type="button"
      class="workbook-file-actions__trigger"
      :disabled="disabled"
      :aria-label="t('persistence.fileActions')"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      data-workbook-file="menu"
      @click="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      {{ t("persistence.file") }}
      <ChevronDown :size="12" aria-hidden="true" />
    </button>
    <span
      class="workbook-file-actions__status"
      :class="{ 'workbook-file-actions__status--error': status === 'error' }"
      :title="t('persistence.localOnly')"
      role="status"
      aria-live="polite"
      :data-save-status="status"
      >{{ t(statusKeys[status]) }}</span
    >
    <input
      ref="fileInputRef"
      type="file"
      accept=".json,application/json"
      hidden
      tabindex="-1"
      :aria-label="t('persistence.importJson')"
      data-workbook-file="input"
      @change="onFileChange"
    />
  </div>
  <Teleport to="body">
    <MenuSurface
      v-if="opened"
      v-show="open"
      :id="menuId"
      ref="menuSurfaceRef"
      class="workbook-file-menu"
      :style="floatingStyles"
      :label="t('persistence.fileActions')"
      :aria-hidden="!open"
    >
      <MenuItem data-workbook-file="save" @select="select('save')">
        <template #icon><Save :size="15" /></template>
        {{ t("persistence.save") }}
      </MenuItem>
      <MenuSeparator />
      <MenuItem data-workbook-file="import" @select="chooseFile">
        <template #icon><Upload :size="15" /></template>
        {{ t("persistence.importJson") }}
      </MenuItem>
      <MenuItem data-workbook-file="export" @select="select('exportJson')">
        <template #icon><Download :size="15" /></template>
        {{ t("persistence.exportJson") }}
      </MenuItem>
      <slot name="extra-menu-actions" :close="closeMenu" />
      <MenuSeparator />
      <MenuItem data-workbook-file="reload" @select="select('reload')">
        <template #icon><RotateCcw :size="15" /></template>
        {{ t("persistence.reloadSaved") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.workbook-file-actions {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;

  &__trigger {
    display: inline-flex;
    height: 100%;
    align-items: center;
    gap: 3px;
    padding: 0 8px;
    color: var(--idea-text-primary);
    font: inherit;
    font-size: 12px;
    white-space: nowrap;
    cursor: pointer;
    background: transparent;
    border: 0;

    &:hover:not(:disabled) {
      background: var(--idea-surface-hover);
    }
    &:focus-visible {
      outline: 1px solid var(--idea-action-primary);
      outline-offset: -2px;
    }
    &:disabled {
      color: var(--idea-text-disabled);
      cursor: default;
    }
  }

  &__status {
    overflow: hidden;
    color: var(--idea-text-secondary);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;

    &--error {
      color: var(--idea-status-error);
    }
  }
}

.workbook-file-menu {
  position: fixed;
  z-index: 80;
  min-width: 210px;
}
</style>
