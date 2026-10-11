<script setup lang="ts">
import { Settings } from "lucide-vue-next";
import { vIconAction } from "../focus/icon-action";
import { useAppI18n } from "../i18n";
import { fontSettingsVisible } from "./font-settings";

const emit = defineEmits<{ open: [] }>();
const { t } = useAppI18n();
function open(): void {
  emit("open");
  fontSettingsVisible.value = true;
}
</script>

<template>
  <span
    v-icon-action
    class="font-settings-action"
    :aria-label="t('format.fontSettings')"
    :title="t('format.fontSettings')"
    aria-haspopup="dialog"
    @click="open"
    ><Settings class="sheetcraft-action-icon" aria-hidden="true"
  /></span>
</template>

<style scoped lang="scss">
.font-settings-action {
  flex: none;
  width: 28px;
  height: 28px;
  color: var(--sheetcraft-text-secondary);
}
</style>
