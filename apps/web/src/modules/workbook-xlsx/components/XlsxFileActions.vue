<script setup lang="ts">
import { Download, Upload } from "lucide-vue-next";
import { ref } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";

const props = defineProps<{ busy: boolean; disabled: boolean }>();
const emit = defineEmits<{
  close: [];
  importXlsx: [file: File];
  exportXlsx: [];
}>();
const { t } = useAppI18n();
const input = ref<HTMLInputElement>();

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (file) emit("importXlsx", file);
}

function chooseFile(): void {
  if (props.disabled || props.busy) return;
  emit("close");
  input.value?.click();
}

function exportFile(): void {
  if (props.disabled || props.busy) return;
  emit("close");
  emit("exportXlsx");
}
</script>

<template>
  <li hidden role="none">
    <input
      ref="input"
      type="file"
      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      hidden
      tabindex="-1"
      :aria-label="t('xlsx.actions.selectFile')"
      data-xlsx-file-input
      @change="onFileChange"
    />
  </li>
  <MenuSeparator data-xlsx-actions />
  <MenuItem :disabled="disabled || busy" data-xlsx-import @select="chooseFile">
    <template #icon><Upload :size="15" /></template>
    {{ t("xlsx.actions.import") }}
  </MenuItem>
  <MenuItem :disabled="disabled || busy" data-xlsx-export @select="exportFile">
    <template #icon><Download :size="15" /></template>
    {{ t("xlsx.actions.export") }}
  </MenuItem>
</template>
