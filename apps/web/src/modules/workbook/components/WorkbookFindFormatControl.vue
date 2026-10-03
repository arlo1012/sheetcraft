<script setup lang="ts">
import { ref } from "vue";
import { Dropdown, DropdownItem, DropdownMenu } from "tdesign-vue-next/es/dropdown";
import { ChevronDown } from "lucide-vue-next";
import type { SheetSearchFormat } from "@idea10/core/search";
import WorkbookFindFormatPreview from "./WorkbookFindFormatPreview.vue";
import { useAppI18n } from "../../../shared/i18n";
import { vIconAction } from "../../../shared/focus/icon-action";
import type { WorkbookFindFormatMode } from "../workbook-find-types";
defineProps<{ format?: SheetSearchFormat; summary?: string }>();
const emit = defineEmits<{
  pickFormat: [mode: WorkbookFindFormatMode];
  configureFormat: [];
  clearFormat: [];
}>();
const { t } = useAppI18n();
const formatOpen = ref(false);
</script>
<template>
  <WorkbookFindFormatPreview
    :format="format"
    :title="summary"
    :empty-label="t('navigation.findFormatUnset')"
  />
  <Dropdown
    trigger="click"
    placement="bottom-left"
    :min-column-width="180"
    :max-column-width="300"
    :popup-props="{
      zIndex: 2600,
      onVisibleChange: (visible) => (formatOpen = visible),
    }"
  >
    <span
      v-icon-action
      class="workbook-find-format-control__trigger"
      aria-haspopup="menu"
      :aria-expanded="formatOpen"
    >
      {{ t("navigation.findFormat") }}
      <ChevronDown :size="14" aria-hidden="true" />
    </span>
    <template #dropdown>
      <DropdownMenu>
        <DropdownItem @click="emit('configureFormat')">
          <span data-find-format="configure">{{ t("navigation.findCustomFormat") }}</span>
        </DropdownItem>
        <DropdownItem @click="emit('pickFormat', 'fill')">
          <span data-find-format="fill">{{ t("navigation.findFormatFill") }}</span>
        </DropdownItem>
        <DropdownItem @click="emit('pickFormat', 'font')">
          <span data-find-format="font">{{ t("navigation.findFormatFont") }}</span>
        </DropdownItem>
        <DropdownItem @click="emit('pickFormat', 'colors')">
          <span data-find-format="colors">{{ t("navigation.findFormatColors") }}</span>
        </DropdownItem>
        <DropdownItem @click="emit('pickFormat', 'all')">
          <span data-find-format="all">{{ t("navigation.findFormatAll") }}</span>
        </DropdownItem>
        <DropdownItem :disabled="!summary" @click="emit('clearFormat')">
          <span data-find-format="clear">{{ t("navigation.findClearFormat") }}</span>
        </DropdownItem>
      </DropdownMenu>
    </template>
  </Dropdown>
</template>

<style scoped lang="scss">
.workbook-find-format-control__trigger {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  gap: var(--idea-space-1);
  padding: 0 var(--idea-space-3);
  color: var(--idea-text-primary);
  background: var(--idea-surface-panel);
  border: 1px solid var(--idea-border-subtle);
  border-radius: var(--idea-radius-small);
  cursor: pointer;

  &:hover,
  &[aria-expanded="true"] {
    background: var(--idea-surface-hover);
  }
}
</style>
