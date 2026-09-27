<script setup lang="ts">
import { ref } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Dropdown, DropdownItem, DropdownMenu } from "tdesign-vue-next/es/dropdown";
import { ChevronDown } from "lucide-vue-next";
import type { SheetSearchFormat } from "@idea10/core/search";
import WorkbookFindFormatPreview from "./WorkbookFindFormatPreview.vue";
import { useAppI18n } from "../../../shared/i18n";
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
    <Button variant="outline" aria-haspopup="menu" :aria-expanded="formatOpen">
      {{ t("navigation.findFormat") }}
      <template #suffix><ChevronDown :size="14" /></template>
    </Button>
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
