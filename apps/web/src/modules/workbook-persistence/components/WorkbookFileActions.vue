<script setup lang="ts">
import { ChevronDown, Download, FilePlus2, Info, RotateCcw, Save, Upload } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { Tooltip as TTooltip } from "tdesign-vue-next/es/tooltip";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import type {
  WorkbookPersistenceError,
  WorkbookPersistenceStatus,
} from "../useWorkbookPersistence";
import type { WorkbookFileFeedback } from "../useWorkbookFileActions";

const props = defineProps<{
  status: WorkbookPersistenceStatus;
  disabled: boolean;
  error?: WorkbookPersistenceError;
  feedback?: WorkbookFileFeedback;
  canReset?: boolean;
}>();
const emit = defineEmits<{
  save: [];
  importJson: [file: File];
  exportJson: [];
  reload: [];
  reset: [];
}>();
defineSlots<{
  "extra-menu-actions"?: (props: { close: () => void }) => unknown;
}>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
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
const errorKeys: Record<WorkbookPersistenceError, MessageKey> = {
  unavailable: "persistence.unavailable",
  "invalid-record": "persistence.invalidSnapshot",
  "invalid-snapshot": "persistence.invalidSnapshot",
  conflict: "persistence.conflict",
  quota: "persistence.quota",
};
const notice = computed(() => {
  if (props.feedback?.error) return props.feedback.key;
  return props.error ? errorKeys[props.error] : undefined;
});
const noticeLabel = computed(() => {
  if (notice.value === "persistence.finishEditing") return t("persistence.finishEditingShort");
  return t(props.feedback?.error ? "persistence.fileActionError" : "persistence.autosavePaused");
});
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  offset: 4,
  onOpen: () => {
    opened.value = true;
  },
});

function select(action: "save" | "exportJson" | "reload" | "reset"): void {
  closeMenu();
  if (action === "save") emit("save");
  else if (action === "exportJson") emit("exportJson");
  else if (action === "reset") emit("reset");
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
    <TTooltip v-if="notice" :content="t(notice)" placement="bottom-left">
      <span
        class="workbook-file-actions__notice"
        role="status"
        :aria-label="t(notice)"
        :data-save-status="status"
        data-workbook-file="feedback"
      >
        <Info :size="14" aria-hidden="true" />
        {{ noticeLabel }}
      </span>
    </TTooltip>
    <button
      v-if="canReset"
      type="button"
      class="workbook-file-actions__trigger"
      :disabled="disabled"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      data-workbook-file="recover"
      @click="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      {{ t("persistence.recoveryActions") }}
    </button>
    <span
      v-if="!notice"
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
      <template v-if="canReset">
        <MenuItem data-workbook-file="reload" @select="select('reload')">
          <template #icon><RotateCcw :size="15" /></template>
          {{ t("persistence.retryOpen") }}
        </MenuItem>
        <MenuItem data-workbook-file="import" @select="chooseFile">
          <template #icon><Upload :size="15" /></template>
          {{ t("persistence.importBackup") }}
        </MenuItem>
        <MenuItem danger data-workbook-file="reset" @select="select('reset')">
          <template #icon><FilePlus2 :size="15" /></template>
          {{ t("persistence.resetBlank") }}
        </MenuItem>
        <MenuSeparator />
      </template>
      <MenuItem v-if="!canReset" data-workbook-file="save" @select="select('save')">
        <template #icon><Save :size="15" /></template>
        {{ t("persistence.save") }}
      </MenuItem>
      <MenuSeparator v-if="!canReset" />
      <MenuItem v-if="!canReset" data-workbook-file="import" @select="chooseFile">
        <template #icon><Upload :size="15" /></template>
        {{ t("persistence.importJson") }}
      </MenuItem>
      <MenuItem data-workbook-file="export" @select="select('exportJson')">
        <template #icon><Download :size="15" /></template>
        {{ t("persistence.exportJson") }}
      </MenuItem>
      <slot name="extra-menu-actions" :close="closeMenu" />
      <MenuSeparator v-if="!canReset" />
      <MenuItem v-if="!canReset" data-workbook-file="reload" @select="select('reload')">
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
  font-size: var(--idea-font-size-body-medium);
  line-height: var(--idea-line-height-body-medium);

  &__trigger {
    display: inline-flex;
    height: 100%;
    align-items: center;
    gap: 3px;
    padding: 0 8px;
    color: var(--idea-text-primary);
    font: inherit;
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
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

  &__notice {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--idea-status-warning);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
    white-space: nowrap;
  }

  &__status {
    overflow: hidden;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
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
