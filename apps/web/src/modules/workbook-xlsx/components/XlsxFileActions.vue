<script setup lang="ts">
import { Download, Upload } from "lucide-vue-next";
import { Button } from "tdesign-vue-next";
import { ref } from "vue";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{ busy: boolean; disabled: boolean }>();
const emit = defineEmits<{ importXlsx: [file: File]; exportXlsx: [] }>();
const { t } = useAppI18n();
const input = ref<HTMLInputElement>();

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (file) emit("importXlsx", file);
}
</script>

<template>
  <div class="xlsx-file-actions" data-xlsx-actions>
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
    <Button
      size="small"
      variant="outline"
      :disabled="disabled || busy"
      :loading="busy"
      data-xlsx-import
      @click="input?.click()"
    >
      <template #icon><Upload :size="14" /></template>
      {{ t("xlsx.actions.import") }}
    </Button>
    <Button
      size="small"
      variant="outline"
      :disabled="disabled || busy"
      data-xlsx-export
      @click="emit('exportXlsx')"
    >
      <template #icon><Download :size="14" /></template>
      {{ t("xlsx.actions.export") }}
    </Button>
  </div>
</template>

<style scoped lang="scss">
.xlsx-file-actions {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
</style>
