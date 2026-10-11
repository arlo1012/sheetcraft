<script setup lang="ts">
import { computed } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { useAppI18n } from "../i18n";
import { localFontAccess } from "./local-fonts";

const { t } = useAppI18n();
const { availability, loading, status, families, load } = localFontAccess;
const message = computed(() => {
  if (availability.value === "insecure") return t("format.localFontsInsecure");
  if (availability.value === "unsupported") return t("format.localFontsUnsupported");
  if (status.value === "denied") return t("format.localFontsDenied");
  if (status.value === "failed") return t("format.localFontsFailed");
  if (status.value === "empty") return t("format.localFontsEmpty");
  if (status.value === "loaded")
    return t("format.localFontsLoaded", { count: families.value.length });
  return t("format.localFontsHint");
});
</script>

<template>
  <div class="local-font-access" data-local-font-access>
    <TButton
      size="small"
      variant="text"
      theme="primary"
      :loading="loading"
      :disabled="availability !== 'available'"
      @click="load"
      >{{
        t(status === "loaded" ? "format.localFontsRefresh" : "format.localFontsAction")
      }}</TButton
    >
    <span class="local-font-access__hint" role="status">{{ message }}</span>
    <span class="local-font-access__hint">{{ t("format.fontFallbackHint") }}</span>
  </div>
</template>

<style scoped lang="scss">
.local-font-access {
  display: grid;
  justify-items: start;
  gap: 4px;
  padding: 6px 8px;
  min-width: 0;
  &__hint {
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
